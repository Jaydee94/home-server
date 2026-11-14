import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";
import { SshClient, LONG_EXEC_TIMEOUT_MS } from "@/lib/ssh";
import { backupFilePath } from "@/lib/backups";
import { createReadStream, existsSync } from "fs";
import { join } from "path";

const backupDir = () =>
  join(process.env.NAS_MOUNT_PATH ?? "/mnt/gameserver-data", "backups");

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    const filePath = backupFilePath(backupDir(), name);
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "Backup nicht gefunden" }, { status: 404 });
    }

    const status = await VmClient.inCluster().getStatus();
    if (status.vmiPhase !== "Running" || !status.ipAddress) {
      return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
    }

    const ssh = SshClient.fromEnv(status.ipAddress);

    // Server stoppen
    await ssh.exec("sudo docker stop 7dtd-server", { timeoutMs: LONG_EXEC_TIMEOUT_MS });

    try {
      // Archiv direkt vom NAS in den stdin EINES tar-Kommandos streamen — weder
      // die Datei noch eine base64-Kopie liegen im RAM, und es gibt nur eine
      // SSH-Verbindung statt einer pro 64-KB-Stück. Kein Kommando-Timeout: die
      // Dauer hängt von der Größe der Welt ab.
      // Archive-Pfade: opt/7dtd/data/Saves/... → strip 3 Komponenten → -C /opt/7dtd/data
      await ssh.exec("sudo tar xzf - -C /opt/7dtd/data --strip-components=3", {
        stdin: createReadStream(filePath),
        timeoutMs: 0,
      });
    } finally {
      // Server immer wieder starten, auch bei Fehler
      await ssh
        .exec("sudo docker start 7dtd-server", { timeoutMs: LONG_EXEC_TIMEOUT_MS })
        .catch((e: unknown) => {
          console.error("[restore] docker start failed:", e);
        });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
