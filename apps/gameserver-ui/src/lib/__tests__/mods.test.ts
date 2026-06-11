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
  it("wirft bei Shell-Sonderzeichen", () => {
    expect(() => sanitizeModName("x'; rm -rf /")).toThrow();
    expect(() => sanitizeModName("mod$name")).toThrow();
    expect(() => sanitizeModName("mod`cmd`")).toThrow();
  });
  it("wirft bei führendem Bindestrich", () => {
    expect(() => sanitizeModName("-mod")).toThrow();
  });
  it("wirft bei führendem Punkt", () => {
    expect(() => sanitizeModName(".hidden")).toThrow();
  });
});
