import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";
import { isProtectedMod } from "@/lib/mods";

const MODS_DIR = "/opt/7dtd/mods";

// Der Upload liegt unter /api/mod-upload (eigene Route, weil sie von der
// Middleware ausgenommen ist — siehe dort).
export async function GET() {
  try {
    const status = await VmClient.inCluster().getStatus();
    if (status.vmiPhase !== "Running" || !status.ipAddress) {
      return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
    }
    const ssh = SshClient.fromEnv(status.ipAddress);
    const out = await ssh.exec(`ls -1 ${MODS_DIR} 2>/dev/null || echo ""`);
    const mods = out
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean)
      .map((name) => ({ name, sizeBytes: 0, protected: isProtectedMod(name) }));
    return NextResponse.json({ mods });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
