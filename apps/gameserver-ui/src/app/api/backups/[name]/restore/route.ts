import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";
import { backupFilePath } from "@/lib/backups";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const backupDir = () =>
  join(process.env.NAS_MOUNT_PATH ?? "/mnt/gameserver-data", "backups");

// Limitierung: Restore über base64-Chunking via SSH.
// Funktioniert zuverlässig für Saves bis ~200 MB; bei größeren Saves
// wäre ein NFS-Mount der VM auf das NAS die skalierbarere Lösung.
const CHUNK_SIZE = 65536; // 64 KB base64-Chunks (vermeidet ARG_MAX)

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
    await ssh.exec("sudo docker stop 7dtd-server");

    // Backup in Chunks als base64 in die VM übertragen
    const fileContent = readFileSync(filePath);
    const b64 = fileContent.toString("base64");

    await ssh.exec("sudo rm -f /tmp/restore.b64");
    for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
      const chunk = b64.slice(i, i + CHUNK_SIZE);
      const op = i === 0 ? ">" : ">>";
      // printf statt echo um Backslash-Interpretation zu vermeiden
      await ssh.exec(`printf '%s' '${chunk}' ${op} /tmp/restore.b64`);
    }

    // Saves-Verzeichnis leeren und Archiv entpacken
    await ssh.exec(
      "base64 -d /tmp/restore.b64 | sudo tar xzf - -C /opt/7dtd/data/Saves --strip-components=3 2>/dev/null; sudo rm -f /tmp/restore.b64",
    );

    // Server wieder starten
    await ssh.exec("sudo docker start 7dtd-server");

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
