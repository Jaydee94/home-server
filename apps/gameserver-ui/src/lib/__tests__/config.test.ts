import { describe, it, expect } from "vitest";
import { extractConfigValue, injectConfigValue } from "@/lib/config";

const SAMPLE_XML = `<?xml version="1.0"?>
<ServerSettings>
  <property name="ServerName" value="MyServer"/>
  <property name="TelnetEnabled" value="true"/>
  <property name="MaxSpawnedZombies" value="64"/>
</ServerSettings>`;

describe("extractConfigValue", () => {
  it("liest einen Wert aus der XML", () => {
    expect(extractConfigValue(SAMPLE_XML, "ServerName")).toBe("MyServer");
    expect(extractConfigValue(SAMPLE_XML, "MaxSpawnedZombies")).toBe("64");
  });
  it("gibt null zurück wenn key nicht existiert", () => {
    expect(extractConfigValue(SAMPLE_XML, "UnknownKey")).toBeNull();
  });
});

describe("injectConfigValue", () => {
  it("ersetzt einen bestehenden Wert", () => {
    const updated = injectConfigValue(SAMPLE_XML, "ServerName", "NewServer");
    expect(extractConfigValue(updated, "ServerName")).toBe("NewServer");
    expect(updated).toContain("MaxSpawnedZombies");
  });
});
