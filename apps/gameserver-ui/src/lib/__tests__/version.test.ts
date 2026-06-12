import { describe, it, expect } from "vitest";
import { parseVersion } from "@/lib/version";

describe("parseVersion", () => {
  it("extrahiert die Spielversion vor 'Compatibility Version'", () => {
    const out =
      "Game version: V 2.6 (b14) Compatibility Version: V 2.6 Mod TFP_Harmony: 1.1.0.4 Mod TFP_CommandExtensions: 2.1.0.0";
    expect(parseVersion(out)).toBe("V 2.6 (b14)");
  });

  it("funktioniert auch ohne Compatibility-Suffix (Zeilenende)", () => {
    expect(parseVersion("Game version: V 1.0 (b333)")).toBe("V 1.0 (b333)");
  });

  it("findet die Version auch in mehrzeiliger Ausgabe", () => {
    const out = "Day 2, 05:53\nGame version: V 2.6 (b14)\nMod TFP_Harmony: 1.1.0.4";
    expect(parseVersion(out)).toBe("V 2.6 (b14)");
  });

  it("gibt null zurück, wenn keine Version gefunden wird", () => {
    expect(parseVersion("Total of 0 in the game")).toBeNull();
  });
});
