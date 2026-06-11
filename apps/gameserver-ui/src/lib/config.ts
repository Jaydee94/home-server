export function extractConfigValue(xml: string, key: string): string | null {
  const m = xml.match(new RegExp(`<property\\s+name="${key}"\\s+value="([^"]*)"`, "i"));
  return m ? m[1] : null;
}

export function injectConfigValue(xml: string, key: string, value: string): string {
  return xml.replace(
    new RegExp(`(<property\\s+name="${key}"\\s+value=")[^"]*(")`,"i"),
    `$1${value}$2`
  );
}
