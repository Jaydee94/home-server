import { readdirSync, statSync, existsSync } from "fs";
import { join, resolve } from "path";

export interface BackupMeta {
  filename: string;
  timestamp: string;
  sizeBytes: number;
}

export function parseBackupName(filename: string): BackupMeta {
  const m = filename.match(/backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
  const timestamp = m ? m[1].replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3") : filename;
  return { filename, timestamp, sizeBytes: 0 };
}

export function listBackups(backupDir: string): BackupMeta[] {
  if (!existsSync(backupDir)) return [];
  return readdirSync(backupDir)
    .filter((f) => f.endsWith(".tar.gz"))
    .map((f) => {
      const meta = parseBackupName(f);
      try {
        meta.sizeBytes = statSync(join(backupDir, f)).size;
      } catch {
        // ignorieren
      }
      return meta;
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function backupFilePath(backupDir: string, filename: string): string {
  const resolved = resolve(backupDir, filename);
  if (!resolved.startsWith(resolve(backupDir) + "/") && resolved !== resolve(backupDir)) {
    throw new Error("Ungültiger Dateiname");
  }
  return resolved;
}
