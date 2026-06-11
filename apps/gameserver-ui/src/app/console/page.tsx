"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface Entry { cmd: string; out: string; }

export default function ConsolePage() {
  const [cmd, setCmd] = useState("");
  const [history, setHistory] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);

  async function run(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cmd.trim()) return;
    setBusy(true);
    const r = await fetch("/api/console", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: cmd }) });
    const d = await r.json().catch(() => ({}));
    setHistory((h) => [...h, { cmd, out: r.ok ? d.output : `Fehler: ${d.error ?? r.status}` }]);
    setCmd(""); setBusy(false);
  }

  return (
    <main style={{ display: "grid", gap: "var(--sp-4)" }}>
      <h1 style={{ fontSize: 20 }}>Konsole</h1>
      <Card>
        <pre style={{ background: "var(--bg)", color: "var(--fg)", padding: "var(--sp-3)", height: "55vh", overflowY: "auto", fontSize: 12, borderRadius: 6 }}>
          {history.length === 0 ? <span style={{ color: "var(--fg-dim)" }}>Befehl eingeben…</span> :
            history.map((h, i) => <div key={i}><span style={{ color: "var(--accent)" }}>❯ {h.cmd}</span>{"\n"}{h.out}{"\n"}</div>)}
        </pre>
        <form onSubmit={run} style={{ display: "flex", gap: "var(--sp-2)", marginTop: "var(--sp-3)" }}>
          <input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="z. B. gettime"
            style={{ flex: 1, padding: "var(--sp-2) var(--sp-3)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--fg)", fontFamily: "var(--font-geist-mono)" }} />
          <Button variant="primary" type="submit" disabled={busy || !cmd.trim()}>Senden</Button>
        </form>
      </Card>
    </main>
  );
}
