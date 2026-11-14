import { describe, it, expect } from "vitest";
import { LoginLimiter, clientIp } from "@/lib/loginLimiter";

describe("LoginLimiter", () => {
  it("sperrt nach 5 Fehlversuchen innerhalb einer Minute", () => {
    const l = new LoginLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) {
      expect(l.retryAfterMs("1.2.3.4", 0)).toBe(0);
      l.recordFailure("1.2.3.4", 0);
    }
    expect(l.retryAfterMs("1.2.3.4", 1_000)).toBe(59_000);
  });

  it("zählt pro IP getrennt", () => {
    const l = new LoginLimiter(2, 60_000);
    l.recordFailure("a", 0); l.recordFailure("a", 0);
    expect(l.retryAfterMs("a", 1)).toBeGreaterThan(0);
    expect(l.retryAfterMs("b", 1)).toBe(0);
  });

  it("gibt nach Ablauf des Fensters wieder frei", () => {
    const l = new LoginLimiter(1, 60_000);
    l.recordFailure("a", 0);
    expect(l.retryAfterMs("a", 59_999)).toBeGreaterThan(0);
    expect(l.retryAfterMs("a", 60_000)).toBe(0);
    l.recordFailure("a", 60_000);
    expect(l.retryAfterMs("a", 60_001)).toBeGreaterThan(0);
  });

  it("setzt den Zähler nach einem Erfolg zurück", () => {
    const l = new LoginLimiter(2, 60_000);
    l.recordFailure("a", 0);
    l.reset("a");
    l.recordFailure("a", 1);
    expect(l.retryAfterMs("a", 2)).toBe(0);
  });

  it("hält die Tabelle begrenzt", () => {
    const l = new LoginLimiter(5, 60_000, 100);
    for (let i = 0; i < 1_000; i++) l.recordFailure(`ip${i}`, 0);
    expect(l.size).toBeLessThanOrEqual(100);
  });
});

describe("clientIp", () => {
  const req = (h: Record<string, string>) => new Request("http://x/", { headers: h });

  it("nimmt den letzten X-Forwarded-For-Eintrag (vom vertrauenswürdigen Proxy angehängt)", () => {
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 10.0.0.9" }))).toBe("10.0.0.9");
  });

  it("fällt auf X-Real-IP und dann auf 'unknown' zurück", () => {
    expect(clientIp(req({ "x-real-ip": "10.0.0.7" }))).toBe("10.0.0.7");
    expect(clientIp(req({}))).toBe("unknown");
  });
});
