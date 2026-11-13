import { describe, it, expect, vi, beforeEach } from "vitest";

const sessionData = vi.hoisted(() => ({ current: {} as { loggedIn?: boolean } }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn(async () => sessionData.current) }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({})) }));

import { requireSession } from "@/lib/session";

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
