import { describe, it, expect } from "vitest";
import { sanitizeModName, isProtectedMod } from "@/lib/mods";

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

describe("isProtectedMod", () => {
  it("schützt mitgelieferte TFP-Stock-Mods", () => {
    expect(isProtectedMod("0_TFP_Harmony")).toBe(true);
    expect(isProtectedMod("TFP_CommandExtensions")).toBe(true);
    expect(isProtectedMod("TFP_MapRendering")).toBe(true);
    expect(isProtectedMod("TFP_WebServer")).toBe(true);
    expect(isProtectedMod("Xample_MarkersMod")).toBe(true);
  });
  it("schützt künftige Mods mit denselben Präfixen", () => {
    expect(isProtectedMod("TFP_NeuerStockMod")).toBe(true);
    expect(isProtectedMod("0_TFP_Etwas")).toBe(true);
    expect(isProtectedMod("Xample_Demo")).toBe(true);
  });
  it("schützt eigene/hochgeladene Mods nicht", () => {
    expect(isProtectedMod("TitlesSystem")).toBe(false);
    expect(isProtectedMod("MyMod")).toBe(false);
    expect(isProtectedMod("DarknessFalls")).toBe(false);
  });
  it("ist case-sensitive (echte Ordnernamen sind großgeschrieben)", () => {
    expect(isProtectedMod("tfp_lowercase")).toBe(false);
    expect(isProtectedMod("xample_lower")).toBe(false);
  });
});
