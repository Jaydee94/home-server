export interface ModInfo {
  name: string;
  sizeBytes: number;
}

export function sanitizeModName(name: string): string {
  if (!name || name.includes("/") || name.includes("..") || name.includes("\\")) {
    throw new Error(`Ungültiger Mod-Name: ${name}`);
  }
  return name;
}
