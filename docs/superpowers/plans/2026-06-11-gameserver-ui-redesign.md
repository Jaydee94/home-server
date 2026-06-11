# Gameserver-UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the functional-but-raw 7DTD Gameserver-UI into a dark, cohesive Clean-Admin dashboard with a small CSS-Module design system, a collapsible sidebar shell, unified modals/toasts, and a set of new features (config form, console, log tools, backups+, horde countdown).

**Architecture:** Next.js 16 App Router (React 19). No CSS framework — introduce a token stylesheet (`globals.css` CSS variables) plus **CSS Modules** per component (CLAUDE.md forbids CSS-in-JS without explicit need). All pages move from per-page inline styles to shared primitives wrapped by an `AppShell` (sidebar + content). Server logic stays in `src/lib/*` (pure, unit-tested with Vitest) behind thin route handlers in `src/app/api/*`. Polling stays as-is.

**Tech Stack:** Next.js 16.2.9, React 19, TypeScript 6, Vitest 4, `@kubernetes/client-node`, `ssh2`, `iron-session`. Geist font (already loaded in `layout.tsx`).

**Spec:** `docs/superpowers/specs/2026-06-11-gameserver-ui-redesign-design.md`

---

## Conventions for every task

- Work happens in `apps/gameserver-ui/`. All commands below assume that as CWD: `cd apps/gameserver-ui` first.
- Run a single test file: `npx vitest run src/lib/<x>.test.ts`. Run all: `npm test`.
- Lint: `npm run lint`. Build (type-check): `npm run build`.
- Commit after each task with the shown message; end every commit body with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- UI styling tasks have no unit test; they are verified by `npm run build` (type-check) + `npm run lint` + a Playwright screenshot over the ingress route `http://gameserver.homeserver/<path>`.

---

## File Structure

**New (design system + shell):**
- `src/app/globals.css` — rewrite: design tokens (CSS vars) + base dark theme.
- `src/components/ui/Button.tsx` + `.module.css` — variants primary/secondary/danger/ghost.
- `src/components/ui/Card.tsx` + `.module.css` — surface container.
- `src/components/ui/StatTile.tsx` + `.module.css` — label + big value tile.
- `src/components/ui/StatusDot.tsx` + `.module.css` — colored status indicator.
- `src/components/ui/Skeleton.tsx` + `.module.css` — loading placeholder.
- `src/components/ui/EmptyState.tsx` + `.module.css` — empty list message.
- `src/components/ui/CopyButton.tsx` — copy-to-clipboard button (uses Button).
- `src/components/ui/Table.tsx` + `.module.css` — styled table wrapper.
- `src/components/ui/Tabs.tsx` + `.module.css` — simple tab switcher (config expert tab).
- `src/components/feedback/ToastProvider.tsx` + `.module.css` — context + `useToast()`.
- `src/components/feedback/ConfirmProvider.tsx` + `.module.css` — context + `useConfirm()` (click-confirm modal).
- `src/components/shell/AppShell.tsx` + `.module.css` — sidebar + content frame.
- `src/components/shell/Sidebar.tsx` + `.module.css` — nav, collapse, status pill, logout.
- `src/components/shell/nav.ts` — nav item list (single source of truth).
- `src/lib/useVmStatus.ts` — shared polling hook for VM status.

**New (Phase 2 logic):**
- `src/lib/serverconfig.ts` + `__tests__/serverconfig.test.ts` — parse/serialize ALL `serverconfig.xml` properties.
- `src/lib/retention.ts` + `__tests__/retention.test.ts` — pick backups to delete.
- `src/lib/gametime.ts` + `__tests__/gametime.test.ts` — parse `gettime`, compute next blood moon.
- `src/lib/playersession.ts` + `__tests__/playersession.test.ts` — best-effort online-session tracking.
- `src/app/api/console/route.ts` + `__tests__/console.test.ts` — free-text telnet command.
- `src/app/api/backups/[name]/route.ts` — DELETE + GET(download) for one backup.
- `src/app/api/gametime/route.ts` — current day/time for horde countdown.
- `src/app/console/page.tsx` — console UI.

**Modified:**
- `src/app/layout.tsx` — wrap children in providers + AppShell; keep Geist.
- `src/app/page.tsx`, `players/page.tsx`, `logs/page.tsx`, `config/page.tsx`, `backups/page.tsx`, `mods/page.tsx`, `login/page.tsx` — restyle to primitives.
- `src/lib/telnet.ts` — extend `parseLp` (deaths) + add `runCommand` passthrough is already `telnetCommand`.
- `src/app/api/players/route.ts` — drop `saveworld` is kept (used by backups); add session enrichment.
- `src/app/api/backups/route.ts` — call retention prune after successful create.

**Removed:**
- `src/app/schedule/page.tsx` — Zeitplan page (managed via Kubernetes).
- `src/app/api/schedule/route.ts` + `src/lib/schedule.ts` + their tests — only if nothing else imports them (verify in Task A13).

---

# MILESTONE A — Phase 1: Foundation + Restyle

## Task A1: Design tokens & global theme

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Rewrite `globals.css` with tokens + dark base**

```css
:root {
  /* surfaces */
  --bg: #0b0d12;
  --surface: #11141b;
  --surface-2: #161a23;
  --border: #1e2330;
  /* text */
  --fg: #e6e8ee;
  --fg-muted: #9aa4b2;
  --fg-dim: #7b8494;
  /* accent: amber/rust (7DTD) */
  --accent: #e0822f;
  --accent-hover: #f0934a;
  --accent-contrast: #1a1208;
  /* semantic status */
  --ok: #22c55e;
  --warn: #eab308;
  --danger: #ef4444;
  --danger-surface: #7f1d1d;
  --danger-contrast: #fecaca;
  /* spacing scale (comfortable) */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
  --sp-5: 24px; --sp-6: 32px; --sp-7: 48px;
  --radius: 10px;
  --radius-sm: 6px;
}

* { box-sizing: border-box; padding: 0; margin: 0; }

html, body { max-width: 100vw; }

body {
  min-height: 100vh;
  color: var(--fg);
  background: var(--bg);
  font-family: var(--font-geist-sans), system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}

a { color: inherit; text-decoration: none; }
code, pre { font-family: var(--font-geist-mono), ui-monospace, monospace; }
```

- [ ] **Step 2: Verify build & lint**

Run: `cd apps/gameserver-ui && npm run build && npm run lint`
Expected: build succeeds, no lint errors. (Existing pages still render via inline styles; they get replaced in later tasks.)

- [ ] **Step 3: Commit**

```bash
git add apps/gameserver-ui/src/app/globals.css
git commit -m "feat(gameserver-ui): design tokens + dark base theme"
```

---

## Task A2: Button primitive

**Files:**
- Create: `src/components/ui/Button.tsx`, `src/components/ui/Button.module.css`

- [ ] **Step 1: Create `Button.module.css`**

```css
.btn {
  display: inline-flex; align-items: center; gap: var(--sp-2);
  font: inherit; font-weight: 600; font-size: 13px;
  padding: var(--sp-2) var(--sp-4);
  border-radius: var(--radius-sm); border: 1px solid transparent;
  cursor: pointer; transition: background .12s, opacity .12s;
}
.btn:disabled { opacity: .45; cursor: not-allowed; }
.primary { background: var(--accent); color: var(--accent-contrast); }
.primary:not(:disabled):hover { background: var(--accent-hover); }
.secondary { background: var(--surface-2); color: var(--fg); border-color: var(--border); }
.secondary:not(:disabled):hover { background: var(--border); }
.danger { background: var(--danger-surface); color: var(--danger-contrast); }
.danger:not(:disabled):hover { background: #991b1b; }
.ghost { background: transparent; color: var(--fg-muted); }
.ghost:not(:disabled):hover { color: var(--fg); background: var(--surface-2); }
```

