"use client";
import { useEffect, useRef, useState } from "react";

interface ModInfo {
  name: string;
  sizeBytes: number;
}

export default function ModsPage() {
  const [mods, setMods] = useState<ModInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/mods");
    if (res.ok) {
      setMods((await res.json()).mods);
      setError("");
    } else {
      setError("Fehler beim Laden");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function upload(file: File) {
    if (!file.name.endsWith(".zip")) {
      setError("Nur .zip-Dateien");
      return;
    }
    setBusy(true);
    setMsg("");
    setError("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/mods", { method: "POST", body: form });
    setBusy(false);
    if (res.ok) {
      setMsg(`✓ ${file.name} installiert`);
      load();
    } else {
      setError("Fehler: " + ((await res.json()).error ?? "unbekannt"));
    }
  }

  async function deleteMod(name: string) {
    if (!confirm(`Mod "${name}" löschen?`)) return;
    setBusy(true);
    setMsg("");
    setError("");
    const res = await fetch(`/api/mods/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (res.ok) {
      setMsg(`✓ ${name} gelöscht`);
      load();
    } else {
      setError("Fehler: " + ((await res.json()).error ?? "unbekannt"));
    }
  }

  return (
    <main style={{ maxWidth: 700, margin: "5vh auto", fontFamily: "sans-serif" }}>
      <h1>Mod-Verwaltung</h1>
      {msg && <p style={{ color: "green" }}>{msg}</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) upload(f);
        }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "#0070f3" : "#ccc"}`,
          borderRadius: 8,
          padding: "2rem",
          textAlign: "center",
          cursor: busy ? "wait" : "pointer",
          background: dragOver ? "#f0f7ff" : "transparent",
          marginBottom: "1.5rem",
        }}
      >
        {busy ? "Wird hochgeladen…" : "Mod-Zip hier ablegen oder klicken"}
        <input
          ref={inputRef}
          type="file"
          accept=".zip"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
      </div>

      <table cellPadding={6} style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th>Mod-Name</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {mods.length === 0 && (
            <tr>
              <td colSpan={2}>Keine Mods installiert</td>
            </tr>
          )}
          {mods.map((m) => (
            <tr key={m.name} style={{ borderBottom: "1px solid #eee" }}>
              <td>{m.name}</td>
              <td>
                <button disabled={busy} onClick={() => deleteMod(m.name)}>
                  Löschen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <a href="/">← Dashboard</a>
      </p>
    </main>
  );
}
