import { describe, it, expect, vi, beforeEach } from "vitest";

const save = vi.fn();
vi.mock("@/lib/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/session")>()),
  getSession: vi.fn(async () => ({ save, destroy: vi.fn(), loggedIn: false })),
}));

import { POST } from "@/app/api/login/route";
import { loginLimiter } from "@/lib/loginLimiter";

const login = (password: string, ip = "10.0.0.1") =>
  POST(new Request("http://x/api/login", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: JSON.stringify({ password }),
  }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_PASSWORD", "geheim");
  loginLimiter.clear();
});

describe("POST /api/login", () => {
  it("meldet mit dem richtigen Passwort an", async () => {
    expect((await login("geheim")).status).toBe(200);
    expect(save).toHaveBeenCalled();
  });

  it("liefert 401 bei falschem Passwort", async () => {
    expect((await login("falsch")).status).toBe(401);
    expect(save).not.toHaveBeenCalled();
  });

  it("liefert nach 5 Fehlversuchen 429 (mit Retry-After) — auch für das richtige Passwort", async () => {
    for (let i = 0; i < 5; i++) expect((await login("falsch")).status).toBe(401);
    const res = await login("geheim");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(save).not.toHaveBeenCalled();
  });

  it("sperrt nur die betroffene IP", async () => {
    for (let i = 0; i < 5; i++) await login("falsch", "10.0.0.1");
    expect((await login("geheim", "10.0.0.2")).status).toBe(200);
  });

  it("setzt den Zähler nach erfolgreichem Login zurück", async () => {
    for (let i = 0; i < 4; i++) await login("falsch");
    expect((await login("geheim")).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await login("falsch")).status).toBe(401);
  });
});
