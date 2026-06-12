import { describe, it, expect } from "vitest";
import { sanitizeModName, isProtectedMod, escapeForShellSingleQuote } from "@/lib/mods";

describe("sanitizeModName", () => {
  it("erlaubt einfache Mod-Namen", () => {
    expect(sanitizeModName("MyMod")).toBe("MyMod");
    expect(sanitizeModName("Mod-v1.2")).toBe("Mod-v1.2");
  });
  it("erlaubt Mod-Namen mit Leerzeichen (echte Mods aus der Praxis)", () => {
    expect(sanitizeModName("Ciklet_Exstra Mod Slot 1.0")).toBe("Ciklet_Exstra Mod Slot 1.0");
  });
  it("erlaubt Mod-Namen mit Klammern", () => {
    expect(sanitizeModName("CraftFromContainersPlus(AnyCrate)")).toBe("CraftFromContainersPlus(AnyCrate)");
  });
  it("erlaubt Mod-Namen mit Apostroph", () => {
    expect(sanitizeModName("Jakmeister999's Reinforced Chainlink Fences (V2.5)")).toBe(
      "Jakmeister999's Reinforced Chainlink Fences (V2.5)"
    );
  });
  it("wirft bei Pfad-Traversal (Slash)", () => {
    expect(() => sanitizeModName("../etc")).toThrow();
    expect(() => sanitizeModName("foo/bar")).toThrow();
    expect(() => sanitizeModName("x'; rm -rf /")).toThrow();
  });
  it("wirft bei leerem Namen", () => {
    expect(() => sanitizeModName("")).toThrow();
  });
  it("wirft bei führendem Bindestrich", () => {
    expect(() => sanitizeModName("-mod")).toThrow();
  });
  it("wirft bei führendem Punkt", () => {
    expect(() => sanitizeModName(".hidden")).toThrow();
  });
  it("wirft bei Null-Byte", () => {
    expect(() => sanitizeModName("mod\x00name")).toThrow();
  });
  it("erlaubt $ und Backtick (in bash single-quote-Kontext sicher)", () => {
    expect(sanitizeModName("mod$name")).toBe("mod$name");
    expect(sanitizeModName("mod`test`")).toBe("mod`test`");
  });
});

describe("escapeForShellSingleQuote", () => {
  it("escapet Apostroph für bash single-quote-Kontext", () => {
    expect(escapeForShellSingleQuote("it's")).toBe("it'\\''s");
  });
  it("lässt Namen ohne Apostroph unverändert", () => {
    expect(escapeForShellSingleQuote("EasyHoney")).toBe("EasyHoney");
  });
  it("escapet mehrere Apostrophe", () => {
    expect(escapeForShellSingleQuote("it's it's")).toBe("it'\\''s it'\\''s");
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
