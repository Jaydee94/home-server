import { NextResponse } from "next/server";

// Modulweite Sperre für Operationen, die den Server stoppen/neu starten oder das
// Saves-Verzeichnis anfassen (Backup, Restore, Neustart, Config-Rollout). Zwei
// davon gleichzeitig würden sich gegenseitig den Container wegstoppen oder
// halb entpackte Welten sichern. Gilt nur innerhalb EINES Prozesses — passt zu
// dieser App (eine Replika, ein Nutzer).
let current: string | null = null;

export function currentServerOperation(): string | null {
  return current;
}

// Führt `fn` nur aus, wenn keine andere Operation läuft; sonst 409. Die Sperre wird
// immer freigegeben, auch wenn `fn` wirft.
export async function withServerLock(
  name: string,
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  if (current) {
    return NextResponse.json(
      { error: `${current} läuft bereits — bitte warten, bis es abgeschlossen ist` },
      { status: 409 },
    );
  }
  current = name;
  try {
    return await fn();
  } finally {
    current = null;
  }
}
