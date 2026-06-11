import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const VM_CONFIG_PATH = "/opt/7dtd/config/serverconfig.xml";

async function getSsh() {
  const status = await VmClient.inCluster().getStatus();
  if (status.vmiPhase !== "Running" || !status.ipAddress) return null;
  return SshClient.fromEnv(status.ipAddress);
}

export async function GET() {
  try {
    const ssh = await getSsh();
    if (!ssh) return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
    const xml = await ssh.exec(`cat ${VM_CONFIG_PATH}`);
    return NextResponse.json({ xml });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

export async function PUT(req: Request) {
  try {
    const { xml } = await req.json().catch(() => ({}));
    if (!xml || typeof xml !== "string") {
      return NextResponse.json({ error: "xml fehlt" }, { status: 400 });
    }

    const ssh = await getSsh();
    if (!ssh) return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });

    // Über SSH in die VM schreiben (base64 um Sonderzeichen zu vermeiden)
    const b64 = Buffer.from(xml).toString("base64");
    await ssh.exec(`echo '${b64}' | base64 -d | sudo tee ${VM_CONFIG_PATH} > /dev/null`);

    // Docker-Container neu starten
    await ssh.exec("sudo docker restart 7dtd-server");

    // Auf NAS persistieren wenn Mount verfügbar
    const nasDir = process.env.NAS_MOUNT_PATH ?? "/mnt/gameserver-data";
    if (existsSync(nasDir)) {
      try {
        mkdirSync(nasDir, { recursive: true });
        writeFileSync(join(nasDir, "serverconfig.xml"), xml);
      } catch { /* NAS optional */ }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
