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
  it("ignores keys not present in the XML", () => {
    const out = serializeProperties(XML, { DoesNotExist: "x" });
    expect(out).not.toContain("DoesNotExist");
  });
});
