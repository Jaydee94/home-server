import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { VmClient } from "@/lib/k8s";
import { SshClient, LONG_EXEC_TIMEOUT_MS } from "@/lib/ssh";
import { backupFilePath } from "@/lib/backups";
import { withServerLock } from "@/lib/oplock";
import { createReadStream, existsSync } from "fs";
import { join } from "path";

const backupDir = () =>
  join(process.env.NAS_MOUNT_PATH ?? "/mnt/gameserver-data", "backups");

const DATA_DIR = "/opt/7dtd/data";
const SAVES = `${DATA_DIR}/Saves`;
const PRE_RESTORE = `${DATA_DIR}/Saves.pre-restore`;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const denied = await requireSession();
  if (denied) return denied;

  const { name } = await params;
  return withServerLock("Restore", () => restore(name));
}

async function restore(name: string) {
  try {
    const filePath = backupFilePath(backupDir(), name);
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "Backup nicht gefunden" }, { status: 404 });
    }

    const status = await VmClient.inCluster().getStatus();
    if (status.vmiPhase !== "Running" || !status.ipAddress) {
      return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
    }

    const ssh = SshClient.fromEnv(status.ipAddress);
    const exec = (cmd: string) => ssh.exec(cmd, { timeoutMs: LONG_EXEC_TIMEOUT_MS });
    let movedAside = false;

    try {
      await exec("sudo docker stop 7dtd-server");

      // Bestehende Welt beiseite schieben, statt das Archiv darüber zu entpacken
      // (sonst entsteht ein Mischzustand aus altem und wiederhergestelltem Stand).
      // Ein älteres .pre-restore wird vorher entfernt, sonst landete Saves darin.
      await exec(
        `sudo sh -c 'rm -rf ${PRE_RESTORE}; if [ -d ${SAVES} ]; then mv ${SAVES} ${PRE_RESTORE}; fi'`,
      );
      movedAside = true;

      // Archiv direkt vom NAS in den stdin EINES tar-Kommandos streamen — weder
      // die Datei noch eine base64-Kopie liegen im RAM, und es gibt nur eine
      // SSH-Verbindung statt einer pro 64-KB-Stück. Kein Kommando-Timeout: die
      // Dauer hängt von der Größe der Welt ab.
      // Archive-Pfade: opt/7dtd/data/Saves/... → strip 3 Komponenten → -C /opt/7dtd/data
      await ssh.exec(`sudo tar xzf - -C ${DATA_DIR} --strip-components=3`, {
        stdin: createReadStream(filePath),
        timeoutMs: 0,
      });
    } catch (err) {
      // Entpacken fehlgeschlagen: halb entpackte Welt verwerfen, alten Stand zurück.
      if (movedAside) {
        await exec(
          `sudo sh -c 'if [ -d ${PRE_RESTORE} ]; then rm -rf ${SAVES}; mv ${PRE_RESTORE} ${SAVES}; fi'`,
        ).catch((e: unknown) => {
          console.error("[restore] rollback failed — vorheriger Stand liegt in Saves.pre-restore:", e);
        });
      }
      throw err;
    } finally {
      // Server immer wieder starten, auch bei Fehler
      await exec("sudo docker start 7dtd-server").catch((e: unknown) => {
        console.error("[restore] docker start failed:", e);
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
