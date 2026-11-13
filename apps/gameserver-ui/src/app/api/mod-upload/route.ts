import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { Readable, Transform } from "stream";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import { VmClient } from "@/lib/k8s";
import { SshClient, LONG_EXEC_TIMEOUT_MS } from "@/lib/ssh";
import { MAX_MOD_UPLOAD_BYTES } from "@/lib/mods";
import { requireSession } from "@/lib/session";

const MODS_DIR = "/opt/7dtd/mods";
const TOO_LARGE = `Datei zu groß (max. ${MAX_MOD_UPLOAD_BYTES / 1024 / 1024} MB)`;

class UploadTooLargeError extends Error {}

// Zählt die durchlaufenden Bytes und bricht ab, sobald das Limit überschritten
// ist — greift auch, wenn Content-Length fehlt oder falsch ist.
function limitBytes(max: number): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, done) {
      seen += chunk.length;
      if (seen > max) done(new UploadTooLargeError(TOO_LARGE));
      else done(null, chunk);
    },
  });
}

// Mod-Upload: Die Zip-Datei ist der rohe Request-Body (kein multipart/form-data),
// der Dateiname kommt als Query-Parameter `filename`. Der Body wird als Stream an
// SFTP durchgereicht, statt per formData()/arrayBuffer() mehrfach im RAM zu liegen.
//
// WICHTIG: Diese Route ist in src/middleware.ts vom matcher AUSGENOMMEN — für von
// der Middleware erfasste Requests puffert Next.js den kompletten Body im RAM
// (Pod-Limit 512Mi). Die Session wird deshalb hier geprüft; requireSession() muss
// der erste Schritt bleiben.
export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const filename = new URL(req.url).searchParams.get("filename");
    if (!filename) return NextResponse.json({ error: "Dateiname fehlt" }, { status: 400 });
    if (!filename.endsWith(".zip")) {
      return NextResponse.json({ error: "Nur .zip-Dateien erlaubt" }, { status: 400 });
    }
    if (!req.body) return NextResponse.json({ error: "Keine Datei" }, { status: 400 });
    if (Number(req.headers.get("content-length") ?? 0) > MAX_MOD_UPLOAD_BYTES) {
      return NextResponse.json({ error: TOO_LARGE }, { status: 413 });
    }

    const status = await VmClient.inCluster().getStatus();
    if (status.vmiPhase !== "Running" || !status.ipAddress) {
      return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
    }

    const ssh = SshClient.fromEnv(status.ipAddress);
    // Eindeutiger Pfad pro Upload: parallele Uploads überschreiben sich nicht.
    // Der Name stammt nicht vom Client, ist also sicher in Shell-Kommandos.
    const remotePath = `/tmp/mod_upload_${randomUUID()}.zip`;
    const source = Readable.fromWeb(req.body as NodeReadableStream<Uint8Array>);
    const limited = source.pipe(limitBytes(MAX_MOD_UPLOAD_BYTES));
    source.on("error", (e) => limited.destroy(e));

    try {
      await ssh.sftpPut(limited, remotePath);
      // Zip-Slip-Prüfung vor Extraktion: Python3 ist auf Ubuntu immer verfügbar
      await ssh.exec(
        `python3 -c "import zipfile,sys; z=zipfile.ZipFile('${remotePath}'); bad=[n for n in z.namelist() if n.startswith('/') or '..' in n.split('/')]; sys.exit(1) if bad else sys.exit(0)"`
      );
      await ssh.exec(
        `sudo mkdir -p ${MODS_DIR} && sudo unzip -o ${remotePath} -d ${MODS_DIR}`,
        { timeoutMs: LONG_EXEC_TIMEOUT_MS },
      );
    } finally {
      source.destroy();
      await ssh.exec(`rm -f ${remotePath}`).catch(() => undefined);
    }

    return NextResponse.json({ ok: true, name: filename.replace(".zip", "") });
  } catch (err) {
    if (err instanceof UploadTooLargeError) {
      return NextResponse.json({ error: err.message }, { status: 413 });
    }
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
