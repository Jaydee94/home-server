import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";
import { telnetCommand, parseLp, telnetOptsFromEnv } from "@/lib/telnet";

async function requireRunningVm(): Promise<{ ip: string } | NextResponse> {
  const status = await VmClient.inCluster().getStatus();
  if (status.vmiPhase !== "Running" || !status.ipAddress) {
    return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
  }
  return { ip: status.ipAddress };
}

export async function GET() {
  try {
    const result = await requireRunningVm();
    if (result instanceof NextResponse) return result;
    const output = await telnetCommand(telnetOptsFromEnv(result.ip), "lp");
    return NextResponse.json({ players: parseLp(output) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const { action, message } = await req.json().catch(() => ({}));
    const result = await requireRunningVm();
    if (result instanceof NextResponse) return result;
    const opts = telnetOptsFromEnv(result.ip);

    if (action === "broadcast") {
      if (!message) return NextResponse.json({ error: "message fehlt" }, { status: 400 });
      await telnetCommand(opts, `say ${message}`);
      return NextResponse.json({ ok: true });
    }
    if (action === "saveworld") {
      await telnetCommand(opts, "saveworld");
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "action muss broadcast|saveworld sein" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
