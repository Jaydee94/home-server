import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

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

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}
