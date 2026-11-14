import { describe, it, expect, vi, beforeEach } from "vitest";

const sessionData = vi.hoisted(() => ({ current: {} as { loggedIn?: boolean } }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn(async () => sessionData.current) }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({})) }));

import { requireSession, resolveSessionSecret, sessionOptions } from "@/lib/session";

beforeEach(() => { sessionData.current = {}; });

describe("requireSession", () => {
  it("liefert 401, wenn keine angemeldete Session existiert", async () => {
    const res = await requireSession();
    expect(res?.status).toBe(401);
    expect(await res?.json()).toEqual({ error: "Nicht angemeldet" });
  });

  it("liefert null (weiter), wenn die Session angemeldet ist", async () => {
    sessionData.current = { loggedIn: true };
    expect(await requireSession()).toBeNull();
  });
});

describe("resolveSessionSecret", () => {
  const LONG = "x".repeat(32);

  it("nutzt SESSION_SECRET, wenn lang genug", () => {
    expect(resolveSessionSecret({ SESSION_SECRET: LONG, NODE_ENV: "production" })).toBe(LONG);
  });

  it("bricht in Production ohne Secret ab", () => {
    expect(() => resolveSessionSecret({ NODE_ENV: "production" })).toThrow(/SESSION_SECRET/);
    expect(() => resolveSessionSecret({ NODE_ENV: "production", SESSION_SECRET: "" })).toThrow(/SESSION_SECRET/);
  });

  it("bricht in Production bei zu kurzem Secret ab", () => {
    expect(() => resolveSessionSecret({ NODE_ENV: "production", SESSION_SECRET: "kurz" })).toThrow(/32/);
  });

  it("fällt in Dev/Test auf einen Fallback zurück (auch bei zu kurzem Secret)", () => {
    expect(resolveSessionSecret({ NODE_ENV: "development" }).length).toBeGreaterThanOrEqual(32);
    expect(resolveSessionSecret({ NODE_ENV: "test" }).length).toBeGreaterThanOrEqual(32);
    expect(resolveSessionSecret({ NODE_ENV: "test", SESSION_SECRET: "kurz" }).length).toBeGreaterThanOrEqual(32);
  });

  it("wertet das Secret erst beim Zugriff aus, nicht beim Import (next build läuft ohne Secret)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "");
    try {
      expect(() => sessionOptions.password).toThrow(/SESSION_SECRET/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
