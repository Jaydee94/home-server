import { describe, it, expect } from "vitest";
import { parseWorlds, buildConfigModel } from "@/lib/configModel";

describe("parseWorlds", () => {
  it("dedupliziert, ergänzt RWG und sortiert (RWG zuerst)", () => {
    const out = parseWorlds("Navezgane\nPregen06k01\nNavezgane\n\nPregen08k01\n");
    expect(out[0]).toBe("RWG");
    expect(out).toEqual(["RWG", "Navezgane", "Pregen06k01", "Pregen08k01"]);
  });
  it("liefert mindestens RWG bei leerer Eingabe", () => {
    expect(parseWorlds("")).toEqual(["RWG"]);
  });
});

const XML = `<?xml version="1.0"?>
<ServerSettings>
  <property name="ServerName" value="ZCPM"/>
  <property name="GameDifficulty" value="3"/>
  <property name="SomeUnknownProp" value="42"/>
</ServerSettings>`;

describe("buildConfigModel", () => {
  it("mergt Dateiwerte über Schema-Defaults und gruppiert nach Kategorie", () => {
    const groups = buildConfigModel(XML);
    const all = groups.flatMap((g) => g.fields);
    const name = all.find((f) => f.name === "ServerName");
    const diff = all.find((f) => f.name === "GameDifficulty");
    expect(name?.current).toBe("ZCPM");
    expect(name?.inFile).toBe(true);
    expect(diff?.current).toBe("3");
  });

  it("zeigt Schema-Defaults für nicht im File vorhandene Properties (inFile=false)", () => {
    const diffXmlWithout = `<?xml version="1.0"?>\n<ServerSettings>\n  <property name="ServerName" value="ZCPM"/>\n</ServerSettings>`;
    const groups = buildConfigModel(diffXmlWithout);
    const diff = groups.flatMap((g) => g.fields).find((f) => f.name === "GameDifficulty");
    expect(diff).toBeDefined();
    expect(diff?.inFile).toBe(false);
    expect(diff?.current).toBe(diff?.default);
  });

  it("packt unbekannte File-Properties in die Gruppe 'Sonstige'", () => {
    const groups = buildConfigModel(XML);
    const sonstige = groups.find((g) => g.category === "Sonstige");
    expect(sonstige?.fields.some((f) => f.name === "SomeUnknownProp")).toBe(true);
  });
});
