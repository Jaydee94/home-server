"use client";
import { useEffect, useRef, useState } from "react";

interface LogLine { id: number; text: string; }

let lineCounter = 0;

export default function LogsPage() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [metrics, setMetrics] = useState<{ cpuPercent: number | null; memoryMb: number | null } | null>(null);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const es = new EventSource("/api/logs");
    es.onmessage = (e) => {
      setLines(prev => [...prev.slice(-499), { id: lineCounter++, text: e.data }]);
    };
    es.onerror = () => { setError("Log-Stream unterbrochen"); es.close(); };
    return () => es.close();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 50;
    if (isAtBottom) el.scrollTop = el.scrollHeight;
  }, [lines]);

  useEffect(() => {
    async function loadMetrics() {
      const res = await fetch("/api/metrics");
      if (res.ok) setMetrics(await res.json());
    }
    loadMetrics();
    const t = setInterval(loadMetrics, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <main style={{ maxWidth: 1000, margin: "5vh auto", fontFamily: "sans-serif" }}>
      <h1>Logs & Monitoring</h1>
      {metrics ? (
        <p>
          CPU: <strong>{metrics.cpuPercent !== null ? `${metrics.cpuPercent}%` : "—"}</strong>
          {" | "}
          RAM: <strong>{metrics.memoryMb !== null ? `${metrics.memoryMb} MB` : "—"}</strong>
        </p>
      ) : (
        <p style={{ color: "#888" }}>Metriken laden…</p>
      )}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <pre
        ref={containerRef}
        style={{ background: "#111", color: "#eee", padding: 16, height: "60vh", overflowY: "auto", fontSize: 12 }}
      >
        {lines.map(l => <div key={l.id}>{l.text}</div>)}
      </pre>
      <p><a href="/">← Dashboard</a></p>
    </main>
  );
}
