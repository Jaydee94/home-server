import { describe, it, expect } from "vitest";
import { verifyPassword } from "@/lib/session";

describe("verifyPassword", () => {
  it("akzeptiert das korrekte Passwort", () => {
    expect(verifyPassword("geheim", "geheim")).toBe(true);
  });

  it("lehnt ein falsches Passwort ab", () => {
    expect(verifyPassword("falsch", "geheim")).toBe(false);
  });

  it("lehnt ab wenn kein Passwort konfiguriert ist", () => {
    expect(verifyPassword("geheim", "")).toBe(false);
  });

  it("lehnt ab bei unterschiedlicher Länge", () => {
    expect(verifyPassword("kurz", "länger")).toBe(false);
  });
});
