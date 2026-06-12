export interface ConfigProp { name: string; value: string; }

const PROP_RE = /<property\s+name="([^"]+)"\s+value="([^"]*)"/gi;

export function parseProperties(xml: string): ConfigProp[] {
  const out: ConfigProp[] = [];
  for (const m of xml.matchAll(PROP_RE)) out.push({ name: m[1], value: m[2] });
  return out;
}

// Entfernt die <property name="…">-Zeile (inkl. evtl. nachgestelltem Kommentar bis
// Zeilenende) vollständig aus dem XML. Unbekannter Name → unverändert.
export function removeProperty(xml: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^[ \\t]*<property\\s+name="${escaped}"[^>]*/>.*(?:\\r?\\n|$)`, "im");
  return xml.replace(re, "");
}

export function serializeProperties(xml: string, changes: Record<string, string>): string {
  let out = xml;
  for (const [name, value] of Object.entries(changes)) {
    const re = new RegExp(`(<property\\s+name="${name}"\\s+value=")[^"]*(")`, "i");
    if (re.test(out)) {
      out = out.replace(re, `$1${value}$2`);
    } else {
      // Fehlende Property vor dem schließenden Tag ergänzen, damit auch nicht
      // bereits vorhandene Einstellungen gesetzt werden können.
      const entry = `\t<property name="${name}" value="${value}"/>\n`;
      out = out.replace(/([ \t]*<\/ServerSettings>)/i, `${entry}$1`);
    }
  }
  return out;
}
