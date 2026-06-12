import { describe, it, expect } from "vitest";
import { parseProperties, serializeProperties, type ConfigProp } from "../serverconfig";

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
