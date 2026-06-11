"use client";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";

interface LogLine { id: number; text: string; }
let lineCounter = 0;

export default function LogsPage() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [error, setError] = useState("");
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const es = new EventSource("/api/logs");
    es.onmessage = (e) => setLines((prev) => [...prev.slice(-499), { id: lineCounter++, text: e.data }]);
    es.onerror = () => { setError("Log-Stream unterbrochen"); es.close(); };
    return () => es.close();
  }, []);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 50) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <main style={{ display: "grid", gap: "var(--sp-4)" }}>
      <h1 style={{ fontSize: 20 }}>Logs</h1>
      {error && <div style={{ color: "var(--danger)" }}>{error}</div>}
      <Card>
        <pre ref={ref} style={{ background: "var(--bg)", color: "var(--fg)", padding: "var(--sp-3)", height: "65vh", overflowY: "auto", fontSize: 12, borderRadius: 6 }}>
          {lines.map((l) => <div key={l.id}>{l.text}</div>)}
        </pre>
      </Card>
    </main>
  );
}
