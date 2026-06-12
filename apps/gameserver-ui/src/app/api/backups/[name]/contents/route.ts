import { NextResponse } from "next/server";
import { backupFilePath } from "@/lib/backups";
import { parseTarEntries } from "@/lib/tarReader";
import { existsSync, readFileSync } from "fs";
import { gunzipSync } from "zlib";
import { join } from "path";

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
    const entries = parseTarEntries(gunzipSync(readFileSync(path)));
    return NextResponse.json({ entries });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
