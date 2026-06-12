import { describe, it, expect } from "vitest";
import { parseTarEntries } from "@/lib/tarReader";

// Baut einen 512-Byte tar-Header mit Name + Oktal-Größe (reicht für unseren Parser).
function header(name: string, size: number): Buffer {
  const b = Buffer.alloc(512);
  b.write(name, 0, "utf8");
  b.write(size.toString(8).padStart(11, "0") + "\0", 124, "ascii"); // size-Feld @124
  return b;
}
function dataBlocks(size: number): Buffer {
  return Buffer.alloc(Math.ceil(size / 512) * 512);
}
function buildTar(entries: { name: string; size: number }[]): Buffer {
  const parts: Buffer[] = [];
  for (const e of entries) {
    parts.push(header(e.name, e.size));
    if (e.size > 0) parts.push(dataBlocks(e.size));
  }
  parts.push(Buffer.alloc(1024)); // zwei Null-Blöcke = Archiv-Ende
  return Buffer.concat(parts);
}

describe("parseTarEntries", () => {
  it("liest Name + Größe aller Einträge", () => {
    const tar = buildTar([
      { name: "Saves/Navezgane/HomeGame/serverconfig.xml", size: 1787 },
      { name: "Saves/Navezgane/HomeGame/Region/", size: 0 },
      { name: "Saves/Navezgane/HomeGame/Region/r.0.0.7rg", size: 65536 },
    ]);
    expect(parseTarEntries(tar)).toEqual([
      { name: "Saves/Navezgane/HomeGame/serverconfig.xml", size: 1787 },
      { name: "Saves/Navezgane/HomeGame/Region/", size: 0 },
      { name: "Saves/Navezgane/HomeGame/Region/r.0.0.7rg", size: 65536 },
    ]);
  });
  it("stoppt am Null-Block (Archiv-Ende), ignoriert Padding", () => {
    expect(parseTarEntries(buildTar([{ name: "a.txt", size: 3 }]))).toEqual([
      { name: "a.txt", size: 3 },
    ]);
  });
  it("gibt leeres Array für leeres/Null-Archiv", () => {
    expect(parseTarEntries(Buffer.alloc(1024))).toEqual([]);
  });
});
