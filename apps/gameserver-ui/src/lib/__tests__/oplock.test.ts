import { describe, it, expect, vi } from "vitest";
import { NextResponse } from "next/server";
import { withServerLock, currentServerOperation } from "@/lib/oplock";

const ok = () => NextResponse.json({ ok: true });

describe("withServerLock", () => {
  it("führt die Operation aus und gibt die Sperre danach frei", async () => {
    const res = await withServerLock("Backup", async () => {
      expect(currentServerOperation()).toBe("Backup");
      return ok();
    });
    expect(res.status).toBe(200);
    expect(currentServerOperation()).toBeNull();
  });

  it("lehnt eine zweite Operation mit 409 ab, solange die erste läuft", async () => {
    let finish!: () => void;
    const first = withServerLock("Restore", () => new Promise<NextResponse>((r) => { finish = () => r(ok()); }));

    const second = vi.fn(async () => ok());
    const res = await withServerLock("Neustart", second);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("Restore");
    expect(second).not.toHaveBeenCalled();

    finish();
    expect((await first).status).toBe(200);
    expect((await withServerLock("Neustart", second)).status).toBe(200);
  });

  it("gibt die Sperre auch frei, wenn die Operation wirft", async () => {
    await expect(withServerLock("Backup", async () => { throw new Error("kaputt"); })).rejects.toThrow("kaputt");
    expect(currentServerOperation()).toBeNull();
  });
});
