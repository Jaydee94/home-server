import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";

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
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
