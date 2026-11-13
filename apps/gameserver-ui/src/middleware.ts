import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  if (!session.loggedIn) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return res;
}

export const config = {
  // api/mod-upload ist bewusst ausgenommen: Für von der Middleware erfasste Requests
  // puffert Next.js den kompletten Body im RAM. Die Route prüft die Session selbst
  // (requireSession). Weitere Ausnahmen nur mit eigener Session-Prüfung ergänzen.
  matcher: ["/((?!login|api/login|api/mod-upload|_next/static|_next/image|favicon.ico).*)"],
};