- [ ] **Step 2: Create `Button.tsx`**

```tsx
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${styles.btn} ${styles[variant]} ${className}`} {...props} />;
}
```

- [ ] **Step 3: Verify & commit**

Run: `cd apps/gameserver-ui && npm run build`
Expected: PASS.

```bash
git add apps/gameserver-ui/src/components/ui/Button.tsx apps/gameserver-ui/src/components/ui/Button.module.css
git commit -m "feat(gameserver-ui): Button primitive"
```

---

## Task A3: Card, StatTile, StatusDot, Skeleton, EmptyState, Table

**Files:**
- Create: the six `*.tsx` + matching `*.module.css` under `src/components/ui/`.

- [ ] **Step 1: `Card.tsx` + `Card.module.css`**

```css
/* Card.module.css */
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--sp-4); }
.title { font-size: 10px; letter-spacing: .5px; color: var(--fg-dim); text-transform: uppercase; margin-bottom: var(--sp-3); }
```
```tsx
// Card.tsx
import styles from "./Card.module.css";
export function Card({ title, className = "", children }: { title?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`${styles.card} ${className}`}>
      {title && <div className={styles.title}>{title}</div>}
      {children}
    </section>
  );
}
```

- [ ] **Step 2: `StatTile.tsx` + `StatTile.module.css`**

```css
.tile { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--sp-3) var(--sp-4); }
.label { font-size: 10px; letter-spacing: .5px; color: var(--fg-dim); text-transform: uppercase; }
.value { font-size: 22px; font-weight: 700; margin-top: var(--sp-1); }
.unit { font-size: 13px; color: var(--fg-dim); font-weight: 400; }
```
```tsx
import styles from "./StatTile.module.css";
export function StatTile({ label, value, unit }: { label: string; value: React.ReactNode; unit?: string }) {
  return (
    <div className={styles.tile}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}{unit && <span className={styles.unit}> {unit}</span>}</div>
    </div>
  );
}
```

- [ ] **Step 3: `StatusDot.tsx` + `StatusDot.module.css`**

```css
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; }
.ok { background: var(--ok); box-shadow: 0 0 8px var(--ok); }
.warn { background: var(--warn); box-shadow: 0 0 8px var(--warn); }
.danger { background: var(--danger); box-shadow: 0 0 8px var(--danger); }
.idle { background: var(--fg-dim); }
```
```tsx
import styles from "./StatusDot.module.css";
export type DotKind = "ok" | "warn" | "danger" | "idle";
export function StatusDot({ kind }: { kind: DotKind }) {
  return <span className={`${styles.dot} ${styles[kind]}`} />;
}
```

- [ ] **Step 4: `Skeleton.tsx` + `Skeleton.module.css`**

```css
.sk { background: linear-gradient(90deg, var(--surface) 25%, var(--surface-2) 37%, var(--surface) 63%);
  background-size: 400% 100%; animation: shimmer 1.4s ease infinite; border-radius: var(--radius-sm); }
@keyframes shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
```
```tsx
import styles from "./Skeleton.module.css";
export function Skeleton({ width = "100%", height = 16 }: { width?: number | string; height?: number | string }) {
  return <div className={styles.sk} style={{ width, height }} />;
}
```

- [ ] **Step 5: `EmptyState.tsx` + `EmptyState.module.css`**

```css
.empty { color: var(--fg-dim); text-align: center; padding: var(--sp-6); font-size: 14px; }
```
```tsx
import styles from "./EmptyState.module.css";
export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className={styles.empty}>{children}</div>;
}
```

- [ ] **Step 6: `Table.tsx` + `Table.module.css`**

```css
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table th { text-align: left; color: var(--fg-dim); font-weight: 600; font-size: 11px;
  text-transform: uppercase; letter-spacing: .4px; padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); }
