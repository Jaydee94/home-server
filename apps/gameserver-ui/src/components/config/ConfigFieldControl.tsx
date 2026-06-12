"use client";
import type { ConfigField } from "@/lib/configModel";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "var(--sp-2) var(--sp-3)",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--fg)",
};

export function ConfigFieldControl({
  field,
  value,
  changed,
  worlds,
  onChange,
}: {
  field: ConfigField;
  value: string;
  changed: boolean;
  worlds: string[] | null;
  onChange: (v: string) => void;
}) {
  let control: React.ReactNode;

  if (field.type === "bool") {
    const on = value === "true";
    control = (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(on ? "false" : "true")}
        style={{
          width: 52, height: 28, borderRadius: 999, border: "1px solid var(--border)",
          background: on ? "var(--accent, #c97b4a)" : "var(--bg)", position: "relative", cursor: "pointer",
        }}
      >
        <span style={{
          position: "absolute", top: 2, left: on ? 26 : 2, width: 22, height: 22, borderRadius: "50%",
          background: "#fff", transition: "left .15s",
        }} />
      </button>
    );
  } else if (field.type === "enum" || field.type === "world") {
    const opts =
      field.type === "world"
        ? (worlds ?? [value]).concat(worlds && !worlds.includes(value) && value ? [value] : []).map((w) => ({ value: w, label: w }))
        : field.options ?? [];
    control = (
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        {field.type === "world" && worlds === null ? <option value={value}>{value || "—"}</option> : null}
        {opts.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  } else if ((field.type === "int" || field.type === "float") && field.slider) {
    control = (
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
        <input type="range" min={field.min} max={field.max} step={field.step ?? 1} value={value}
          onChange={(e) => onChange(e.target.value)} style={{ flex: 1 }} />
        <input type="number" min={field.min} max={field.max} step={field.step ?? 1} value={value}
          onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, width: 90 }} />
        {field.unit ? <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>{field.unit}</span> : null}
      </div>
    );
  } else if (field.type === "int" || field.type === "float") {
    control = (
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
        <input type="number" min={field.min} max={field.max} step={field.step ?? 1} value={value}
          onChange={(e) => onChange(e.target.value)} style={inputStyle} />
        {field.unit ? <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>{field.unit}</span> : null}
      </div>
    );
  } else {
    control = (
      <input type={field.type === "password" ? "password" : "text"} value={value}
        onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    );
  }

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "260px 1fr", gap: "var(--sp-3)", alignItems: "start",
      padding: "var(--sp-2)", borderRadius: 6,
      borderLeft: changed ? "3px solid var(--accent, #c97b4a)" : "3px solid transparent",
      background: changed ? "var(--surface-2, rgba(201,123,74,0.06))" : "transparent",
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          {field.label}
          {changed ? <span title="Geändert" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent, #c97b4a)" }} /> : null}
        </div>
        <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 2 }}>{field.description}</div>
        <div style={{ fontSize: 11, color: "var(--fg-dim, #888)", marginTop: 2 }}>
          Standard: {field.default === "" ? "—" : field.default}{field.unit ? ` ${field.unit}` : ""}
        </div>
      </div>
      <div>{control}</div>
    </div>
  );
}
