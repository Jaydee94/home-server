import type { BackupMeta } from "./backups";

export function backupsToPrune(backups: BackupMeta[], keepN: number): BackupMeta[] {
  if (keepN <= 0) return [];
  const sorted = [...backups].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return sorted.slice(keepN);
}
