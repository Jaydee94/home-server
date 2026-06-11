export interface SimpleSchedule {
  hour: number;
  minute: number;
}

// Parsed nur "M H * * *" (täglich, feste Zeit) — komplexe Expressions → null
export function parseCronSchedule(expr: string): SimpleSchedule | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dom, month, dow] = parts;
  if (dom !== "*" || month !== "*" || dow !== "*") return null;
  const m = Number(minute), h = Number(hour);
  if (!Number.isInteger(m) || !Number.isInteger(h) || m < 0 || m > 59 || h < 0 || h > 23) return null;
  return { hour: h, minute: m };
}

export function toSimpleCron(hour: number, minute: number): string {
  return `${minute} ${hour} * * *`;
}
