import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { gzipSync } from "zlib";
import { tmpdir } from "os";
import { join } from "path";

// Die Route darf das Archiv nicht mehr komplett in den RAM laden: readFileSync und
// gunzipSync sind hier verboten — gelesen wird streamend.
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    readFileSync: vi.fn(() => { throw new Error("readFileSync darf nicht benutzt werden"); }),
  };
});
vi.mock("zlib", async (importOriginal) => {
  const actual = await importOriginal<typeof import("zlib")>();
  return {
    ...actual,
    gunzipSync: vi.fn(() => { throw new Error("gunzipSync darf nicht benutzt werden"); }),
  };
});

import { GET } from "@/app/api/backups/[name]/contents/route";

function header(name: string, size: number): Buffer {
  const b = Buffer.alloc(512);
  b.write(name, 0, "utf8");
  b.write(size.toString(8).padStart(11, "0") + "\0", 124, "ascii");
  return b;
}

let root: string;
const call = (name: string) =>
  GET(new Request("http://x/api/backups/x/contents"), { params: Promise.resolve({ name }) });

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "gsui-contents-"));
  mkdirSync(join(root, "backups"));
  process.env.NAS_MOUNT_PATH = root;
  const tar = Buffer.concat([
    header("opt/7dtd/data/Saves/Navezgane/HomeGame/main.ttw", 700),
    Buffer.alloc(1024),
    header("opt/7dtd/data/Saves/Navezgane/HomeGame/Region/r.0.0.7rg", 300000),
    Buffer.alloc(Math.ceil(300000 / 512) * 512),
    Buffer.alloc(1024),
  ]);
  writeFileSync(join(root, "backups", "backup-2026-01-01T00-00-00.tar.gz"), gzipSync(tar));
  writeFileSync(join(root, "backups", "kaputt.tar.gz"), Buffer.from("kein gzip"));
  writeFileSync(join(root, "geheim.tar.gz"), gzipSync(tar));
});

afterAll(() => {
  delete process.env.NAS_MOUNT_PATH;
  rmSync(root, { recursive: true, force: true });
});

describe("/api/backups/[name]/contents", () => {
  it("listet die Einträge, ohne das Archiv am Stück zu laden", async () => {
    const res = await call("backup-2026-01-01T00-00-00.tar.gz");
    expect(res.status).toBe(200);
    expect((await res.json()).entries).toEqual([
      { name: "opt/7dtd/data/Saves/Navezgane/HomeGame/main.ttw", size: 700 },
      { name: "opt/7dtd/data/Saves/Navezgane/HomeGame/Region/r.0.0.7rg", size: 300000 },
    ]);
  });

  it("liefert 404 für ein unbekanntes Backup", async () => {
    expect((await call("gibt-es-nicht.tar.gz")).status).toBe(404);
  });

  it("liefert 400 für ein defektes Archiv", async () => {
    expect((await call("kaputt.tar.gz")).status).toBe(400);
  });

  it("lehnt Path-Traversal ab (Datei außerhalb des Backup-Verzeichnisses)", async () => {
    const res = await call("../geheim.tar.gz");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Ungültiger Dateiname");
  });
});
