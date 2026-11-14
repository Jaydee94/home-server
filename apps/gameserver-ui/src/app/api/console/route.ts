import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";
import { telnetCommand, telnetOptsFromEnv } from "@/lib/telnet";

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const { command } = await req.json().catch(() => ({}));
    if (typeof command !== "string" || !command.trim() || /[\r\n\x00]/.test(command) || command.length > 200) {
      return NextResponse.json({ error: "Ungültiger Befehl" }, { status: 400 });
    }
    const status = await VmClient.inCluster().getStatus();
    if (status.vmiPhase !== "Running" || !status.ipAddress) {
      return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
    }
    const ssh = SshClient.fromEnv(status.ipAddress);
    const output = await telnetCommand(ssh, telnetOptsFromEnv(), command.trim());
    return NextResponse.json({ output });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