.table td { padding: var(--sp-3); border-bottom: 1px solid var(--border); }
.table tr:last-child td { border-bottom: none; }
```
```tsx
import styles from "./Table.module.css";
export function Table({ children }: { children: React.ReactNode }) {
  return <table className={styles.table}>{children}</table>;
}
```

- [ ] **Step 7: Verify & commit**

Run: `cd apps/gameserver-ui && npm run build`
Expected: PASS.

```bash
git add apps/gameserver-ui/src/components/ui
git commit -m "feat(gameserver-ui): core UI primitives (Card, StatTile, StatusDot, Skeleton, EmptyState, Table)"
```

---

## Task A4: Toast system

**Files:**
- Create: `src/components/feedback/ToastProvider.tsx`, `.module.css`

- [ ] **Step 1: `ToastProvider.module.css`**

```css
.stack { position: fixed; top: var(--sp-4); right: var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-2); z-index: 100; }
.toast { min-width: 240px; max-width: 360px; padding: var(--sp-3) var(--sp-4); border-radius: var(--radius-sm);
  font-size: 13px; box-shadow: 0 6px 20px #0008; border: 1px solid var(--border); background: var(--surface-2); color: var(--fg); }
.ok { border-color: #16431f; background: #0c2a16; color: #bbf7d0; }
.error { border-color: #5a1a1a; background: #2a0e0e; color: var(--danger-contrast); }
```

- [ ] **Step 2: `ToastProvider.tsx`**

```tsx
"use client";
import { createContext, useCallback, useContext, useState } from "react";
import styles from "./ToastProvider.module.css";

type Toast = { id: number; kind: "ok" | "error"; text: string };
const ToastCtx = createContext<(kind: "ok" | "error", text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

let counter = 0;
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: "ok" | "error", text: string) => {
    const id = ++counter;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className={styles.stack}>
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.toast} ${styles[t.kind]}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
```

> Note: `useCallback` import is `useCallback` (React). Verify the import line reads `import { createContext, useCallback, useContext, useState } from "react";`.

- [ ] **Step 3: Verify & commit**

Run: `cd apps/gameserver-ui && npm run build`
Expected: PASS.

```bash
git add apps/gameserver-ui/src/components/feedback/ToastProvider.tsx apps/gameserver-ui/src/components/feedback/ToastProvider.module.css
git commit -m "feat(gameserver-ui): toast notifications"
```

---

## Task A5: Confirm modal system

**Files:**
- Create: `src/components/feedback/ConfirmProvider.tsx`, `.module.css`

- [ ] **Step 1: `ConfirmProvider.module.css`**

```css
.overlay { position: fixed; inset: 0; background: #000a; display: flex; align-items: center; justify-content: center; z-index: 90; padding: var(--sp-4); }
.modal { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--sp-5); max-width: 420px; width: 100%; }
.title { font-size: 15px; font-weight: 700; margin-bottom: var(--sp-2); }
.body { font-size: 13px; color: var(--fg-muted); margin-bottom: var(--sp-4); }
.actions { display: flex; gap: var(--sp-2); justify-content: flex-end; }
```

- [ ] **Step 2: `ConfirmProvider.tsx`**

```tsx
"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Button } from "../ui/Button";
import styles from "./ConfirmProvider.module.css";

type Req = { title: string; body: string; danger?: boolean };
const ConfirmCtx = createContext<(r: Req) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [req, setReq] = useState<Req | null>(null);
  const resolver = useRef<(v: boolean) => void>(() => {});
  const ask = useCallback((r: Req) => new Promise<boolean>((resolve) => { resolver.current = resolve; setReq(r); }), []);
  const finish = (v: boolean) => { setReq(null); resolver.current(v); };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {req && (
        <div className={styles.overlay} onClick={() => finish(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.title}>{req.title}</div>
            <div className={styles.body}>{req.body}</div>
            <div className={styles.actions}>
              <Button variant="ghost" onClick={() => finish(false)}>Abbrechen</Button>
              <Button variant={req.danger ? "danger" : "primary"} onClick={() => finish(true)}>Bestätigen</Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
```

- [ ] **Step 3: Verify & commit**

Run: `cd apps/gameserver-ui && npm run build`
Expected: PASS.

```bash
git add apps/gameserver-ui/src/components/feedback/ConfirmProvider.tsx apps/gameserver-ui/src/components/feedback/ConfirmProvider.module.css
git commit -m "feat(gameserver-ui): click-confirm modal system"
```

---

## Task A6: Shared VM status hook + nav definition

**Files:**
- Create: `src/lib/useVmStatus.ts`, `src/components/shell/nav.ts`

- [ ] **Step 1: `nav.ts`**

```ts
export interface NavItem { href: string; label: string; icon: string; }
export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/players", label: "Spieler", icon: "👥" },
  { href: "/console", label: "Konsole", icon: "❯" },
  { href: "/logs", label: "Logs", icon: "▤" },
  { href: "/config", label: "Config", icon: "⚙" },
  { href: "/backups", label: "Backups", icon: "⛁" },
  { href: "/mods", label: "Mods", icon: "🧩" },
];
```

- [ ] **Step 2: `useVmStatus.ts`**

```ts
"use client";
import { useEffect, useState } from "react";

export interface VmStatus {
  runStrategy: string; printableStatus: string;
  vmiPhase: string | null; ipAddress: string | null; runningSince: string | null;
}

export function useVmStatus(intervalMs = 5000) {
  const [status, setStatus] = useState<VmStatus | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const res = await fetch("/api/vm");
      if (res.ok && alive) { setStatus(await res.json()); setUpdatedAt(Date.now()); }
    };
    tick();
    const t = setInterval(tick, intervalMs);
    return () => { alive = false; clearInterval(t); };
  }, [intervalMs]);
  const running = status?.vmiPhase === "Running";
  return { status, running, updatedAt };
}
```

- [ ] **Step 3: Verify & commit**

Run: `cd apps/gameserver-ui && npm run build`
Expected: PASS.

```bash
git add apps/gameserver-ui/src/lib/useVmStatus.ts apps/gameserver-ui/src/components/shell/nav.ts
git commit -m "feat(gameserver-ui): shared VM status hook + nav definition"
```

---

## Task A7: Sidebar + AppShell

**Files:**
- Create: `src/components/shell/Sidebar.tsx`, `.module.css`, `src/components/shell/AppShell.tsx`, `.module.css`

- [ ] **Step 1: `Sidebar.module.css`**

```css
.bar { width: 220px; flex-shrink: 0; background: var(--surface); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; padding: var(--sp-3); gap: var(--sp-1); transition: width .15s; }
.collapsed { width: 64px; }
.brand { display: flex; align-items: center; gap: var(--sp-2); font-weight: 700; padding: var(--sp-2); margin-bottom: var(--sp-2); white-space: nowrap; overflow: hidden; }
.link { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-sm); color: var(--fg-muted); white-space: nowrap; overflow: hidden; }
.link:hover { background: var(--surface-2); color: var(--fg); }
.active { background: var(--surface-2); color: var(--accent); }
.icon { width: 18px; text-align: center; flex-shrink: 0; }
.spacer { flex: 1; }
.status { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); font-size: 11px; color: var(--fg-muted); }
.foot { border-top: 1px solid var(--border); margin-top: var(--sp-2); padding-top: var(--sp-2); }
.toggle { background: none; border: none; color: var(--fg-dim); cursor: pointer; padding: var(--sp-2); align-self: flex-end; }
@media (max-width: 720px) {
  .bar { position: fixed; inset: 0 auto 0 0; z-index: 80; transform: translateX(-100%); }
  .open { transform: translateX(0); }
}
```

- [ ] **Step 2: `Sidebar.tsx`**

```tsx
"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NAV } from "./nav";
import { StatusDot, type DotKind } from "../ui/StatusDot";
import { useVmStatus } from "@/lib/useVmStatus";
import styles from "./Sidebar.module.css";

export function Sidebar({ collapsed, mobileOpen, onToggle, serverName }:
  { collapsed: boolean; mobileOpen: boolean; onToggle: () => void; serverName: string }) {
  const path = usePathname();
  const router = useRouter();
  const { status, running } = useVmStatus();

  const dot: DotKind = !status ? "idle" : running ? "ok" : status.printableStatus === "Starting" ? "warn" : "danger";
  const label = !status ? "…" : running ? "läuft" : status.printableStatus === "Starting" ? "startet" : "gestoppt";

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    router.push("/login");
  }

  return (
    <nav className={`${styles.bar} ${collapsed ? styles.collapsed : ""} ${mobileOpen ? styles.open : ""}`}>
      <button className={styles.toggle} onClick={onToggle} aria-label="Menü einklappen">≡</button>
      <div className={styles.brand}><span className={styles.icon}>🧟</span>{!collapsed && <span>{serverName}</span>}</div>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={`${styles.link} ${path === n.href ? styles.active : ""}`} title={n.label}>
          <span className={styles.icon}>{n.icon}</span>{!collapsed && <span>{n.label}</span>}
        </Link>
      ))}
      <div className={styles.spacer} />
      <div className={styles.status}><StatusDot kind={dot} />{!collapsed && <span>Server {label}</span>}</div>
      <div className={styles.foot}>
        <button className={styles.link} onClick={logout} style={{ width: "100%", background: "none", border: "none", cursor: "pointer" }}>
          <span className={styles.icon}>⏻</span>{!collapsed && <span>Logout</span>}
        </button>
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: `AppShell.module.css`**

```css
.shell { display: flex; min-height: 100vh; }
.content { flex: 1; min-width: 0; padding: var(--sp-5); max-width: 1100px; }
.mobilebar { display: none; }
@media (max-width: 720px) {
  .content { padding: var(--sp-4); }
  .mobilebar { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3); border-bottom: 1px solid var(--border); }
  .burger { background: none; border: none; color: var(--fg); font-size: 20px; cursor: pointer; }
}
```

- [ ] **Step 4: `AppShell.tsx`** (reads server name from `/api/config`, falls back to "7DTD Server")

```tsx
"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { extractConfigValue } from "@/lib/config";
import styles from "./AppShell.module.css";

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [serverName, setServerName] = useState("7DTD Server");

  useEffect(() => {
    fetch("/api/config").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.xml) setServerName(extractConfigValue(d.xml, "ServerName") ?? "7DTD Server");
    }).catch(() => {});
  }, []);
  useEffect(() => setMobileOpen(false), [path]);

  if (path === "/login") return <>{children}</>;

  return (
    <div className={styles.shell}>
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen}
        onToggle={() => setCollapsed((c) => !c)} serverName={serverName} />
      <div className={styles.content}>
        <div className={styles.mobilebar}>
          <button className={styles.burger} onClick={() => setMobileOpen(true)} aria-label="Menü öffnen">☰</button>
          <strong>{serverName}</strong>
        </div>
        {children}
      </div>
    </div>
  );
}
```

