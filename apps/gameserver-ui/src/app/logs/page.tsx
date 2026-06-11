"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface LogLine { id: number; text: string; }
let lineCounter = 0;

export default function LogsPage() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    const es = new EventSource("/api/logs");
    es.onmessage = (e) => { if (!pausedRef.current) setLines((prev) => [...prev.slice(-499), { id: lineCounter++, text: e.data }]); };
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  const filtered = useMemo(() => query ? lines.filter((l) => l.text.toLowerCase().includes(query.toLowerCase())) : lines, [lines, query]);
  useEffect(() => { const el = ref.current; if (el && !paused) el.scrollTop = el.scrollHeight; }, [filtered, paused]);

  function download() {
    const blob = new Blob([lines.map((l) => l.text).join("\n")], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "7dtd-logs.txt"; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <main style={{ display: "grid", gap: "var(--sp-4)" }}>
      <h1 style={{ fontSize: 20 }}>Logs</h1>
      <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Suchen…"
          style={{ flex: 1, minWidth: 160, padding: "var(--sp-2) var(--sp-3)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--fg)" }} />
        <Button variant="secondary" onClick={() => setPaused((p) => !p)}>{paused ? "▶ Fortsetzen" : "⏸ Pause"}</Button>
        <Button variant="secondary" onClick={() => navigator.clipboard.writeText(lines.map((l) => l.text).join("\n"))}>⧉ Kopieren</Button>
        <Button variant="secondary" onClick={download}>⬇ Download</Button>
      </div>
      <Card>
        <pre ref={ref} style={{ background: "var(--bg)", color: "var(--fg)", padding: "var(--sp-3)", height: "60vh", overflowY: "auto", fontSize: 12, borderRadius: 6 }}>
          {filtered.map((l) => <div key={l.id}>{l.text}</div>)}
        </pre>
      </Card>
    </main>
  );
}
