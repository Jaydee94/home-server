import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";
import { sanitizeModName } from "@/lib/mods";

const MODS_DIR = "/opt/7dtd/mods";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    sanitizeModName(name);

    const status = await VmClient.inCluster().getStatus();
    if (status.vmiPhase !== "Running" || !status.ipAddress) {
      return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
    }
    const ssh = SshClient.fromEnv(status.ipAddress);
    await ssh.exec(`sudo rm -rf -- '${MODS_DIR}/${name}'`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
