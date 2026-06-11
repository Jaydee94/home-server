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
