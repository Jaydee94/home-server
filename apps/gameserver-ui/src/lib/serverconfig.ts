export interface ConfigProp { name: string; value: string; }

const PROP_RE = /<property\s+name="([^"]+)"\s+value="([^"]*)"/gi;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
};
const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

// Löst die fünf vordefinierten Entities und numerische Zeichenreferenzen in EINEM
// Durchlauf auf (kein doppeltes Unescaping von "&amp;lt;"). Unbekanntes bleibt stehen.
export function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    const lower = ref.toLowerCase();
    if (lower.startsWith("#")) {
      const code = lower[1] === "x" ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return XML_ENTITIES[lower] ?? whole;
  });
}

export function parseProperties(xml: string): ConfigProp[] {
  const out: ConfigProp[] = [];
  for (const m of xml.matchAll(PROP_RE)) out.push({ name: m[1], value: unescapeXml(m[2]) });
  return out;
}

// Entfernt die <property name="…">-Zeile (inkl. evtl. nachgestelltem Kommentar bis
// Zeilenende) vollständig aus dem XML. Unbekannter Name → unverändert.
export function removeProperty(xml: string, name: string): string {
  const re = new RegExp(`^[ \\t]*<property\\s+name="${escapeRegExp(name)}"[^>]*/>.*(?:\\r?\\n|$)`, "im");
  return xml.replace(re, "");
}

// Setzt Property-Werte im XML. Werte werden XML-escaped und über eine
// Replacement-FUNKTION eingesetzt — als Replacement-String würden `$1`, `$&` & Co.
// im Wert als Muster interpretiert und ein `"` das Attribut aufbrechen (danach
// startet der Server nicht mehr).
export function serializeProperties(xml: string, changes: Record<string, string>): string {
  let out = xml;
  for (const [name, value] of Object.entries(changes)) {
    if (!name || /["<>&]/.test(name)) throw new Error(`Ungültiger Property-Name: ${name}`);
    const escaped = escapeXml(value);
    const re = new RegExp(`(<property\\s+name="${escapeRegExp(name)}"\\s+value=")[^"]*(")`, "i");
    if (re.test(out)) {
      out = out.replace(re, (_m, pre: string, post: string) => `${pre}${escaped}${post}`);
    } else {
      // Fehlende Property vor dem schließenden Tag ergänzen, damit auch nicht
      // bereits vorhandene Einstellungen gesetzt werden können.
      const entry = `\t<property name="${name}" value="${escaped}"/>\n`;
      out = out.replace(/([ \t]*<\/ServerSettings>)/i, (_m, close: string) => `${entry}${close}`);
    }
  }
  return out;
}

const BARE_AMP = /&(?!(?:lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;

// Prüft, ob `xml` eine wohlgeformte serverconfig.xml ist (genau ein Wurzelelement
// <ServerSettings>, Tags balanciert, Attribute korrekt gequotet/escaped). Liefert
// `null` oder eine Fehlermeldung. Bewusst ein kleiner eigener Scanner statt einer
// XML-Bibliothek: DOCTYPE/CDATA kommen in der Datei nicht vor und werden abgelehnt.
export function validateServerConfigXml(xml: string): string | null {
  const NAME = /[A-Za-z_:][\w:.-]*/y;
  const WS = /\s*/y;
  const ATTR_VALUE = /"([^"]*)"|'([^']*)'/y;
  let i = xml.charCodeAt(0) === 0xfeff ? 1 : 0;
  const stack: string[] = [];
  let rootSeen = false;

  const fail = (msg: string) => `${msg} (Zeile ${xml.slice(0, i).split("\n").length})`;
  const take = (re: RegExp): RegExpExecArray | null => {
    re.lastIndex = i;
    const m = re.exec(xml);
    if (m) i += m[0].length;
    return m;
  };

  while (i < xml.length) {
    if (xml.startsWith("<!--", i)) {
      const end = xml.indexOf("-->", i + 4);
      if (end < 0) return fail("Kommentar nicht geschlossen");
      i = end + 3;
    } else if (xml.startsWith("<?", i)) {
      const end = xml.indexOf("?>", i + 2);
      if (end < 0) return fail("Verarbeitungsanweisung nicht geschlossen");
      i = end + 2;
    } else if (xml.startsWith("</", i)) {
      i += 2;
      const name = take(NAME);
      take(WS);
      if (!name || xml[i] !== ">") return fail("Ungültiges schließendes Tag");
      const open = stack.pop();
      if (open !== name[0]) return fail(`</${name[0]}> passt nicht zu ${open ? `<${open}>` : "einem offenen Tag"}`);
      i += 1;
    } else if (xml[i] === "<") {
      i += 1;
      const name = take(NAME);
      if (!name) return fail("Ungültiges Tag");
      if (stack.length === 0) {
        if (rootSeen) return fail("Mehr als ein Wurzelelement");
        if (name[0] !== "ServerSettings") return fail("Wurzelelement muss <ServerSettings> sein");
        rootSeen = true;
      }
      const attrs = new Set<string>();
      let selfClosing = false;
      for (;;) {
        const ws = take(WS);
        if (xml.startsWith("/>", i)) { i += 2; selfClosing = true; break; }
        if (xml[i] === ">") { i += 1; break; }
        const attr = ws && ws[0].length > 0 ? take(NAME) : null;
        if (!attr) return fail(`Ungültiges Tag <${name[0]}>`);
        if (attrs.has(attr[0])) return fail(`Attribut ${attr[0]} doppelt`);
        attrs.add(attr[0]);
        take(WS);
        if (xml[i] !== "=") return fail(`Attribut ${attr[0]} ohne Wert`);
        i += 1;
        take(WS);
        const value = take(ATTR_VALUE);
        if (!value) return fail(`Attribut ${attr[0]} nicht korrekt in Anführungszeichen`);
        const text = value[1] ?? value[2];
        if (text.includes("<") || BARE_AMP.test(text)) {
          return fail(`Attribut ${attr[0]} enthält ein unescaptes < oder &`);
        }
      }
      if (!selfClosing) stack.push(name[0]);
    } else {
      const next = xml.indexOf("<", i);
      const text = xml.slice(i, next < 0 ? xml.length : next);
      if (stack.length === 0 && text.trim() !== "") return fail("Text außerhalb des Wurzelelements");
      if (BARE_AMP.test(text)) return fail("Unescaptes &");
      i += text.length;
    }
  }
  if (stack.length > 0) return fail(`<${stack[stack.length - 1]}> nicht geschlossen`);
  if (!rootSeen) return "Kein <ServerSettings>-Wurzelelement";
  return null;
}