> `extractConfigValue` is imported from `@/lib/config` (already exists). It returns `null` when the server is stopped / config unavailable → fallback name is used.

- [ ] **Step 5: Verify & commit**

Run: `cd apps/gameserver-ui && npm run build`
Expected: PASS.

```bash
git add apps/gameserver-ui/src/components/shell
git commit -m "feat(gameserver-ui): collapsible sidebar + AppShell"
```

---

## Task A8: Wire providers + shell into root layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Replace the inline `<nav>` with providers + AppShell**

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/feedback/ToastProvider";
import { ConfirmProvider } from "@/components/feedback/ConfirmProvider";
import { AppShell } from "@/components/shell/AppShell";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "7DTD Gameserver-UI",
  description: "Verwaltung des 7 Days to Die Gameservers",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <ToastProvider>
          <ConfirmProvider>
            <AppShell>{children}</AppShell>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify build + lint + Playwright smoke**

Run: `cd apps/gameserver-ui && npm run build && npm run lint`
Expected: PASS.
Then (manual) open `http://gameserver.homeserver/` via Playwright → sidebar visible, dark theme, dashboard content still renders (old page styling until Task A9).

- [ ] **Step 3: Commit**

```bash
git add apps/gameserver-ui/src/app/layout.tsx
git commit -m "feat(gameserver-ui): mount sidebar shell + toast/confirm providers in layout"
```

---

## Task A9: Dashboard restyle

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Rewrite `page.tsx` using primitives + hero + tiles + technik card**

```tsx
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

interface Metrics { cpuPercent: number | null; memoryMb: number | null; }

export default function Dashboard() {
  const { status, running } = useVmStatus();
  const [tailscaleIp, setTailscaleIp] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    fetch("/api/vm/tailscale").then((r) => (r.ok ? r.json() : null)).then((d) => setTailscaleIp(d?.tailscaleIp ?? null)).catch(() => {});
  }, []);
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
        <StatTile label="RAM" value={metrics?.memoryMb ?? "—"} unit={metrics?.memoryMb != null ? "MB" : undefined} />
        <StatTile label="Status" value={running ? "Online" : "Offline"} />
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
```

- [ ] **Step 2: Create `CopyButton.tsx`** (dependency of Step 1)

```tsx
"use client";
import { useState } from "react";
import { Button } from "./Button";
export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button variant="secondary" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch {}
    }}>{done ? "✓ Kopiert" : "⧉ Kopieren"}</Button>
  );
}
```

- [ ] **Step 3: Verify build + lint + screenshot**

Run: `cd apps/gameserver-ui && npm run build && npm run lint`
Expected: PASS. Playwright screenshot of `/` → hero, tiles, connect card, technik card; stop button confirms via modal; toast shows on action.

- [ ] **Step 4: Commit**

```bash
git add apps/gameserver-ui/src/app/page.tsx apps/gameserver-ui/src/components/ui/CopyButton.tsx
git commit -m "feat(gameserver-ui): redesign dashboard (hero, tiles, connect, technik)"
```

---

## Task A10: Spieler restyle (drop HP/Ping, drop saveworld)

**Files:**
- Modify: `src/app/players/page.tsx`

> **Column decision (per spec open point):** "Letzter Login" and persistent playtime are NOT available from telnet. Phase-1 player table shows **Name · Level** only (real data). Online-session duration is added in Task B9. The broadcast box stays; "Welt speichern" moves to Backups (Task A12).

