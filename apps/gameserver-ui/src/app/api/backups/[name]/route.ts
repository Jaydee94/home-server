import { NextResponse } from "next/server";
import { backupFilePath } from "@/lib/backups";
import { createReadStream, existsSync, unlinkSync, statSync } from "fs";
import { join } from "path";
import { Readable } from "stream";

const backupDir = () =>
  join(process.env.NAS_MOUNT_PATH ?? "/mnt/gameserver-data", "backups");

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    const path = backupFilePath(backupDir(), name);
    if (!existsSync(path))
      return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    unlinkSync(path);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    const path = backupFilePath(backupDir(), name);
    if (!existsSync(path))
      return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;
    return new Response(stream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Length": String(statSync(path).size),
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
