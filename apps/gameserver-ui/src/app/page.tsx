"use client";
import { useCallback, useEffect, useState } from "react";
import { useVmStatus } from "@/lib/useVmStatus";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { StatusDot, type DotKind } from "@/components/ui/StatusDot";
import { CopyButton } from "@/components/ui/CopyButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/feedback/ToastProvider";
import { useConfirm } from "@/components/feedback/ConfirmProvider";

interface Metrics { cpuPercent: number | null; memoryMb: number | null; memoryTotalMb: number | null; }

function ramDisplay(mb: number | null, totalMb: number | null): { value: string; unit?: string } {
  if (mb === null) return { value: "—" };
  const usedGb = (mb / 1024).toFixed(1);
  if (totalMb === null) return { value: usedGb, unit: "GB" };
  return { value: `${usedGb} / ${(totalMb / 1024).toFixed(1)}`, unit: "GB" };
}

export default function Dashboard() {
  const { status, running } = useVmStatus();
  const [tailscaleIp, setTailscaleIp] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [horde, setHorde] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    fetch("/api/vm/tailscale").then((r) => (r.ok ? r.json() : null)).then((d) => setTailscaleIp(d?.tailscaleIp ?? null)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!running) return;
    (async () => {
      const [gtRes, cfgRes] = await Promise.all([fetch("/api/gametime"), fetch("/api/config")]);
      if (!gtRes.ok) return;
      const gt = await gtRes.json();
      let freq = 7;
      if (cfgRes.ok) {
        const d = await cfgRes.json();
        const { extractConfigValue } = await import("@/lib/config");
        freq = Number(extractConfigValue(d.xml ?? "", "BloodMoonFrequency") ?? "7") || 7;
      }
      const { nextBloodMoon } = await import("@/lib/gametime");
      const next = nextBloodMoon(gt.day, freq);
      setHorde(next === gt.day ? "Heute Nacht!" : `Tag ${next} (in ${next - gt.day})`);
    })().catch(() => {});
  }, [running]);
  const loadMetrics = useCallback(async () => {
    const r = await fetch("/api/metrics"); if (r.ok) setMetrics(await r.json());
  }, []);
  useEffect(() => { loadMetrics(); const t = setInterval(loadMetrics, 15000); return () => clearInterval(t); }, [loadMetrics]);

  async function act(action: "start" | "stop") {
    if (action === "stop" && !(await confirm({ title: "Server stoppen?", body: "Der 7DTD-Server wird heruntergefahren.", danger: true }))) return;
    setBusy(true);
    const r = await fetch("/api/vm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    setBusy(false);
    toast(r.ok ? "ok" : "error", r.ok ? (action === "start" ? "Server startet…" : "Server wird gestoppt") : "Aktion fehlgeschlagen");
  }

  const dot: DotKind = !status ? "idle" : running ? "ok" : status.printableStatus === "Starting" ? "warn" : "danger";
  const stateText = !status ? "Lade…" : running ? "Server läuft" : status.printableStatus === "Starting" ? "Server startet" : "Server gestoppt";
  const connect = tailscaleIp ? `${tailscaleIp}:26900` : null;

  return (
    <main style={{ display: "grid", gap: "var(--sp-4)" }}>
      <h1 style={{ fontSize: 20 }}>Dashboard</h1>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--sp-3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
            <StatusDot kind={dot} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{stateText}</div>
              <div style={{ fontSize: 11, color: "var(--fg-dim)" }}>
                {status?.runningSince ? `seit ${new Date(status.runningSince).toLocaleString("de-DE")}` : "—"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "var(--sp-2)" }}>
            <Button variant="primary" disabled={busy || running} onClick={() => act("start")}>▶ Starten</Button>
            <Button variant="danger" disabled={busy || !running} onClick={() => act("stop")}>■ Stoppen</Button>
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "var(--sp-3)" }}>
        <StatTile label="CPU" value={metrics?.cpuPercent ?? "—"} unit={metrics?.cpuPercent != null ? "%" : undefined} />
        <StatTile label="RAM" {...ramDisplay(metrics?.memoryMb ?? null, metrics?.memoryTotalMb ?? null)} />
        <StatTile label="Status" value={running ? "Online" : "Offline"} />
        <StatTile label="Blutmond" value={horde ?? "—"} />
      </div>

      <Card title="Verbinden (Tailscale)">
        {connect ? (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            <code style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", color: "#7dd3fc" }}>{connect}</code>
            <CopyButton text={connect} />
          </div>
        ) : <Skeleton height={32} />}
      </Card>

      <Card title="Technische Details">
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--sp-2) var(--sp-4)", fontSize: 13 }}>
          <span style={{ color: "var(--fg-dim)" }}>runStrategy</span><span>{status?.runStrategy ?? "—"}</span>
          <span style={{ color: "var(--fg-dim)" }}>printableStatus</span><span>{status?.printableStatus ?? "—"}</span>
          <span style={{ color: "var(--fg-dim)" }}>VMI-Phase</span><span>{status?.vmiPhase ?? "—"}</span>
          <span style={{ color: "var(--fg-dim)" }}>IP</span><span>{status?.ipAddress ?? "—"}</span>
        </div>
      </Card>
    </main>
  );
}
