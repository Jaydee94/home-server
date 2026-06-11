"use client";
import { useEffect, useState } from "react";

interface BackupMeta {
  filename: string;
  timestamp: string;
  sizeBytes: number;
}

export default function BackupsPage() {
  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/backups");
    if (res.ok) {
      setBackups((await res.json()).backups);
      setError("");
    } else {
      setError("Fehler beim Laden");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!confirm("Neues Backup erstellen? Das kann einige Minuten dauern.")) return;
    setBusy(true);
    setMsg("");
    setError("");
    const res = await fetch("/api/backups", { method: "POST" });
    setBusy(false);
    if (res.ok) {
      setMsg("Backup erstellt");
      load();
    } else {
      setError("Fehler: " + ((await res.json()).error ?? "unbekannt"));
    }
  }

  async function restore(filename: string) {
    if (!confirm(`Backup "${filename}" wiederherstellen? Der Server wird gestoppt.`)) return;
    setBusy(true);
    setMsg("");
    setError("");
    const res = await fetch(`/api/backups/${encodeURIComponent(filename)}/restore`, {
      method: "POST",
    });
    setBusy(false);
    if (res.ok) {
      setMsg("Wiederhergestellt");
    } else {
      setError("Fehler: " + ((await res.json()).error ?? "unbekannt"));
    }
  }

  return (
    <main style={{ maxWidth: 800, margin: "5vh auto", fontFamily: "sans-serif" }}>
      <h1>Spielwelt-Backups</h1>
      {msg && <p style={{ color: "green" }}>{msg}</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <p>
        <button disabled={busy} onClick={create}>
          Backup erstellen
        </button>
      </p>
      <table cellPadding={6} style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th>Zeitpunkt</th>
            <th>Groesse</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {backups.length === 0 && (
            <tr>
              <td colSpan={3}>Keine Backups vorhanden</td>
            </tr>
          )}
          {backups.map((b) => (
            <tr key={b.filename} style={{ borderBottom: "1px solid #eee" }}>
              <td>{b.timestamp}</td>
              <td>{(b.sizeBytes / 1024 / 1024).toFixed(1)} MB</td>
              <td>
                <button disabled={busy} onClick={() => restore(b.filename)}>
                  Restore
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <a href="/">Dashboard</a>
      </p>
    </main>
  );
}
