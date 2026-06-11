export interface ModInfo {
  name: string;
  sizeBytes: number;
}

export function sanitizeModName(name: string): string {
  if (!name) throw new Error("Mod-Name darf nicht leer sein");
  // Blockt Pfad-Traversal, Shell-Sonderzeichen und Nicht-ASCII
  if (/[/\\'"`;$&|<>(){}\[\]!]/.test(name) || name.includes("..")) {
    throw new Error(`Ungültiger Mod-Name: ${name}`);
  }
  return name;
}
