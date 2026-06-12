import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";
import { telnetOptsFromEnv } from "@/lib/telnet";
import { restartServer } from "@/lib/restart";

// Langlebige Anfrage: bei Online-Spielern läuft ein 30-s-Countdown, bevor der
// Container neu gestartet wird.
export const maxDuration = 60;

export async function POST() {
  try {
    const status = await VmClient.inCluster().getStatus();
    if (status.vmiPhase !== "Running" || !status.ipAddress) {
      return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
    }
    const ssh = SshClient.fromEnv(status.ipAddress);
    await restartServer(ssh, telnetOptsFromEnv());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
