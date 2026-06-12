export interface ModInfo {
  name: string;
  sizeBytes: number;
  protected: boolean;
}

// Mitgelieferte Stock-Mods (TFP/Beispiel-Mods aus dem vinanrra-Image) dürfen nicht
// gelöscht werden — 0_TFP_Harmony ist z. B. zwingend für DLL-Mods. Erkennung per
// Präfix nach TFP-Namenskonvention; case-sensitive, da die echten Ordnernamen
// großgeschrieben sind.
const PROTECTED_PREFIXES = ["0_TFP", "TFP_", "Xample_"];

export function isProtectedMod(name: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function sanitizeModName(name: string): string {
  if (!name) throw new Error("Mod-Name darf nicht leer sein");
  if (name.length > 128) throw new Error("Mod-Name zu lang (max. 128 Zeichen)");
  // Pfad-Traversal und Null-Byte blockieren
  if (name.includes("/") || name.includes("\x00") || name.includes("\n") || name.includes("\r")) {
    throw new Error(`Ungültiger Mod-Name: ${name}`);
  }
  if (name === "." || name === "..") throw new Error(`Ungültiger Mod-Name: ${name}`);
  // Kein führendes '-' (Shell-Flag) oder '.' (hidden file)
  if (name.startsWith("-") || name.startsWith(".")) {
    throw new Error(`Mod-Name darf nicht mit '-' oder '.' beginnen`);
  }
  return name;
}

// Escapet einen String für die Verwendung innerhalb von bash single-quotes:
// Das einzige Zeichen das aus single-quotes ausbricht ist ' selbst → '\'' ersetzen.
export function escapeForShellSingleQuote(s: string): string {
  return s.replace(/'/g, "'\\''");
}
