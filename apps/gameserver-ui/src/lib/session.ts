import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { timingSafeEqual, createHash } from "crypto";

export interface SessionData {
  loggedIn?: boolean;
}

const MIN_SECRET_LENGTH = 32;
// Nur für Dev/Test. Steht im öffentlichen Repo und darf nie in Production gelten.
const DEV_FALLBACK_SECRET = "dev-only-secret-change-me-32chars!!";

// In Production ohne (ausreichend langes) SESSION_SECRET hart abbrechen: Mit dem
// öffentlich bekannten Fallback könnte jeder gültige Session-Cookies fälschen.
export function resolveSessionSecret(env: Partial<Record<string, string>> = process.env): string {
  const secret = env.SESSION_SECRET;
  if (secret && secret.length >= MIN_SECRET_LENGTH) return secret;
  if (env.NODE_ENV === "production") {
    throw new Error(`SESSION_SECRET fehlt oder ist kürzer als ${MIN_SECRET_LENGTH} Zeichen — Start in Production verweigert`);
  }
  return DEV_FALLBACK_SECRET;
}

export const sessionOptions: SessionOptions = {
  // Getter: wird erst bei der ersten Session-Nutzung (Laufzeit) ausgewertet, nicht
  // beim Import — `next build` läuft mit NODE_ENV=production, aber ohne Secret.
  get password() {
    return resolveSessionSecret();
  },
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
