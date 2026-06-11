import { describe, it, expect } from "vitest";
import { backupsToPrune } from "../retention";
import type { BackupMeta } from "../backups";

const mk = (ts: string): BackupMeta => ({ filename: `backup-${ts}.tar.gz`, timestamp: ts, sizeBytes: 1 });

describe("backupsToPrune", () => {
  it("keeps the newest N and returns the rest (oldest)", () => {
    const list = [mk("2026-06-11T10:00:00"), mk("2026-06-10T10:00:00"), mk("2026-06-09T10:00:00")];
    expect(backupsToPrune(list, 2).map((b) => b.timestamp)).toEqual(["2026-06-09T10:00:00"]);
  });
  it("returns nothing when at or below the limit", () => {
    expect(backupsToPrune([mk("2026-06-11T10:00:00")], 2)).toEqual([]);
  });
  it("treats keepN<=0 as keep-all (safety)", () => {
    expect(backupsToPrune([mk("a"), mk("b")], 0)).toEqual([]);
  });
});
