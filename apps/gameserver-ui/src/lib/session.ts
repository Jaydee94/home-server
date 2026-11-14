import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
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

// Session-Prüfung direkt in einer API-Route: liefert die fertige 401-Antwort oder
// `null`, wenn der Aufrufer angemeldet ist. Pflicht für Routen, die vom matcher der
// Middleware ausgenommen sind.
export async function requireSession(): Promise<NextResponse | null> {
  const session = await getSession();
  if (session.loggedIn) return null;
  return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
}

export function verifyPassword(input: string, expected: string): boolean {
  if (!expected) return false;
  // SHA-256 normalisiert beide Seiten auf 32 Bytes — verhindert Längen-Leak
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
