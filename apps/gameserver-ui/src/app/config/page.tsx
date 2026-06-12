"use client";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/feedback/ToastProvider";
import { useConfirm } from "@/components/feedback/ConfirmProvider";
import { serializeProperties } from "@/lib/serverconfig";
import { buildConfigModel } from "@/lib/configModel";
import { ConfigFieldControl } from "@/components/config/ConfigFieldControl";

export default function ConfigPage() {
  const [xml, setXml] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [worlds, setWorlds] = useState<string[] | null>(null);
  const [tab, setTab] = useState("Formular");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((d) => { if (d.xml) setXml(d.xml); }).finally(() => setLoading(false));
    fetch("/api/worlds").then((r) => (r.ok ? r.json() : null)).then((d) => setWorlds(d?.worlds ?? null)).catch(() => {});
  }, []);

  const groups = useMemo(() => buildConfigModel(xml), [xml]);
  const q = query.trim().toLowerCase();
  const matches = (f: { name: string; label: string; description: string }) =>
    !q || f.name.toLowerCase().includes(q) || f.label.toLowerCase().includes(q) || f.description.toLowerCase().includes(q);

  const changedCount = useMemo(() => {
    const byName = new Map(groups.flatMap((g) => g.fields).map((f) => [f.name, f.current]));
    return Object.entries(edits).filter(([n, v]) => v !== (byName.get(n) ?? "")).length;
  }, [edits, groups]);

  async function save() {
    if (changedCount === 0) { toast("error", "Keine Änderungen"); return; }
    if (!(await confirm({ title: "Ausrollen + Neustart?", body: `${changedCount} Änderung(en) werden in die serverconfig.xml geschrieben und der 7DTD-Server neu gestartet.`, danger: true }))) return;
    setSaving(true);
    const merged = serializeProperties(xml, edits);
    const res = await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ xml: merged }) });
    setSaving(false);
    if (res.ok) { toast("ok", "Ausgerollt — Server neu gestartet"); setXml(merged); setEdits({}); }
    else toast("error", "Speichern fehlgeschlagen");
  }

  return (
    <main style={{ display: "grid", gap: "var(--sp-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--sp-2)" }}>
        <h1 style={{ fontSize: 20 }}>Config</h1>
        <Button variant="danger" disabled={saving || !xml || changedCount === 0} onClick={save}>
          {saving ? "Wird ausgerollt…" : `▶ Ausrollen + Neustart${changedCount ? ` (${changedCount})` : ""}`}
        </Button>
      </div>
      <Tabs tabs={["Formular", "Experten (XML)"]} active={tab} onChange={setTab} />

      {loading ? <Skeleton height={240} /> : tab === "Formular" ? (
        <>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔎 Einstellung suchen…"
            style={{ padding: "var(--sp-2) var(--sp-3)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--fg)" }} />
          {groups.map((g) => {
            const visible = g.fields.filter(matches);
            if (visible.length === 0) return null;
            const isOpen = open[g.category] ?? (q.length > 0);
            return (
              <Card key={g.category}>
                <button type="button" onClick={() => setOpen((s) => ({ ...s, [g.category]: !isOpen }))}
                  style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", color: "var(--fg)", cursor: "pointer", fontSize: 15, fontWeight: 700, padding: 0 }}>
                  <span>{isOpen ? "▼" : "▶"} {g.category}</span>
                  <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{visible.length}</span>
                </button>
                {isOpen ? (
                  <div style={{ display: "grid", gap: "var(--sp-2)", marginTop: "var(--sp-3)" }}>
                    {visible.map((f) => {
                      const value = edits[f.name] ?? f.current;
                      return (
                        <ConfigFieldControl key={f.name} field={f} value={value} worlds={worlds}
                          changed={f.name in edits && edits[f.name] !== f.current}
                          onChange={(v) => setEdits((s) => ({ ...s, [f.name]: v }))} />
                      );
                    })}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </>
      ) : (
        <Card>
          <textarea value={xml} onChange={(e) => { setXml(e.target.value); setEdits({}); }}
            style={{ width: "100%", height: "60vh", fontFamily: "var(--font-geist-mono)", fontSize: 12, background: "var(--bg)", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: 6, padding: "var(--sp-3)" }} />
        </Card>
      )}
    </main>
  );
}
