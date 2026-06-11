"use client";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/feedback/ToastProvider";
import { useConfirm } from "@/components/feedback/ConfirmProvider";
import { parseProperties, serializeProperties } from "@/lib/serverconfig";

export default function ConfigPage() {
  const [xml, setXml] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [tab, setTab] = useState("Formular");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((d) => { if (d.xml) setXml(d.xml); }).finally(() => setLoading(false));
  }, []);

  const props = useMemo(() => parseProperties(xml), [xml]);

  async function save() {
    if (!(await confirm({ title: "Ausrollen + Neustart?", body: "serverconfig.xml wird geschrieben und der 7DTD-Server neu gestartet.", danger: true }))) return;
    setSaving(true);
    const merged = serializeProperties(xml, edits);
    const res = await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ xml: merged }) });
    setSaving(false);
    if (res.ok) { toast("ok", "Ausgerollt — Server neu gestartet"); setXml(merged); setEdits({}); }
    else toast("error", "Speichern fehlgeschlagen");
  }

  return (
    <main style={{ display: "grid", gap: "var(--sp-4)" }}>
      <h1 style={{ fontSize: 20 }}>Config</h1>
      <Tabs tabs={["Formular", "Experten (XML)"]} active={tab} onChange={setTab} />
      <Card>
        {loading ? <Skeleton height={200} /> : tab === "Formular" ? (
          <div style={{ display: "grid", gap: "var(--sp-3)" }}>
            {props.map((p) => {
              const isPw = /password/i.test(p.name);
              const val = edits[p.name] ?? p.value;
              return (
                <label key={p.name} style={{ display: "grid", gridTemplateColumns: "240px 1fr", alignItems: "center", gap: "var(--sp-3)", fontSize: 13 }}>
                  <span style={{ color: "var(--fg-muted)" }}>{p.name}</span>
                  <input type={isPw ? "password" : "text"} value={val}
                    onChange={(e) => setEdits((s) => ({ ...s, [p.name]: e.target.value }))}
                    style={{ padding: "var(--sp-2) var(--sp-3)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--fg)" }} />
                </label>
              );
            })}
          </div>
        ) : (
          <textarea value={xml} onChange={(e) => { setXml(e.target.value); setEdits({}); }}
            style={{ width: "100%", height: "60vh", fontFamily: "var(--font-geist-mono)", fontSize: 12, background: "var(--bg)", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: 6, padding: "var(--sp-3)" }} />
        )}
      </Card>
      <div><Button variant="danger" disabled={saving || !xml} onClick={save}>{saving ? "Wird ausgerollt…" : "▶ Ausrollen + Neustart"}</Button></div>
    </main>
  );
}
