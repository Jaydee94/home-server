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
interface TarEntry { name: string; size: number; }

export default function BackupsPage() {
  const [backups, setBackups] = useState<BackupMeta[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [entries, setEntries] = useState<TarEntry[] | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  async function showContents(filename: string) {
    if (openFile === filename) { setOpenFile(null); setEntries(null); return; }
    setOpenFile(filename); setEntries(null);
    const r = await fetch(`/api/backups/${encodeURIComponent(filename)}/contents`);
    if (r.ok) setEntries((await r.json()).entries);
    else { toast("error", "Inhalt nicht lesbar"); setOpenFile(null); }
  }

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
  async function del(filename: string) {
    if (!(await confirm({ title: "Backup löschen?", body: `"${filename}" wird dauerhaft entfernt.`, danger: true }))) return;
    setBusy(true);
    const r = await fetch(`/api/backups/${encodeURIComponent(filename)}`, { method: "DELETE" });
    setBusy(false); toast(r.ok ? "ok" : "error", r.ok ? "Backup gelöscht" : "Löschen fehlgeschlagen"); if (r.ok) load();
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
                <td style={{ textAlign: "right", display: "flex", gap: "var(--sp-2)", justifyContent: "flex-end" }}>
                  <Button variant="secondary" onClick={() => showContents(b.filename)}>{openFile === b.filename ? "🔍 Schließen" : "🔍 Inhalt"}</Button>
                  <a href={`/api/backups/${encodeURIComponent(b.filename)}`}><Button variant="secondary">⬇</Button></a>
                  <Button variant="secondary" disabled={busy} onClick={() => restore(b.filename)}>Restore</Button>
                  <Button variant="danger" disabled={busy} onClick={() => del(b.filename)}>Löschen</Button>
                </td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
      {openFile && (
        <Card>
          <div style={{ fontSize: 13, marginBottom: "var(--sp-2)" }}>Inhalt: <code>{openFile}</code>{entries && ` — ${entries.length} Einträge`}</div>
          {!entries ? <Skeleton height={120} /> : (
            <div style={{ maxHeight: "50vh", overflowY: "auto", fontFamily: "monospace", fontSize: 12 }}>
              {entries.map((e) => (
                <div key={e.name} style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-3)", padding: "1px 0", color: e.name.endsWith("/") ? "var(--fg-muted)" : "var(--fg)" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                  <span style={{ flexShrink: 0, color: "var(--fg-muted)" }}>{e.name.endsWith("/") ? "" : `${(e.size / 1024).toFixed(1)} KB`}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </main>
  );
}
