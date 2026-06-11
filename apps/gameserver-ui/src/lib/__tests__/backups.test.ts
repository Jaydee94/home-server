import { describe, it, expect } from "vitest";
import { parseBackupName, backupFilePath } from "@/lib/backups";

describe("parseBackupName", () => {
  it("parst Dateiname zu Metadaten", () => {
    const meta = parseBackupName("backup-2026-06-11T10-00-00.tar.gz");
    expect(meta.timestamp).toBe("2026-06-11T10:00:00");
    expect(meta.filename).toBe("backup-2026-06-11T10-00-00.tar.gz");
  });
  it("gibt sinnvollen Fallback für unbekannte Dateinamen", () => {
    const meta = parseBackupName("unknown.tar.gz");
    expect(meta.filename).toBe("unknown.tar.gz");
  });
});

describe("backupFilePath", () => {
  it("gibt den Pfad zurück", () => {
    expect(backupFilePath("/backups", "backup-2026.tar.gz")).toBe("/backups/backup-2026.tar.gz");
  });
  it("wirft bei Pfad-Traversal", () => {
    expect(() => backupFilePath("/backups", "../etc/passwd")).toThrow();
  });
});
