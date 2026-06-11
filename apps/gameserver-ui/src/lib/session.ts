import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { timingSafeEqual, createHash } from "crypto";

export interface SessionData {
  loggedIn?: boolean;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? "dev-only-secret-change-me-32chars!!",
  cookieName: "gameserver-ui",
  // secure: false — die UI läuft wie alle Dashboards über plain HTTP im LAN/Tailnet
  cookieOptions: { httpOnly: true, sameSite: "lax", secure: false },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export function verifyPassword(input: string, expected: string): boolean {
  if (!expected) return false;
  // SHA-256 normalisiert beide Seiten auf 32 Bytes — verhindert Längen-Leak
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
