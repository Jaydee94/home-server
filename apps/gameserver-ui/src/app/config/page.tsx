"use client";
import { useEffect, useState } from "react";

export default function ConfigPage() {
  const [xml, setXml] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/config").then(r => r.json()).then(d => {
      if (d.xml) setXml(d.xml);
      else setError(d.error ?? "Fehler beim Laden");
    });
  }, []);

  async function save() {
    if (!confirm("serverconfig.xml jetzt ausrollen? 7DTD-Server wird neu gestartet.")) return;
    setSaving(true); setSaved(false);
    const res = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ xml }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    else setError((await res.json()).error ?? "Fehler beim Speichern");
  }

  return (
    <main style={{ maxWidth: 900, margin: "5vh auto", fontFamily: "sans-serif" }}>
      <h1>serverconfig.xml</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {saved && <p style={{ color: "green" }}>✓ Ausgerollt — Server neu gestartet</p>}
      <textarea
        value={xml}
        onChange={e => setXml(e.target.value)}
        style={{ width: "100%", height: "60vh", fontFamily: "monospace", fontSize: 12 }}
      />
      <p>
        <button disabled={saving || !xml} onClick={save}>
          {saving ? "Wird ausgerollt…" : "▶ Ausrollen + Neustart"}
        </button>
      </p>
      <p><a href="/">← Dashboard</a></p>
    </main>
  );
}
