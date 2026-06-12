import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";
import { parseWorlds } from "@/lib/configModel";

const LIST_CMD =
  "sudo docker exec 7dtd-server bash -lc " +
  "'ls -1 /home/sdtdserver/serverfiles/Data/Worlds 2>/dev/null; " +
  "ls -1 /home/sdtdserver/.local/share/7DaysToDie/GeneratedWorlds 2>/dev/null'";

export async function GET() {
  try {
    const status = await VmClient.inCluster().getStatus();
    if (status.vmiPhase !== "Running" || !status.ipAddress) {
      return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
    }
    const ssh = SshClient.fromEnv(status.ipAddress);
    const out = await ssh.exec(LIST_CMD);
    return NextResponse.json({ worlds: parseWorlds(out) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
