import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";
import { telnetCommand, telnetOptsFromEnv } from "@/lib/telnet";
import { listBackups, backupFilePath } from "@/lib/backups";
import { mkdirSync, createWriteStream, existsSync, unlinkSync, renameSync } from "fs";
import { join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

const backupDir = () =>
  join(process.env.NAS_MOUNT_PATH ?? "/mnt/gameserver-data", "backups");

export async function GET() {
  return NextResponse.json({ backups: listBackups(backupDir()) });
}

export async function POST() {
  try {
    const status = await VmClient.inCluster().getStatus();
    if (status.vmiPhase !== "Running" || !status.ipAddress) {
      return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
    }

    const ip = status.ipAddress;
    const ssh = SshClient.fromEnv(ip);
    const dir = backupDir();
    mkdirSync(dir, { recursive: true });

    // 1. Spielwelt in der VM speichern
    await telnetCommand(ssh, telnetOptsFromEnv(), "saveworld");

    // 2. tar-Stream über SSH auf NAS schreiben
    const now = new Date().toISOString().replace(/:/g, "-").slice(0, 19);
    const filename = `backup-${now}.tar.gz`;
    const destPath = backupFilePath(dir, filename);

    const partialPath = destPath + ".partial";
    try {
      const sshStream = ssh.stream("sudo tar czf - /opt/7dtd/data/Saves 2>/dev/null");
      await pipeline(Readable.fromWeb(sshStream as any), createWriteStream(partialPath));
      renameSync(partialPath, destPath);
    } catch (err) {
      if (existsSync(partialPath)) unlinkSync(partialPath);
      throw err;
    }

    return NextResponse.json({ ok: true, filename });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
