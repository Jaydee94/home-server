import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";

const MODS_DIR = "/opt/7dtd/mods";

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
      .map((name) => ({ name, sizeBytes: 0 }));
    return NextResponse.json({ mods });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const status = await VmClient.inCluster().getStatus();
    if (status.vmiPhase !== "Running" || !status.ipAddress) {
      return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Kein File-Field" }, { status: 400 });
    if (!file.name.endsWith(".zip")) {
      return NextResponse.json({ error: "Nur .zip-Dateien erlaubt" }, { status: 400 });
    }

    const ssh = SshClient.fromEnv(status.ipAddress);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const b64 = Buffer.from(bytes).toString("base64");
    const CHUNK = 65536;

    await ssh.exec(`rm -f /tmp/mod_upload.zip /tmp/mod_upload.b64`);
    for (let i = 0; i < b64.length; i += CHUNK) {
      const chunk = b64.slice(i, i + CHUNK);
      const op = i === 0 ? ">" : ">>";
      await ssh.exec(`printf '%s' '${chunk}' ${op} /tmp/mod_upload.b64`);
    }
    await ssh.exec(
      `base64 -d /tmp/mod_upload.b64 > /tmp/mod_upload.zip && rm /tmp/mod_upload.b64`
    );
    // Zip-Slip-Prüfung: Python3 ist auf Ubuntu immer verfügbar
    await ssh.exec(
      `python3 -c "import zipfile,sys; z=zipfile.ZipFile('/tmp/mod_upload.zip'); bad=[n for n in z.namelist() if n.startswith('/') or '..' in n.split('/')]; sys.exit(1) if bad else sys.exit(0)" || (rm -f /tmp/mod_upload.zip; exit 1)`
    );
    await ssh.exec(
      `sudo mkdir -p ${MODS_DIR} && sudo unzip -o /tmp/mod_upload.zip -d ${MODS_DIR} && sudo rm /tmp/mod_upload.zip`
    );

    return NextResponse.json({ ok: true, name: file.name.replace(".zip", "") });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
