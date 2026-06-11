"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Table } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/feedback/ToastProvider";

interface Player { name: string; id: string; level: number; }

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function load() {
    const res = await fetch("/api/players");
    if (res.ok) setPlayers((await res.json()).players);
    else setPlayers([]);
  }
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

  async function broadcast() {
    if (!message.trim()) return;
    setBusy(true);
    const r = await fetch("/api/players", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "broadcast", message }) });
    setBusy(false); setMessage("");
    toast(r.ok ? "ok" : "error", r.ok ? "Nachricht gesendet" : "Senden fehlgeschlagen");
  }

  return (
    <main style={{ display: "grid", gap: "var(--sp-4)" }}>
      <h1 style={{ fontSize: 20 }}>Spieler {players ? `(${players.length})` : ""}</h1>
      <Card>
        {!players ? <Skeleton height={80} /> : players.length === 0 ? <EmptyState>Keine Spieler online</EmptyState> : (
          <Table>
            <thead><tr><th>Name</th><th>Level</th></tr></thead>
            <tbody>{players.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.level}</td></tr>)}</tbody>
          </Table>
        )}
      </Card>
      <Card title="Broadcast an alle Spieler">
        <div style={{ display: "flex", gap: "var(--sp-2)" }}>
          <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Nachricht…"
            style={{ flex: 1, padding: "var(--sp-2) var(--sp-3)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--fg)" }} />
          <Button variant="primary" disabled={busy || !message.trim()} onClick={broadcast}>📢 Senden</Button>
        </div>
      </Card>
    </main>
  );
}
