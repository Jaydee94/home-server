import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { verifyPassword } from "@/lib/session";

describe("verifyPassword", () => {
  it("akzeptiert das korrekte Passwort", async () => {
    const hash = await bcrypt.hash("geheim", 10);
    expect(await verifyPassword("geheim", hash)).toBe(true);
  });

  it("lehnt ein falsches Passwort ab", async () => {
    const hash = await bcrypt.hash("geheim", 10);
    expect(await verifyPassword("falsch", hash)).toBe(false);
  });

  it("lehnt ab wenn kein Hash konfiguriert ist", async () => {
    expect(await verifyPassword("geheim", "")).toBe(false);
  });
});
