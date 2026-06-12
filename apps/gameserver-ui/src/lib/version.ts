// Extrahiert die aktive 7DTD-Spielversion aus der Ausgabe des Telnet-Befehls
// `version`, z. B. "Game version: V 2.6 (b14) Compatibility Version: V 2.6 …"
// → "V 2.6 (b14)". Der Teil nach "Compatibility Version" und die "Mod …"-Zeilen
// werden ignoriert.
export function parseVersion(output: string): string | null {
  const m = output.match(/Game version:\s*(.+?)(?:\s+Compatibility Version:|\r|\n|$)/);
  return m ? m[1].trim() : null;
}
