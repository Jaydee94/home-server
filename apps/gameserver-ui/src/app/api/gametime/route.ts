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
    const gt = parseGetTime(out);
    if (!gt) return NextResponse.json({ error: "Zeit nicht lesbar" }, { status: 502 });
    return NextResponse.json(gt);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
