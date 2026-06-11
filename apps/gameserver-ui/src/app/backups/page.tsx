"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Table } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/feedback/ToastProvider";
import { useConfirm } from "@/components/feedback/ConfirmProvider";

interface BackupMeta { filename: string; timestamp: string; sizeBytes: number; }

export default function BackupsPage() {
  const [backups, setBackups] = useState<BackupMeta[] | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  async function load() { const r = await fetch("/api/backups"); setBackups(r.ok ? (await r.json()).backups : []); }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!(await confirm({ title: "Backup erstellen?", body: "Die Welt wird gespeichert und archiviert. Das kann einige Minuten dauern." }))) return;
    setBusy(true);
    const r = await fetch("/api/backups", { method: "POST" });
    setBusy(false); toast(r.ok ? "ok" : "error", r.ok ? "Backup erstellt" : "Backup fehlgeschlagen"); if (r.ok) load();
  }
  async function saveWorld() {
    setBusy(true);
    const r = await fetch("/api/players", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "saveworld" }) });
    setBusy(false); toast(r.ok ? "ok" : "error", r.ok ? "Welt gespeichert" : "Speichern fehlgeschlagen");
  }
  async function restore(filename: string) {
    if (!(await confirm({ title: "Welt wiederherstellen?", body: `Der Server wird gestoppt und durch "${filename}" ersetzt. Das kann nicht rückgängig gemacht werden.`, danger: true }))) return;
    setBusy(true);
    const r = await fetch(`/api/backups/${encodeURIComponent(filename)}/restore`, { method: "POST" });
    setBusy(false); toast(r.ok ? "ok" : "error", r.ok ? "Wiederhergestellt" : "Restore fehlgeschlagen");
  }

  return (
    <main style={{ display: "grid", gap: "var(--sp-4)" }}>
      <h1 style={{ fontSize: 20 }}>Backups</h1>
      <div style={{ display: "flex", gap: "var(--sp-2)" }}>
        <Button variant="primary" disabled={busy} onClick={create}>＋ Backup erstellen</Button>
        <Button variant="secondary" disabled={busy} onClick={saveWorld}>💾 Welt speichern</Button>
      </div>
      <Card>
        {!backups ? <Skeleton height={80} /> : backups.length === 0 ? <EmptyState>Keine Backups vorhanden</EmptyState> : (
          <Table>
            <thead><tr><th>Zeitpunkt</th><th>Größe</th><th></th></tr></thead>
            <tbody>{backups.map((b) => (
              <tr key={b.filename}>
                <td>{new Date(b.timestamp).toLocaleString("de-DE")}</td>
                <td>{(b.sizeBytes / 1024 / 1024).toFixed(1)} MB</td>
                <td style={{ textAlign: "right" }}><Button variant="secondary" disabled={busy} onClick={() => restore(b.filename)}>Restore</Button></td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
    </main>
  );
}
