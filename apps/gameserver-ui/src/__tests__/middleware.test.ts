import { describe, it, expect, vi } from "vitest";

vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { config } from "@/middleware";

// Next.js wendet die Middleware auf Pfade an, die einem der matcher-Muster
// vollständig entsprechen.
const matches = (path: string) => config.matcher.some((m) => new RegExp(`^${m}$`).test(path));

describe("middleware matcher", () => {
  it("schützt Seiten und API-Routen", () => {
    for (const p of ["/", "/mods", "/api/mods", "/api/mods/MeinMod", "/api/config", "/api/backups/x/restore", "/api/restart"]) {
      expect(matches(p), p).toBe(true);
    }
  });

  it("lässt Login und statische Assets durch", () => {
    for (const p of ["/login", "/api/login", "/_next/static/chunk.js", "/favicon.ico"]) {
      expect(matches(p), p).toBe(false);
    }
  });

  // Für von der Middleware erfasste Requests puffert Next.js den Body im RAM. Der
  // Mod-Upload ist deshalb ausgenommen und prüft die Session in der Route selbst
  // (siehe src/app/api/mod-upload/__tests__/route.test.ts).
  it("nimmt nur den Mod-Upload aus", () => {
    expect(matches("/api/mod-upload")).toBe(false);
  });
});
