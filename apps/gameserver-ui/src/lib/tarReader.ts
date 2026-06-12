export interface TarEntry {
  name: string;
  size: number;
}

// Liest die Einträge (Name + Größe) eines ENTPACKTEN tar-Buffers aus dem
// POSIX/ustar-Format: 512-Byte-Header pro Eintrag (Name @0..100, Oktal-Größe
// @124..136), gefolgt von den Daten (auf 512 aufgerundet). Ein Null-Block
// (Name-Byte = 0) markiert das Archiv-Ende. Bewusst minimal — wir brauchen nur
// die Datei-Liste, keine Inhalte/Validierung.
export function parseTarEntries(tar: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let off = 0;
  while (off + 512 <= tar.length) {
    if (tar[off] === 0) break; // leerer Header → Archiv-Ende
    const name = tar.toString("utf8", off, off + 100).replace(/\0.*$/, "");
    const sizeOctal = tar.toString("ascii", off + 124, off + 136).replace(/[\0 ]/g, "");
    const size = sizeOctal ? parseInt(sizeOctal, 8) : 0;
    if (name) entries.push({ name, size });
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}
