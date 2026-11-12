export function extractConfigValue(xml: string, key: string): string | null {
  const m = xml.match(new RegExp(`<property\\s+name="${key}"\\s+value="([^"]*)"`, "i"));
  return m ? m[1] : null;
}
