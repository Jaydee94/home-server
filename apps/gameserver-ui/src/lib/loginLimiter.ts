// Einfacher In-Memory-Backoff gegen Passwort-Raten am Login: nach `maxFailures`
// Fehlversuchen innerhalb von `windowMs` wird die IP bis zum Ende des Fensters
// gesperrt. Gilt pro Prozess (eine Replika) und geht bei einem Neustart verloren —
// für ein LAN-Dashboard mit einem Nutzer ausreichend.
interface Entry { failures: number; resetAt: number }

export class LoginLimiter {
  private entries = new Map<string, Entry>();

  constructor(
    private maxFailures = 5,
    private windowMs = 60_000,
    private maxEntries = 10_000,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  /** Verbleibende Sperrzeit in ms; 0 = Versuch erlaubt. */
  retryAfterMs(key: string, now = Date.now()): number {
    const e = this.entries.get(key);
    if (!e) return 0;
    if (now >= e.resetAt) { this.entries.delete(key); return 0; }
    return e.failures >= this.maxFailures ? e.resetAt - now : 0;
  }

  recordFailure(key: string, now = Date.now()): void {
    const e = this.entries.get(key);
    if (e && now < e.resetAt) { e.failures += 1; return; }
    this.prune(now);
    this.entries.set(key, { failures: 1, resetAt: now + this.windowMs });
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  // Abgelaufene Einträge entfernen; bleibt die Tabelle trotzdem zu groß (viele
  // verschiedene IPs), wird sie komplett geleert, statt unbegrenzt zu wachsen.
  private prune(now: number): void {
    if (this.entries.size < this.maxEntries) return;
    for (const [k, e] of this.entries) if (now >= e.resetAt) this.entries.delete(k);
    if (this.entries.size >= this.maxEntries) this.entries.clear();
  }
}

export const loginLimiter = new LoginLimiter();

// Traefik hängt die Adresse des Verbindungspartners ans ENDE von X-Forwarded-For;
// vorangestellte Einträge kommen vom Client und sind frei wählbar.
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const last = forwarded.split(",").pop()?.trim();
    if (last) return last;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
