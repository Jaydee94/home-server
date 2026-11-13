export interface TarEntry {
  name: string;
  size: number;
}

const BLOCK = 512;

// Liest die Einträge (Name + Größe) eines ENTPACKTEN tar-Datenstroms im
// POSIX/ustar-Format: 512-Byte-Header pro Eintrag (Name @0..100, Oktal-Größe
// @124..136), gefolgt von den Daten (auf 512 aufgerundet). Ein Null-Block
// (Name-Byte = 0) markiert das Archiv-Ende. Bewusst minimal — wir brauchen nur
// die Datei-Liste, keine Inhalte/Validierung.
//
// Der Parser arbeitet streamend: `push()` nimmt Chunks beliebiger Größe an, im
// Speicher liegt immer nur ein Header (512 Byte) — nie das ganze Archiv.
export class TarEntryParser {
  readonly entries: TarEntry[] = [];
  /** true, sobald der Null-Block (Archiv-Ende) gelesen wurde. */
  done = false;

  private header = Buffer.alloc(BLOCK);
  private headerFill = 0;
  private skip = 0; // noch zu überspringende Datenbytes des aktuellen Eintrags

  push(chunk: Uint8Array): void {
    let off = 0;
    while (off < chunk.length && !this.done) {
      if (this.skip > 0) {
        const n = Math.min(this.skip, chunk.length - off);
        this.skip -= n;
        off += n;
        continue;
      }
      const n = Math.min(BLOCK - this.headerFill, chunk.length - off);
      this.header.set(chunk.subarray(off, off + n), this.headerFill);
      this.headerFill += n;
      off += n;
      if (this.headerFill === BLOCK) {
        this.headerFill = 0;
        this.readHeader();
      }
    }
  }

  private readHeader(): void {
    const h = this.header;
    if (h[0] === 0) { // leerer Header → Archiv-Ende
      this.done = true;
      return;
    }
    const name = h.toString("utf8", 0, 100).replace(/\0.*$/, "");
    const sizeOctal = h.toString("ascii", 124, 136).replace(/[\0 ]/g, "");
    const size = sizeOctal ? parseInt(sizeOctal, 8) : 0;
    if (name) this.entries.push({ name, size });
    this.skip = Math.ceil(size / BLOCK) * BLOCK;
  }
}

// Variante für einen bereits vollständig vorliegenden Buffer.
export function parseTarEntries(tar: Buffer): TarEntry[] {
  const parser = new TarEntryParser();
  parser.push(tar);
  return parser.entries;
}
