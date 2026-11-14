import { describe, it, expect } from "vitest";
import { parseProperties, serializeProperties, removeProperty, validateServerConfigXml, type ConfigProp } from "../serverconfig";

const XML = `<?xml version="1.0"?>
<ServerSettings>
  <property name="ServerName" value="ZCPM"/>
  <property name="ServerPassword" value="secret"/>
  <property name="ServerMaxPlayerCount" value="8"/>
</ServerSettings>`;

describe("parseProperties", () => {
  it("extracts every property as name/value", () => {
    const props = parseProperties(XML);
    expect(props).toEqual<ConfigProp[]>([
      { name: "ServerName", value: "ZCPM" },
      { name: "ServerPassword", value: "secret" },
      { name: "ServerMaxPlayerCount", value: "8" },
    ]);
  });
});

describe("serializeProperties", () => {
  it("writes changed values back, preserving others and structure", () => {
    const out = serializeProperties(XML, { ServerName: "New", ServerMaxPlayerCount: "16" });
    expect(out).toContain(`name="ServerName" value="New"`);
    expect(out).toContain(`name="ServerMaxPlayerCount" value="16"`);
    expect(out).toContain(`name="ServerPassword" value="secret"`);
  });
  it("ergänzt fehlende Properties vor </ServerSettings>", () => {
    const out = serializeProperties(XML, { GameDifficulty: "2" });
    expect(out).toContain(`name="GameDifficulty" value="2"`);
    // vor dem schließenden Tag, XML bleibt valide
    expect(out.indexOf(`name="GameDifficulty"`)).toBeLessThan(out.indexOf("</ServerSettings>"));
    // bestehende bleiben erhalten
    expect(out).toContain(`name="ServerName" value="ZCPM"`);
  });
  it("dupliziert eine ergänzte Property bei erneutem Setzen nicht", () => {
    const once = serializeProperties(XML, { GameDifficulty: "2" });
    const twice = serializeProperties(once, { GameDifficulty: "4" });
    expect(twice.match(/name="GameDifficulty"/g)).toHaveLength(1);
    expect(twice).toContain(`name="GameDifficulty" value="4"`);
  });
});

describe("Sonderzeichen in Werten (Regex-Replacement + XML-Escaping)", () => {
  const NASTY = ['pa$1ss$&"x', "a&b", "<tag>", "$'$`$$", "it's", "&amp;", "back\\slash"];

  it.each(NASTY)("Round-Trip eines vorhandenen Werts: %s", (value) => {
    const out = serializeProperties(XML, { ServerPassword: value });
    const props = parseProperties(out);
    expect(props.find((p) => p.name === "ServerPassword")?.value).toBe(value);
    // die übrigen Properties und die Struktur bleiben intakt
    expect(props.map((p) => p.name)).toEqual(["ServerName", "ServerPassword", "ServerMaxPlayerCount"]);
    expect(validateServerConfigXml(out)).toBeNull();
  });

  it.each(NASTY)("Round-Trip einer neu ergänzten Property: %s", (value) => {
    const out = serializeProperties(XML, { ServerDescription: value });
    expect(parseProperties(out).find((p) => p.name === "ServerDescription")?.value).toBe(value);
    expect(out.trimEnd().endsWith("</ServerSettings>")).toBe(true);
    expect(validateServerConfigXml(out)).toBeNull();
  });

  it('escaped ", & und < im geschriebenen XML', () => {
    const out = serializeProperties(XML, { ServerPassword: 'a"b&c<d' });
    expect(out).toContain(`name="ServerPassword" value="a&quot;b&amp;c&lt;d"`);
  });

  it("$1 und $& werden nicht als Replacement-Muster interpretiert", () => {
    const out = serializeProperties(XML, { ServerPassword: "$1-$&" });
    expect(out).toContain(`name="ServerPassword" value="$1-$&amp;"`);
  });

  it("parseProperties löst XML-Entities auf", () => {
    const xml = `<ServerSettings><property name="A" value="x &amp; y &lt;z&gt; &quot;q&quot; &apos;s&apos; &#65;&#x42;"/></ServerSettings>`;
    expect(parseProperties(xml)).toEqual([{ name: "A", value: `x & y <z> "q" 's' AB` }]);
  });

  it("Regex-Metazeichen im Namen treffen keine andere Property", () => {
    const out = serializeProperties(XML, { "Server.ame": "X" });
    expect(out).toContain(`name="ServerName" value="ZCPM"`);
    expect(parseProperties(out).find((p) => p.name === "Server.ame")?.value).toBe("X");
  });

  it("lehnt Property-Namen ab, die das XML aufbrechen würden", () => {
    expect(() => serializeProperties(XML, { 'x" evil="1': "v" })).toThrow(/Ungültiger Property-Name/);
  });
});

