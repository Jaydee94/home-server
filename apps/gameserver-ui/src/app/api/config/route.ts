import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";
import { telnetOptsFromEnv } from "@/lib/telnet";
import { restartServer } from "@/lib/restart";
import { withServerLock } from "@/lib/oplock";
import { validateServerConfigXml } from "@/lib/serverconfig";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const VM_CONFIG_PATH = "/opt/7dtd/config/serverconfig.xml";
const VM_CONFIG_BACKUP_PATH = `${VM_CONFIG_PATH}.bak`;

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
  const denied = await requireSession();
  if (denied) return denied;

  const { xml } = await req.json().catch(() => ({}));
  if (!xml || typeof xml !== "string") {
    return NextResponse.json({ error: "xml fehlt" }, { status: 400 });
  }
  // Serverseitig prüfen, bevor irgendetwas angefasst wird: eine kaputte Datei
  // würde den Server beim nächsten Start nicht mehr hochkommen lassen.
  const invalid = validateServerConfigXml(xml);
  if (invalid) {
    return NextResponse.json({ error: `serverconfig.xml ist nicht wohlgeformt: ${invalid}` }, { status: 400 });
  }
  return withServerLock("Config-Rollout", () => applyConfig(xml));
}

async function applyConfig(xml: string) {
  try {
    const ssh = await getSsh();
    if (!ssh) return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });

    // Vorherigen Stand sichern; scheitert das, wird nichts überschrieben.
    await ssh.exec(`sudo cp -p ${VM_CONFIG_PATH} ${VM_CONFIG_BACKUP_PATH}`);

    // Über SSH in die VM schreiben (base64 um Sonderzeichen zu vermeiden)
    const b64 = Buffer.from(xml).toString("base64");
    await ssh.exec(`echo '${b64}' | base64 -d | sudo tee ${VM_CONFIG_PATH} > /dev/null`);

    // Sauberer Neustart (Vorwarnung, saveworld). Ist der Server wegen der alten
    // Config ohnehin down, darf der fehlende Telnet-Port den Neustart nicht blockieren.
    await restartServer(ssh, telnetOptsFromEnv(), { tolerateTelnetFailure: true });

    // Auf NAS persistieren wenn Mount verfügbar
    const nasDir = process.env.NAS_MOUNT_PATH ?? "/mnt/gameserver-data";
    try {
      mkdirSync(nasDir, { recursive: true });
      writeFileSync(join(nasDir, "serverconfig.xml"), xml);
    } catch (e) {
      console.warn("[config] NAS persist failed:", e);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
