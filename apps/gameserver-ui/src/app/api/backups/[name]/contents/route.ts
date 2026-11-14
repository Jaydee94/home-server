import { NextResponse } from "next/server";
import { backupFilePath } from "@/lib/backups";
import { TarEntryParser } from "@/lib/tarReader";
import { createReadStream, existsSync } from "fs";
import { createGunzip } from "zlib";
import { join } from "path";
import { Writable } from "stream";
import { pipeline } from "stream/promises";

const backupDir = () =>
  join(process.env.NAS_MOUNT_PATH ?? "/mnt/gameserver-data", "backups");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    const path = backupFilePath(backupDir(), name);
    if (!existsSync(path))
      return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

    // Streamend lesen: Datei → gunzip → tar-Header. Im RAM liegen nur die
    // aktuellen Chunks, nicht das (entpackt mehrere GB große) Archiv.
    const parser = new TarEntryParser();
    await pipeline(
      createReadStream(path),
      createGunzip(),
      new Writable({
        write(chunk: Buffer, _enc, done) {
          parser.push(chunk);
          done();
        },
      }),
    );
    return NextResponse.json({ entries: parser.entries });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