describe("validateServerConfigXml", () => {
  it("akzeptiert eine wohlgeformte serverconfig.xml inkl. Kommentaren", () => {
    const xml = `<?xml version="1.0"?>\n<ServerSettings>\n\t<!-- a < b & c -->\n\t<property name="A" value="1"/>\t<!-- x -->\n\t<property name='B' value='2' />\n</ServerSettings>\n`;
    expect(validateServerConfigXml(xml)).toBeNull();
  });

  it.each([
    ["kaputtes Attribut (Audit-Repro)", `<ServerSettings><property name="P" value="pa<property name="P" value="ss"x"/></ServerSettings>`],
    ["unescaptes Anführungszeichen", `<ServerSettings><property name="P" value="a"b"/></ServerSettings>`],
    ["unescaptes &", `<ServerSettings><property name="P" value="a&b"/></ServerSettings>`],
    ["< im Attributwert", `<ServerSettings><property name="P" value="a<b"/></ServerSettings>`],
    ["fehlendes schließendes Tag", `<ServerSettings><property name="P" value="1"/>`],
    ["falsch geschachtelt", `<ServerSettings><a></ServerSettings></a>`],
    ["falsches Wurzelelement", `<Settings><property name="P" value="1"/></Settings>`],
    ["zwei Wurzelelemente", `<ServerSettings/><ServerSettings/>`],
    ["doppeltes Attribut", `<ServerSettings><property name="P" name="Q" value="1"/></ServerSettings>`],
    ["Text nach dem Wurzelelement", `<ServerSettings></ServerSettings>müll`],
    ["nicht geschlossener Kommentar", `<ServerSettings><!-- offen </ServerSettings>`],
    ["leer", `   `],
  ])("lehnt ab: %s", (_label, xml) => {
    expect(validateServerConfigXml(xml)).toEqual(expect.any(String));
  });
});

describe("removeProperty", () => {
  const WITH_COMMENT = `<?xml version="1.0"?>
<ServerSettings>
  <property name="ServerName" value="ZCPM"/>
  <property name="ControlPanelEnabled" value="false"/>	<!-- veraltet -->
  <property name="ServerPort" value="26900"/>
</ServerSettings>`;

  it("entfernt die Ziel-Property inkl. nachgestelltem Kommentar", () => {
    const out = removeProperty(WITH_COMMENT, "ControlPanelEnabled");
    expect(out).not.toContain("ControlPanelEnabled");
    expect(out).not.toContain("veraltet");
  });

  it("lässt andere Properties unangetastet", () => {
    const out = removeProperty(WITH_COMMENT, "ControlPanelEnabled");
    expect(out).toContain(`name="ServerName" value="ZCPM"`);
    expect(out).toContain(`name="ServerPort" value="26900"`);
    expect(out).toContain("</ServerSettings>");
  });

  it("ist no-op bei unbekanntem Namen", () => {
    const out = removeProperty(WITH_COMMENT, "DoesNotExist");
    expect(out).toBe(WITH_COMMENT);
  });

  it("hinterlässt keine leere Zeile", () => {
    const out = removeProperty(WITH_COMMENT, "ControlPanelEnabled");
    expect(out).not.toMatch(/\n[ \t]*\n[ \t]*<property name="ServerPort"/);
  });
});
