"use client";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Table } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/feedback/ToastProvider";
import { useConfirm } from "@/components/feedback/ConfirmProvider";

interface ModInfo { name: string; sizeBytes: number; protected: boolean; }

export default function ModsPage() {
  const [mods, setMods] = useState<ModInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const confirm = useConfirm();

  async function load() { const r = await fetch("/api/mods"); setMods(r.ok ? (await r.json()).mods : []); }
  useEffect(() => { load(); }, []);

  async function upload(file: File) {
    if (!file.name.endsWith(".zip")) { toast("error", "Nur .zip-Dateien"); return; }
    setBusy(true);
    const form = new FormData(); form.append("file", file);
    const r = await fetch("/api/mods", { method: "POST", body: form });
    setBusy(false); toast(r.ok ? "ok" : "error", r.ok ? `${file.name} installiert` : "Upload fehlgeschlagen"); if (r.ok) load();
  }
  async function del(name: string) {
    if (!(await confirm({ title: "Mod löschen?", body: `Mod "${name}" wird entfernt.`, danger: true }))) return;
    setBusy(true);
    const r = await fetch(`/api/mods/${encodeURIComponent(name)}`, { method: "DELETE" });
    setBusy(false); toast(r.ok ? "ok" : "error", r.ok ? `${name} gelöscht` : "Löschen fehlgeschlagen"); if (r.ok) load();
  }
  async function applyRestart() {
    if (!(await confirm({ title: "Mods anwenden (Neustart)?", body: "Der 7DTD-Container wird neu gestartet, um die Mods zu laden (Welt wird vorher gespeichert). Online-Spieler werden 30 s vorgewarnt.", danger: true }))) return;
    setBusy(true);
    toast("ok", "Server wird neugestartet (~1 Min)…");
    const r = await fetch("/api/restart", { method: "POST" });
    setBusy(false);
    if (!r.ok) toast("error", "Neustart fehlgeschlagen");
  }

  return (
    <main style={{ display: "grid", gap: "var(--sp-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--sp-2)" }}>
        <h1 style={{ fontSize: 20 }}>Mods</h1>
        <Button variant="secondary" disabled={busy} onClick={applyRestart}>↻ Mods anwenden (Neustart)</Button>
      </div>
      <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>Hochgeladene Mods werden erst nach einem Server-Neustart geladen.</div>
      <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
        onClick={() => inputRef.current?.click()}
        style={{ border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`, borderRadius: "var(--radius)", padding: "var(--sp-6)",
          textAlign: "center", cursor: busy ? "wait" : "pointer", background: dragOver ? "var(--surface-2)" : "transparent", color: "var(--fg-muted)" }}>
        {busy ? "Wird hochgeladen…" : "Mod-Zip hier ablegen oder klicken"}
        <input ref={inputRef} type="file" accept=".zip" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      </div>
      <Card>
        {!mods ? null : mods.length === 0 ? <EmptyState>Keine Mods installiert</EmptyState> : (
          <Table>
            <thead><tr><th>Mod-Name</th><th></th></tr></thead>
            <tbody>{mods.map((m) => (
              <tr key={m.name}><td>{m.name}</td><td style={{ textAlign: "right" }}>{m.protected
                ? <span style={{ fontSize: 12, color: "var(--fg-muted)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "2px 8px" }}>System</span>
                : <Button variant="danger" disabled={busy} onClick={() => del(m.name)}>Löschen</Button>}</td></tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
    </main>
  );
}
