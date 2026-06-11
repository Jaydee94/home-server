import { describe, it, expect } from "vitest";
import { sanitizeModName } from "@/lib/mods";

describe("sanitizeModName", () => {
  it("erlaubt gültige Mod-Namen", () => {
    expect(sanitizeModName("MyMod")).toBe("MyMod");
    expect(sanitizeModName("Mod-v1.2")).toBe("Mod-v1.2");
  });
  it("wirft bei Pfad-Traversal", () => {
    expect(() => sanitizeModName("../etc")).toThrow();
    expect(() => sanitizeModName("foo/bar")).toThrow();
  });
  it("wirft bei leerem Namen", () => {
    expect(() => sanitizeModName("")).toThrow();
  });
});