- [ ] **Step 1: Rewrite `players/page.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Table } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/feedback/ToastProvider";

interface Player { name: string; id: string; level: number; }

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function load() {
    const res = await fetch("/api/players");
    if (res.ok) setPlayers((await res.json()).players);
    else setPlayers([]);
  }
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

  async function broadcast() {
    if (!message.trim()) return;
    setBusy(true);
    const r = await fetch("/api/players", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "broadcast", message }) });
    setBusy(false); setMessage("");
    toast(r.ok ? "ok" : "error", r.ok ? "Nachricht gesendet" : "Senden fehlgeschlagen");
  }

  return (
    <main style={{ display: "grid", gap: "var(--sp-4)" }}>
      <h1 style={{ fontSize: 20 }}>Spieler {players ? `(${players.length})` : ""}</h1>
      <Card>
        {!players ? <Skeleton height={80} /> : players.length === 0 ? <EmptyState>Keine Spieler online</EmptyState> : (
          <Table>
            <thead><tr><th>Name</th><th>Level</th></tr></thead>
            <tbody>{players.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.level}</td></tr>)}</tbody>
          </Table>
        )}
      </Card>
      <Card title="Broadcast an alle Spieler">
        <div style={{ display: "flex", gap: "var(--sp-2)" }}>
          <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Nachricht…"
            style={{ flex: 1, padding: "var(--sp-2) var(--sp-3)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--fg)" }} />
          <Button variant="primary" disabled={busy || !message.trim()} onClick={broadcast}>📢 Senden</Button>
        </div>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Verify build/lint + screenshot, then commit**

Run: `cd apps/gameserver-ui && npm run build && npm run lint`

```bash
git add apps/gameserver-ui/src/app/players/page.tsx
git commit -m "feat(gameserver-ui): redesign players page (real columns, toast)"
```

---

## Task A11: Logs restyle (remove CPU/RAM line)

**Files:**
- Modify: `src/app/logs/page.tsx`

- [ ] **Step 1: Rewrite `logs/page.tsx`** (keep SSE; drop metrics; dark `pre` via token colors)

```tsx
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
```

- [ ] **Step 2: Verify build/lint + screenshot, then commit**

```bash
git add apps/gameserver-ui/src/app/logs/page.tsx
git commit -m "feat(gameserver-ui): redesign logs page, drop duplicate metrics"
```

---

## Task A12: Backups restyle (+ "Welt speichern")

**Files:**
- Modify: `src/app/backups/page.tsx`

- [ ] **Step 1: Add a relative-time helper inline and rewrite the page** (restore via confirm modal; create + saveworld buttons; delete/download come in Phase 2)

```tsx
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
```

- [ ] **Step 2: Verify build/lint + screenshot, then commit**

```bash
git add apps/gameserver-ui/src/app/backups/page.tsx
git commit -m "feat(gameserver-ui): redesign backups page + move 'Welt speichern' here"
```

---

## Task A13: Mods restyle + remove Zeitplan page

**Files:**
- Modify: `src/app/mods/page.tsx`
- Delete: `src/app/schedule/page.tsx`, `src/app/api/schedule/route.ts`, `src/lib/schedule.ts`, `src/lib/__tests__/schedule.test.ts`

- [ ] **Step 1: Rewrite `mods/page.tsx`** (keep dropzone behavior; restyle)

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Table } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/feedback/ToastProvider";
import { useConfirm } from "@/components/feedback/ConfirmProvider";

interface ModInfo { name: string; sizeBytes: number; }

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

  return (
    <main style={{ display: "grid", gap: "var(--sp-4)" }}>
      <h1 style={{ fontSize: 20 }}>Mods</h1>
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
              <tr key={m.name}><td>{m.name}</td><td style={{ textAlign: "right" }}><Button variant="danger" disabled={busy} onClick={() => del(m.name)}>Löschen</Button></td></tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Delete the Zeitplan files**

```bash
cd apps/gameserver-ui
git rm src/app/schedule/page.tsx src/app/api/schedule/route.ts src/lib/schedule.ts src/lib/__tests__/schedule.test.ts
```

- [ ] **Step 3: Confirm nothing else imports schedule**

Run: `cd apps/gameserver-ui && grep -rn "schedule" src/ || echo "no refs"`
Expected: only the now-deleted files were references; `parseCronSchedule`/`toSimpleCron` no longer imported anywhere. If `k8s.ts` `getCronJobs`/`updateCronJobSchedule`/`suspendCronJob` are now unused, leave them (harmless) — they are not removed by this plan.

- [ ] **Step 4: Verify build/lint/test + commit**

Run: `cd apps/gameserver-ui && npm run build && npm run lint && npm test`
Expected: PASS (schedule test removed).

```bash
git add apps/gameserver-ui/src/app/mods/page.tsx
git commit -m "feat(gameserver-ui): redesign mods page; remove Zeitplan (managed via k8s)"
```

---

## Task A14: Login restyle + Konsole nav stub

**Files:**
- Modify: `src/app/login/page.tsx`
- Create: `src/app/console/page.tsx` (stub, fully built in Task B5)

- [ ] **Step 1: Rewrite `login/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (res.ok) router.push("/"); else setError("Falsches Passwort");
  }

  return (
    <main style={{ maxWidth: 340, margin: "18vh auto", padding: "var(--sp-4)" }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", fontWeight: 700, fontSize: 18, marginBottom: "var(--sp-4)" }}>🧟 7DTD Gameserver</div>
        <form onSubmit={submit} style={{ display: "grid", gap: "var(--sp-3)" }}>
          <input type="password" value={password} placeholder="Passwort" autoFocus onChange={(e) => setPassword(e.target.value)}
            style={{ padding: "var(--sp-3)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--fg)" }} />
          <Button variant="primary" type="submit">Anmelden</Button>
        </form>
        {error && <p style={{ color: "var(--danger)", marginTop: "var(--sp-3)", fontSize: 13 }}>{error}</p>}
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Create `console/page.tsx` stub**

```tsx
"use client";
import { Card } from "@/components/ui/Card";
export default function ConsolePage() {
  return (
    <main style={{ display: "grid", gap: "var(--sp-4)" }}>
      <h1 style={{ fontSize: 20 }}>Konsole</h1>
      <Card><p style={{ color: "var(--fg-dim)" }}>Kommt in Kürze.</p></Card>
    </main>
  );
}
```

- [ ] **Step 3: Verify + Playwright pass over every route + commit**

Run: `cd apps/gameserver-ui && npm run build && npm run lint`
Manual: Playwright screenshot `/login`, `/`, `/players`, `/console`, `/logs`, `/config`, `/backups`, `/mods` — consistent dark sidebar look, logout works, no console errors.

```bash
git add apps/gameserver-ui/src/app/login/page.tsx apps/gameserver-ui/src/app/console/page.tsx
git commit -m "feat(gameserver-ui): restyle login + console nav stub"
```

---

## Task A15: Phase 1 verification gate

- [ ] **Step 1: Full local CI**

Run: `cd apps/gameserver-ui && npm run lint && npm run build && npm test`
Expected: all green.

- [ ] **Step 2: Repo lint (charts/yaml unaffected, but run for safety)**

Run: `cd /Users/jaydee/git/home-server && make lint` (only if Ansible/Helm touched — for app-only changes this is optional).

- [ ] **Step 3: Playwright regression** — screenshot all 8 routes; confirm: dark theme, sidebar active state, collapse toggle, mobile burger (resize to 400px), confirm-modal on stop/restore/delete, toasts on actions.

- [ ] **Step 4: Push branch & open draft PR for Phase 1** (do NOT merge until green CI; see CLAUDE.md contribution policy)

```bash
git push -u origin feat/gameserver-ui-redesign
```
PR body: "Phase 1 — Foundation + restyle. Closes part of the redesign spec." Link the spec.

---

# MILESTONE B — Phase 2: New Features

## Task B1: serverconfig parser/serializer (all properties)

**Files:**
- Create: `src/lib/serverconfig.ts`, `src/lib/__tests__/serverconfig.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { parseProperties, serializeProperties, type ConfigProp } from "../serverconfig";

const XML = `<?xml version="1.0"?>
<ServerSettings>
  <property name="ServerName" value="ZCPM"/>
  <property name="ServerPassword" value="secret"/>
  <property name="ServerMaxPlayerCount" value="8"/>
</ServerSettings>`;

describe("parseProperties", () => {
  it("extracts every property as name/value", () => {
    const props = parseProperties(XML);
    expect(props).toEqual<ConfigProp[]>([
      { name: "ServerName", value: "ZCPM" },
      { name: "ServerPassword", value: "secret" },
      { name: "ServerMaxPlayerCount", value: "8" },
    ]);
  });
});

describe("serializeProperties", () => {
  it("writes changed values back, preserving others and structure", () => {
    const out = serializeProperties(XML, { ServerName: "New", ServerMaxPlayerCount: "16" });
    expect(out).toContain(`name="ServerName" value="New"`);
    expect(out).toContain(`name="ServerMaxPlayerCount" value="16"`);
    expect(out).toContain(`name="ServerPassword" value="secret"`);
  });
  it("ignores keys not present in the XML", () => {
    const out = serializeProperties(XML, { DoesNotExist: "x" });
    expect(out).not.toContain("DoesNotExist");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/gameserver-ui && npx vitest run src/lib/__tests__/serverconfig.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `serverconfig.ts`**

```ts
export interface ConfigProp { name: string; value: string; }

const PROP_RE = /<property\s+name="([^"]+)"\s+value="([^"]*)"/gi;

export function parseProperties(xml: string): ConfigProp[] {
  const out: ConfigProp[] = [];
  for (const m of xml.matchAll(PROP_RE)) out.push({ name: m[1], value: m[2] });
  return out;
}

export function serializeProperties(xml: string, changes: Record<string, string>): string {
  let out = xml;
  for (const [name, value] of Object.entries(changes)) {
    const re = new RegExp(`(<property\\s+name="${name}"\\s+value=")[^"]*(")`, "i");
    if (re.test(out)) out = out.replace(re, `$1${value}$2`);
  }
  return out;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd apps/gameserver-ui && npx vitest run src/lib/__tests__/serverconfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/gameserver-ui/src/lib/serverconfig.ts apps/gameserver-ui/src/lib/__tests__/serverconfig.test.ts
git commit -m "feat(gameserver-ui): serverconfig property parse/serialize"
```

---

## Task B2: Config form UI with expert XML tab

**Files:**
- Create: `src/components/ui/Tabs.tsx`, `Tabs.module.css`
- Modify: `src/app/config/page.tsx`

> Password masking: any property whose name matches `/password/i` renders as `type="password"`.

- [ ] **Step 1: `Tabs.tsx` + `Tabs.module.css`**

```css
.tabs { display: flex; gap: var(--sp-1); border-bottom: 1px solid var(--border); margin-bottom: var(--sp-4); }
.tab { padding: var(--sp-2) var(--sp-3); color: var(--fg-muted); cursor: pointer; border-bottom: 2px solid transparent; background: none; border-top: none; border-left: none; border-right: none; font: inherit; }
.active { color: var(--accent); border-bottom-color: var(--accent); }
```
```tsx
"use client";
import styles from "./Tabs.module.css";
export function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div className={styles.tabs}>
      {tabs.map((t) => (
        <button key={t} className={`${styles.tab} ${t === active ? styles.active : ""}`} onClick={() => onChange(t)}>{t}</button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `config/page.tsx`** (form tab + expert XML tab; PUT still sends full `xml`)

```tsx
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
```

- [ ] **Step 3: Verify build/lint + screenshot (form shows all props; passwords masked; expert tab shows raw XML) + commit**

```bash
git add apps/gameserver-ui/src/components/ui/Tabs.tsx apps/gameserver-ui/src/components/ui/Tabs.module.css apps/gameserver-ui/src/app/config/page.tsx
git commit -m "feat(gameserver-ui): config form over all properties + expert XML tab"
```

---

## Task B3: Console API (free-text telnet command)

**Files:**
- Create: `src/app/api/console/route.ts`, `src/app/api/__tests__/console.test.ts`

- [ ] **Step 1: Write failing test** (mocks `@/lib/k8s`, `@/lib/ssh`, `@/lib/telnet`, following the existing `players` test pattern)

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/k8s", () => ({ VmClient: { inCluster: () => ({ getStatus: async () => ({ vmiPhase: "Running", ipAddress: "10.0.0.1" }) }) } }));
vi.mock("@/lib/ssh", () => ({ SshClient: { fromEnv: () => ({}) } }));
vi.mock("@/lib/telnet", () => ({ telnetCommand: vi.fn(async () => "Day 7, 08:30"), telnetOptsFromEnv: () => ({ port: 8081, password: "x" }) }));

import { POST } from "../console/route";
import { telnetCommand } from "@/lib/telnet";

describe("POST /api/console", () => {
  beforeEach(() => vi.clearAllMocks());
  it("rejects empty command", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ command: "" }) }));
    expect(res.status).toBe(400);
  });
  it("rejects commands with control characters", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ command: "gettime\nsay hi" }) }));
    expect(res.status).toBe(400);
  });
  it("runs the command and returns the output", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ command: "gettime" }) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ output: "Day 7, 08:30" });
    expect(telnetCommand).toHaveBeenCalledWith(expect.anything(), expect.anything(), "gettime");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/gameserver-ui && npx vitest run src/app/api/__tests__/console.test.ts`
Expected: FAIL (route missing).

- [ ] **Step 3: Implement `console/route.ts`** (mirrors `players/route.ts` guard)

```ts
import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";
import { telnetCommand, telnetOptsFromEnv } from "@/lib/telnet";

