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
  // Allowlist: nur alphanumerisch, Unterstrich, Punkt, Bindestrich; max. 64 Zeichen
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(name)) {
    throw new Error(`Ungültiger Mod-Name: ${name}`);
  }
  // Kein führendes '-' (könnte als Flag interpretiert werden) oder '.' (hidden file)
  if (name.startsWith("-") || name.startsWith(".")) {
    throw new Error(`Mod-Name darf nicht mit '-' oder '.' beginnen`);
  }
  return name;
}
