import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";
import { telnetCommand, telnetOptsFromEnv } from "@/lib/telnet";
import { parseGetTime } from "@/lib/gametime";

export async function GET() {
  try {
    const status = await VmClient.inCluster().getStatus();
    if (status.vmiPhase !== "Running" || !status.ipAddress) {
      return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
    }
    const ssh = SshClient.fromEnv(status.ipAddress);
    const out = await telnetCommand(ssh, telnetOptsFromEnv(), "gettime");
    // Telnet hat geantwortet, aber die Zeit ist (noch) nicht parsebar — z. B. im
    // kurzen Fenster direkt nach einem Server-Neustart. Kein Fehler: 200 mit null,
    // damit das Dashboard "—" zeigt statt einen 502 zu loggen. Echte Telnet-/
    // VM-Fehler landen weiterhin im catch (502).
    return NextResponse.json(parseGetTime(out));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
