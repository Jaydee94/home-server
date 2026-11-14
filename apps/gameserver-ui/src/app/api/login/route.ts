import { NextResponse } from "next/server";
import { getSession, verifyPassword } from "@/lib/session";
import { loginLimiter, clientIp } from "@/lib/loginLimiter";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const wait = loginLimiter.retryAfterMs(ip);
  if (wait > 0) {
    return NextResponse.json(
      { error: "Zu viele Fehlversuche — bitte später erneut versuchen" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(wait / 1000)) } },
    );
  }

  const { password } = await req.json().catch(() => ({}));
  if (!verifyPassword(password ?? "", process.env.ADMIN_PASSWORD ?? "")) {
    loginLimiter.recordFailure(ip);
    return NextResponse.json({ error: "Falsches Passwort" }, { status: 401 });
  }
  loginLimiter.reset(ip);
  const session = await getSession();
  session.loggedIn = true;
  await session.save();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ ok: true });
}
