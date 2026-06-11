export interface ModInfo {
  name: string;
  sizeBytes: number;
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