export async function POST(req: Request) {
  try {
    const { command } = await req.json().catch(() => ({}));
    if (typeof command !== "string" || !command.trim() || /[\r\n\x00]/.test(command) || command.length > 200) {
      return NextResponse.json({ error: "Ungültiger Befehl" }, { status: 400 });
    }
    const status = await VmClient.inCluster().getStatus();
    if (status.vmiPhase !== "Running" || !status.ipAddress) {
      return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
    }
    const ssh = SshClient.fromEnv(status.ipAddress);
    const output = await telnetCommand(ssh, telnetOptsFromEnv(), command.trim());
    return NextResponse.json({ output });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
```

- [ ] **Step 4: Run — expect PASS, then commit**

Run: `cd apps/gameserver-ui && npx vitest run src/app/api/__tests__/console.test.ts`

```bash
git add apps/gameserver-ui/src/app/api/console/route.ts apps/gameserver-ui/src/app/api/__tests__/console.test.ts
git commit -m "feat(gameserver-ui): console API (free-text telnet command)"
```

---

## Task B4: Console page UI

**Files:**
- Modify: `src/app/console/page.tsx` (replace stub)

- [ ] **Step 1: Implement the console page** (terminal-style output buffer + input)

```tsx
"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface Entry { cmd: string; out: string; }

export default function ConsolePage() {
  const [cmd, setCmd] = useState("");
  const [history, setHistory] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!cmd.trim()) return;
    setBusy(true);
    const r = await fetch("/api/console", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: cmd }) });
    const d = await r.json().catch(() => ({}));
    setHistory((h) => [...h, { cmd, out: r.ok ? d.output : `Fehler: ${d.error ?? r.status}` }]);
    setCmd(""); setBusy(false);
  }

  return (
    <main style={{ display: "grid", gap: "var(--sp-4)" }}>
      <h1 style={{ fontSize: 20 }}>Konsole</h1>
      <Card>
        <pre style={{ background: "var(--bg)", color: "var(--fg)", padding: "var(--sp-3)", height: "55vh", overflowY: "auto", fontSize: 12, borderRadius: 6 }}>
          {history.length === 0 ? <span style={{ color: "var(--fg-dim)" }}>Befehl eingeben…</span> :
            history.map((h, i) => <div key={i}><span style={{ color: "var(--accent)" }}>❯ {h.cmd}</span>{"\n"}{h.out}{"\n"}</div>)}
        </pre>
        <form onSubmit={run} style={{ display: "flex", gap: "var(--sp-2)", marginTop: "var(--sp-3)" }}>
          <input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="z. B. gettime"
            style={{ flex: 1, padding: "var(--sp-2) var(--sp-3)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--fg)", fontFamily: "var(--font-geist-mono)" }} />
          <Button variant="primary" type="submit" disabled={busy || !cmd.trim()}>Senden</Button>
        </form>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Verify build/lint + screenshot + commit**

```bash
git add apps/gameserver-ui/src/app/console/page.tsx
git commit -m "feat(gameserver-ui): console page UI"
```

---

## Task B5: Log tools (search, filter, pause, copy, download)

**Files:**
- Modify: `src/app/logs/page.tsx`

- [ ] **Step 1: Extend logs page** (client-side filter over the existing buffer; pause stops appending; copy/download from buffer)

```tsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface LogLine { id: number; text: string; }
let lineCounter = 0;

export default function LogsPage() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    const es = new EventSource("/api/logs");
    es.onmessage = (e) => { if (!pausedRef.current) setLines((prev) => [...prev.slice(-499), { id: lineCounter++, text: e.data }]); };
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  const filtered = useMemo(() => query ? lines.filter((l) => l.text.toLowerCase().includes(query.toLowerCase())) : lines, [lines, query]);
  useEffect(() => { const el = ref.current; if (el && !paused) el.scrollTop = el.scrollHeight; }, [filtered, paused]);

  function download() {
    const blob = new Blob([lines.map((l) => l.text).join("\n")], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "7dtd-logs.txt"; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <main style={{ display: "grid", gap: "var(--sp-4)" }}>
      <h1 style={{ fontSize: 20 }}>Logs</h1>
      <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Suchen…"
          style={{ flex: 1, minWidth: 160, padding: "var(--sp-2) var(--sp-3)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--fg)" }} />
        <Button variant="secondary" onClick={() => setPaused((p) => !p)}>{paused ? "▶ Fortsetzen" : "⏸ Pause"}</Button>
        <Button variant="secondary" onClick={() => navigator.clipboard.writeText(lines.map((l) => l.text).join("\n"))}>⧉ Kopieren</Button>
        <Button variant="secondary" onClick={download}>⬇ Download</Button>
      </div>
      <Card>
        <pre ref={ref} style={{ background: "var(--bg)", color: "var(--fg)", padding: "var(--sp-3)", height: "60vh", overflowY: "auto", fontSize: 12, borderRadius: 6 }}>
          {filtered.map((l) => <div key={l.id}>{l.text}</div>)}
        </pre>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Verify build/lint + screenshot + commit**

```bash
git add apps/gameserver-ui/src/app/logs/page.tsx
git commit -m "feat(gameserver-ui): log tools (search, pause, copy, download)"
```

---

## Task B6: Backups retention library

**Files:**
- Create: `src/lib/retention.ts`, `src/lib/__tests__/retention.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { backupsToPrune } from "../retention";
import type { BackupMeta } from "../backups";

const mk = (ts: string): BackupMeta => ({ filename: `backup-${ts}.tar.gz`, timestamp: ts, sizeBytes: 1 });

describe("backupsToPrune", () => {
  it("keeps the newest N and returns the rest (oldest)", () => {
    const list = [mk("2026-06-11T10:00:00"), mk("2026-06-10T10:00:00"), mk("2026-06-09T10:00:00")];
    expect(backupsToPrune(list, 2).map((b) => b.timestamp)).toEqual(["2026-06-09T10:00:00"]);
  });
  it("returns nothing when at or below the limit", () => {
    expect(backupsToPrune([mk("2026-06-11T10:00:00")], 2)).toEqual([]);
  });
  it("treats keepN<=0 as keep-all (safety)", () => {
    expect(backupsToPrune([mk("a"), mk("b")], 0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/gameserver-ui && npx vitest run src/lib/__tests__/retention.test.ts`

- [ ] **Step 3: Implement `retention.ts`**

```ts
import type { BackupMeta } from "./backups";

export function backupsToPrune(backups: BackupMeta[], keepN: number): BackupMeta[] {
  if (keepN <= 0) return [];
  const sorted = [...backups].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return sorted.slice(keepN);
}
```

- [ ] **Step 4: Run — expect PASS, then commit**

```bash
git add apps/gameserver-ui/src/lib/retention.ts apps/gameserver-ui/src/lib/__tests__/retention.test.ts
git commit -m "feat(gameserver-ui): backup retention selection"
```

---

## Task B7: Backups delete + download API; wire retention into create

**Files:**
- Create: `src/app/api/backups/[name]/route.ts`
- Modify: `src/app/api/backups/route.ts` (prune after create)

- [ ] **Step 1: Create `[name]/route.ts` (DELETE + GET download)**

```ts
import { NextResponse } from "next/server";
import { backupFilePath } from "@/lib/backups";
import { createReadStream, existsSync, unlinkSync, statSync } from "fs";
import { join } from "path";
import { Readable } from "stream";

const backupDir = () => join(process.env.NAS_MOUNT_PATH ?? "/mnt/gameserver-data", "backups");

export async function DELETE(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    const path = backupFilePath(backupDir(), name);
    if (!existsSync(path)) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    unlinkSync(path);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    const path = backupFilePath(backupDir(), name);
    if (!existsSync(path)) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;
    return new Response(stream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Length": String(statSync(path).size),
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
```

> `backupFilePath` (existing) already rejects path traversal — reused here for `name`.

- [ ] **Step 2: Prune in `backups/route.ts` after successful create**

Add imports at top:
```ts
import { listBackups } from "@/lib/backups";
import { backupsToPrune } from "@/lib/retention";
import { unlinkSync } from "fs";
```
After `renameSync(partialPath, destPath);` and before the success response, insert:
```ts
    const keepN = Number(process.env.BACKUP_KEEP ?? "7");
    for (const old of backupsToPrune(listBackups(dir), keepN)) {
      try { unlinkSync(backupFilePath(dir, old.filename)); } catch { /* ignore */ }
    }
```
(`listBackups` and `backupFilePath` are already imported in this file; add only the missing `listBackups`/`backupsToPrune`/`unlinkSync` that aren't present. Note `unlinkSync` is already imported in the file — do not duplicate.)

- [ ] **Step 3: Verify build/lint/test**

Run: `cd apps/gameserver-ui && npm run build && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/gameserver-ui/src/app/api/backups
git commit -m "feat(gameserver-ui): backup delete + download API; retention on create"
```

---

## Task B8: Backups page — download + delete buttons

**Files:**
- Modify: `src/app/backups/page.tsx`

- [ ] **Step 1: Add Download (link) + Delete (confirm) to each row**

In the actions `<td>` of each backup row, replace the single Restore button with:
```tsx
<td style={{ textAlign: "right", display: "flex", gap: "var(--sp-2)", justifyContent: "flex-end" }}>
  <a href={`/api/backups/${encodeURIComponent(b.filename)}`}><Button variant="secondary">⬇</Button></a>
  <Button variant="secondary" disabled={busy} onClick={() => restore(b.filename)}>Restore</Button>
  <Button variant="danger" disabled={busy} onClick={() => del(b.filename)}>Löschen</Button>
</td>
```
Add the `del` handler next to the existing handlers:
```tsx
async function del(filename: string) {
  if (!(await confirm({ title: "Backup löschen?", body: `"${filename}" wird dauerhaft entfernt.`, danger: true }))) return;
  setBusy(true);
  const r = await fetch(`/api/backups/${encodeURIComponent(filename)}`, { method: "DELETE" });
  setBusy(false); toast(r.ok ? "ok" : "error", r.ok ? "Backup gelöscht" : "Löschen fehlgeschlagen"); if (r.ok) load();
}
```

- [ ] **Step 2: Verify build/lint + screenshot + commit**

```bash
git add apps/gameserver-ui/src/app/backups/page.tsx
git commit -m "feat(gameserver-ui): backups download + delete in UI"
```

---

## Task B9: Player online-session duration (best-effort)

**Files:**
- Create: `src/lib/playersession.ts`, `src/lib/__tests__/playersession.test.ts`
- Modify: `src/app/api/players/route.ts`, `src/app/players/page.tsx`

> Honesty caveat (from spec): true "last login" / persistent playtime is unavailable via telnet. We track **online-session start** in module memory keyed by player id (resets on pod restart) and expose it as "online seit".

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { SessionTracker } from "../playersession";

describe("SessionTracker", () => {
  it("records first-seen time per id and reports it", () => {
    const t = new SessionTracker(() => 1000);
    t.seen(["a", "b"]);
    expect(t.since("a")).toBe(1000);
  });
  it("keeps the original first-seen across later polls", () => {
    let now = 1000;
    const t = new SessionTracker(() => now);
    t.seen(["a"]); now = 5000; t.seen(["a"]);
    expect(t.since("a")).toBe(1000);
  });
  it("forgets players that went offline", () => {
    const t = new SessionTracker(() => 1000);
    t.seen(["a"]); t.seen(["b"]);
    expect(t.since("a")).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/gameserver-ui && npx vitest run src/lib/__tests__/playersession.test.ts`

- [ ] **Step 3: Implement `playersession.ts`**

```ts
export class SessionTracker {
  private firstSeen = new Map<string, number>();
  constructor(private now: () => number = () => Date.now()) {}
  seen(ids: string[]): void {
    const set = new Set(ids);
    for (const id of [...this.firstSeen.keys()]) if (!set.has(id)) this.firstSeen.delete(id);
    for (const id of ids) if (!this.firstSeen.has(id)) this.firstSeen.set(id, this.now());
  }
  since(id: string): number | null {
    return this.firstSeen.get(id) ?? null;
  }
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd apps/gameserver-ui && npx vitest run src/lib/__tests__/playersession.test.ts`

- [ ] **Step 5: Wire into `players/route.ts`** — add a module-level tracker and enrich GET output

At top of file, after imports:
```ts
import { SessionTracker } from "@/lib/playersession";
const tracker = new SessionTracker();
```
In `GET`, after `const output = await telnetCommand(...)`:
```ts
    const players = parseLp(output);
    tracker.seen(players.map((p) => p.id));
    const enriched = players.map((p) => ({ ...p, onlineSince: tracker.since(p.id) }));
    return NextResponse.json({ players: enriched });
```
(Replace the previous `return NextResponse.json({ players: parseLp(output) });`.)

- [ ] **Step 6: Show "online seit" in `players/page.tsx`**

Extend the `Player` interface with `onlineSince: number | null;`, add a column:
```tsx
<thead><tr><th>Name</th><th>Level</th><th>Online seit</th></tr></thead>
```
```tsx
<tr key={p.id}><td>{p.name}</td><td>{p.level}</td>
  <td>{p.onlineSince ? new Date(p.onlineSince).toLocaleTimeString("de-DE") : "—"}</td></tr>
```

- [ ] **Step 7: Verify build/lint/test + screenshot + commit**

```bash
git add apps/gameserver-ui/src/lib/playersession.ts apps/gameserver-ui/src/lib/__tests__/playersession.test.ts apps/gameserver-ui/src/app/api/players/route.ts apps/gameserver-ui/src/app/players/page.tsx
git commit -m "feat(gameserver-ui): best-effort online-session duration for players"
```

---

## Task B10: Horde-night countdown

**Files:**
- Create: `src/lib/gametime.ts`, `src/lib/__tests__/gametime.test.ts`, `src/app/api/gametime/route.ts`
- Modify: `src/app/page.tsx` (add tile)

> `gettime` output format (7DTD): `Day 7, 08:30`. Blood moon every `BloodMoonFrequency` days (default 7). Next blood moon day = smallest multiple of freq ≥ current day (if current day is a blood moon day and night not yet passed, that's today).

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { parseGetTime, nextBloodMoon } from "../gametime";

describe("parseGetTime", () => {
  it("parses 'Day 7, 08:30'", () => {
    expect(parseGetTime("Day 7, 08:30")).toEqual({ day: 7, hour: 8, minute: 30 });
  });
  it("returns null on garbage", () => {
    expect(parseGetTime("nope")).toBeNull();
  });
});

describe("nextBloodMoon", () => {
  it("returns the current day when it is a blood moon day", () => {
    expect(nextBloodMoon(7, 7)).toBe(7);
    expect(nextBloodMoon(14, 7)).toBe(14);
  });
  it("returns the next multiple otherwise", () => {
    expect(nextBloodMoon(5, 7)).toBe(7);
    expect(nextBloodMoon(8, 7)).toBe(14);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/gameserver-ui && npx vitest run src/lib/__tests__/gametime.test.ts`

- [ ] **Step 3: Implement `gametime.ts`**

```ts
export interface GameTime { day: number; hour: number; minute: number; }

export function parseGetTime(output: string): GameTime | null {
  const m = output.match(/Day\s+(\d+),\s*(\d{1,2}):(\d{2})/i);
  if (!m) return null;
  return { day: Number(m[1]), hour: Number(m[2]), minute: Number(m[3]) };
}

export function nextBloodMoon(currentDay: number, frequency: number): number {
  if (frequency <= 0) return currentDay;
  return Math.ceil(currentDay / frequency) * frequency;
}
```

- [ ] **Step 4: Run — expect PASS, then implement `gametime/route.ts`**

```ts
import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";
import { telnetCommand, telnetOptsFromEnv } from "@/lib/telnet";
import { parseGetTime } from "@/lib/gametime";

export async function GET() {
  try {
    const status = await VmClient.inCluster().getStatus();
    if (status.vmiPhase !== "Running" || !status.ipAddress) {
      return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
    }
    const ssh = SshClient.fromEnv(status.ipAddress);
    const out = await telnetCommand(ssh, telnetOptsFromEnv(), "gettime");
    const gt = parseGetTime(out);
    if (!gt) return NextResponse.json({ error: "Zeit nicht lesbar" }, { status: 502 });
    return NextResponse.json(gt);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
```

- [ ] **Step 5: Add a horde tile to the dashboard** (`page.tsx`)

Add state + effect (reads gametime + BloodMoonFrequency from config):
```tsx
const [horde, setHorde] = useState<string | null>(null);
useEffect(() => {
  (async () => {
    const [gtRes, cfgRes] = await Promise.all([fetch("/api/gametime"), fetch("/api/config")]);
    if (!gtRes.ok) return;
    const gt = await gtRes.json();
    let freq = 7;
    if (cfgRes.ok) { const { extractConfigValue } = await import("@/lib/config"); const d = await cfgRes.json();
      freq = Number(extractConfigValue(d.xml ?? "", "BloodMoonFrequency") ?? "7") || 7; }
    const { nextBloodMoon } = await import("@/lib/gametime");
    const next = nextBloodMoon(gt.day, freq);
    setHorde(next === gt.day ? "Heute Nacht!" : `Tag ${next} (in ${next - gt.day})`);
  })().catch(() => {});
}, [running]);
```
Add a tile in the stat grid:
```tsx
<StatTile label="Blutmond" value={horde ?? "—"} />
```

- [ ] **Step 6: Verify build/lint/test + screenshot + commit**

```bash
git add apps/gameserver-ui/src/lib/gametime.ts apps/gameserver-ui/src/lib/__tests__/gametime.test.ts apps/gameserver-ui/src/app/api/gametime/route.ts apps/gameserver-ui/src/app/page.tsx
git commit -m "feat(gameserver-ui): horde-night countdown (gettime + BloodMoonFrequency)"
```

---

## Task B11: Phase 2 verification gate

- [ ] **Step 1: Full local CI**

Run: `cd apps/gameserver-ui && npm run lint && npm run build && npm test`
Expected: all green; new lib tests (serverconfig, retention, playersession, gametime) + console route test pass.

- [ ] **Step 2: Playwright end-to-end** over every route incl. new console + config form + backups download/delete + dashboard horde tile. Confirm modals + toasts everywhere; mobile (400px) works.

- [ ] **Step 3: Pre-PR skill sequence (per repo CLAUDE.md)** — run before opening the PR:
  `forgecrate-doc-sync` → `forgecrate-handoff` → `accessibility-audit` → `ui-ux-audit` → `forgecrate-pr-checklist`. Update `docs/20-gameserver-ui.md` (nav changes: Zeitplan removed, Konsole added; new env `BACKUP_KEEP`).

- [ ] **Step 4: Push & finalize PR** (CLAUDE.md: merge only on green Lint + Security CI; never push to main directly).

---

## Self-Review (done while writing — recorded here)

- **Spec coverage:** dark Clean-Admin (A1), amber accent (A1), collapsible sidebar (A7), comfortable density (tokens A1), mobile (A7/A11/B verification), branding from config (A7), skeletons (A3/pages), click-confirm modal (A5), toasts (A4), polling kept (A6), Dashboard hero+tiles+connect+technik (A9), players new columns + no HP/Ping + saveworld moved (A10/A12/B9), Konsole (A14/B3/B4), Logs without metrics + tools (A11/B5), Config form + expert tab over all props (B1/B2), Backups download/delete/retention (B6/B7/B8), Zeitplan removed (A13), horde countdown (B10), login restyle (A14). YAGNI exclusions respected (no kick/ban, no Gotify, no undo, no metrics history graphs).
- **Open spec point resolved:** player "letzter Login" replaced by best-effort "online seit" (B9) — flagged to user at handoff.
- **Type consistency:** `useVmStatus` shape matches `/api/vm`; `parseProperties`/`serializeProperties` names consistent B1↔B2; `backupsToPrune` B6↔B7; `SessionTracker.seen/since` B9; `parseGetTime`/`nextBloodMoon` B10. `Player.onlineSince` added in both route (B9.5) and page (B9.6).
- **Placeholders:** none — every code step contains full code.
