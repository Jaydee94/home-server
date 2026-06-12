import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";
import { telnetCommand, telnetOptsFromEnv } from "@/lib/telnet";
import { parseVersion } from "@/lib/version";

export async function GET() {
  try {
    const status = await VmClient.inCluster().getStatus();
    if (status.vmiPhase !== "Running" || !status.ipAddress) {
      return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
    }
    const ssh = SshClient.fromEnv(status.ipAddress);
    const out = await telnetCommand(ssh, telnetOptsFromEnv(), "version");
    return NextResponse.json({ version: parseVersion(out) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
