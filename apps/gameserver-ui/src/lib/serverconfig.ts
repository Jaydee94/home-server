export interface ConfigProp { name: string; value: string; }

const PROP_RE = /<property\s+name="([^"]+)"\s+value="([^"]*)"/gi;

export function parseProperties(xml: string): ConfigProp[] {
  const out: ConfigProp[] = [];
  for (const m of xml.matchAll(PROP_RE)) out.push({ name: m[1], value: m[2] });
  return out;
}

export function serializeProperties(xml: string, changes: Record<string, string>): string {
  let out = xml;
  for (const [name, value] of Object.entries(changes)) {
    const re = new RegExp(`(<property\\s+name="${name}"\\s+value=")[^"]*(")`, "i");
    if (re.test(out)) out = out.replace(re, `$1${value}$2`);
  }
  return out;
}
