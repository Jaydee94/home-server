export interface GameTime { day: number; hour: number; minute: number; }

export function parseGetTime(output: string): GameTime | null {
  const m = output.match(/Day\s+(\d+),\s*(\d{1,2}):(\d{2})/i);
  if (!m) return null;
  return { day: Number(m[1]), hour: Number(m[2]), minute: Number(m[3]) };
}

export function nextBloodMoon(currentDay: number, frequency: number): number {
  if (frequency <= 0) return currentDay;
  return Math.ceil(currentDay / frequency) * frequency;
}

// Anzeige-Label für die Blutmond-Kachel. Liefert null, wenn keine Spielzeit
// verfügbar ist (z. B. im kurzen Fenster direkt nach einem Server-Neustart) —
// das Dashboard zeigt dann "—" statt eines Fehlers.
export function bloodMoonLabel(gt: GameTime | null, frequency: number): string | null {
  if (!gt) return null;
  const next = nextBloodMoon(gt.day, frequency);
  return next === gt.day ? "Heute Nacht!" : `Tag ${next} (in ${next - gt.day})`;
}
