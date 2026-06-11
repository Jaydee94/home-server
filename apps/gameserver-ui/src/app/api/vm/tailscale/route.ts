import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";

export const dynamic = "force-dynamic";

export async function GET() {
  let status;
  try {
    status = await VmClient.inCluster().getStatus();
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }

  if (!status || status.vmiPhase !== "Running" || !status.ipAddress) {
    return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
  }

  try {
    const raw = await SshClient.fromEnv(status.ipAddress).exec("tailscale ip -4");
    return NextResponse.json({ tailscaleIp: raw.trim() });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
