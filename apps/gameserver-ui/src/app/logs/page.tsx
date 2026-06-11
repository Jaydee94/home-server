"use client";
import { useEffect, useRef, useState } from "react";

export default function LogsPage() {
  const [lines, setLines] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<{ cpuPercent: number | null; memoryMb: number | null } | null>(null);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource("/api/logs");
    es.onmessage = (e) => setLines(prev => [...prev.slice(-500), e.data]);
    es.onerror = () => { setError("Log-Stream unterbrochen"); es.close(); };
    return () => es.close();
  }, []);

  useEffect(() => {
    async function loadMetrics() {
      const res = await fetch("/api/metrics");
      if (res.ok) setMetrics(await res.json());
    }
    loadMetrics();
    const t = setInterval(loadMetrics, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView(); }, [lines]);

  return (
    <main style={{ maxWidth: 1000, margin: "5vh auto", fontFamily: "sans-serif" }}>
      <h1>Logs & Monitoring</h1>
      {metrics && (
        <p>CPU: <strong>{metrics.cpuPercent ?? "—"}%</strong> | RAM: <strong>{metrics.memoryMb ?? "—"} MB</strong></p>
      )}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <pre style={{ background: "#111", color: "#eee", padding: 16, height: "60vh", overflowY: "auto", fontSize: 12 }}>
        {lines.map((l, i) => <div key={i}>{l}</div>)}
        <div ref={bottomRef} />
      </pre>
      <p><a href="/">← Dashboard</a></p>
    </main>
  );
}
