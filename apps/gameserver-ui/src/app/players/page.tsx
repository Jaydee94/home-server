"use client";
import { useEffect, useState } from "react";

interface Player { name: string; id: string; health: number; level: number; ping: number; }

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/players");
    if (res.ok) { setPlayers((await res.json()).players); setError(""); }
    else { setError((await res.json()).error ?? `Fehler ${res.status}`); }
  }

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

  async function broadcast() {
    if (!message.trim()) return;
    setBusy(true);
    await fetch("/api/players", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "broadcast", message }) });
    setMessage(""); setBusy(false);
  }

  async function saveworld() {
    if (!confirm("Spielwelt jetzt speichern?")) return;
    setBusy(true);
    await fetch("/api/players", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "saveworld" }) });
    setBusy(false);
  }

  return (
    <main style={{ maxWidth: 800, margin: "5vh auto", fontFamily: "sans-serif" }}>
      <h1>Spieler ({players.length})</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <table cellPadding={6} style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
          <th>Name</th><th>Level</th><th>HP</th><th>Ping</th>
        </tr></thead>
        <tbody>
          {players.length === 0 && <tr><td colSpan={4}>Keine Spieler online</td></tr>}
          {players.map(p => (
            <tr key={p.id} style={{ borderBottom: "1px solid #eee" }}>
              <td>{p.name}</td><td>{p.level}</td><td>{p.health}</td><td>{p.ping}ms</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 24 }}>
        <input value={message} onChange={e => setMessage(e.target.value)}
          placeholder="Broadcast-Nachricht" style={{ marginRight: 8, width: 300 }} />
        <button disabled={busy || !message.trim()} onClick={broadcast}>📢 Senden</button>
        {" "}
        <button disabled={busy} onClick={saveworld}>💾 Welt speichern</button>
      </p>
      <p><a href="/">← Dashboard</a></p>
    </main>
  );
}
