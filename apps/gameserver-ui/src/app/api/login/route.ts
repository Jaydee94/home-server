import { NextResponse } from "next/server";
import { getSession, verifyPassword } from "@/lib/session";

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({}));
  if (!verifyPassword(password ?? "", process.env.ADMIN_PASSWORD ?? "")) {
    return NextResponse.json({ error: "Falsches Passwort" }, { status: 401 });
  }
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
