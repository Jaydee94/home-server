import { CONFIG_SCHEMA, CATEGORIES, type FieldDef } from "@/lib/configSchema";
import { parseProperties } from "@/lib/serverconfig";

export interface ConfigField extends FieldDef {
  current: string;
  inFile: boolean;
}

export interface ConfigGroup {
  category: string;
  fields: ConfigField[];
}

// Mergt Schema-Defaults mit den Werten aus der serverconfig.xml und gruppiert nach
// Kategorie. Unbekannte Properties aus dem File (kein Schema-Eintrag) landen in
// "Sonstige" als Textfeld. Es werden nur Kategorien mit Feldern zurückgegeben.
export function buildConfigModel(xml: string, schema: FieldDef[] = CONFIG_SCHEMA): ConfigGroup[] {
  const fileValues = new Map(parseProperties(xml).map((p) => [p.name, p.value]));
  const known = new Set(schema.map((f) => f.name));

  const fields: ConfigField[] = schema.map((f) => ({
    ...f,
    current: fileValues.get(f.name) ?? f.default,
    inFile: fileValues.has(f.name),
  }));

  for (const [name, value] of fileValues) {
    if (known.has(name)) continue;
    fields.push({
      name,
      label: name,
      category: "Sonstige",
      type: "text",
      description: "Unbekannte Property (nicht im V2.6-Schema).",
      default: "",
      current: value,
      inFile: true,
    });
  }

  return CATEGORIES.map((category) => ({
    category,
    fields: fields.filter((f) => f.category === category),
  })).filter((g) => g.fields.length > 0);
}

// Baut die Auswahlliste für GameWorld aus der ls-Ausgabe der Welt-Verzeichnisse.
// Dedupliziert, ergänzt immer "RWG" (Zufallswelt) und sortiert (RWG zuerst).
export function parseWorlds(lsOutput: string): string[] {
  const names = lsOutput
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.endsWith(":")); // Marker-Zeilen wie "SHIPPED:" ignorieren
  const unique = [...new Set(names)].filter((n) => n !== "RWG").sort();
  return ["RWG", ...unique];
}
