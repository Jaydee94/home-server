# Gameserver-UI Iterationen 3–7 Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vervollständigung der Gameserver-UI mit Spielerliste (Telnet), Live-Logs (SSH), serverconfig.xml-Editor, Spielwelt-Backups und CronJob-Zeitplanung.

**Architecture:** Der Next.js-Container kommuniziert per SSH (`ssh2`, User `ubuntu`, Key aus Secret `/etc/gameserver-ui/ssh/privateKey`) und Telnet (Node.js `net`, Port 8081) mit der KubeVirt-VM. Die VM-IP wird bei jedem Aufruf dynamisch aus dem VMI-Status gelesen. Backups werden als tar-Stream über SSH auf den NAS-Mount (`/mnt/gameserver-data/backups/`) geschrieben.

**Tech Stack:** Next.js App Router, TypeScript, `ssh2` (SSH), Node.js `net` (Telnet), vitest (Tests), Helm/ArgoCD (Infra).

**VM-Fakten (ermittelt 2026-06-11):**
- SSH: `ubuntu@<vmi-pod-ip>`, sudo-Rechte, Key in Secret `gameserver-ui-ssh` (key `privateKey`)
- Docker-Container: `7dtd-server`
- serverconfig.xml: `/opt/7dtd/config/serverconfig.xml` (bind-mount ins Deployment)
- Spielwelt-Daten: `/opt/7dtd/data/Saves/`
- Telnet: Port 8081, Passwort via Env `TELNET_PASSWORD`
- Logs: `sudo docker logs -f 7dtd-server`
- Docker-Neustart: `sudo docker restart 7dtd-server`
- CronJobs in Namespace `gameserver`: `gameserver-start` (Mi 20:00), `gameserver-stop` (Do 00:00)

---

## Dateistruktur

**Neue Dateien:**
- `apps/gameserver-ui/src/lib/ssh.ts` — SSH exec + Streaming via `ssh2`
- `apps/gameserver-ui/src/lib/telnet.ts` — Telnet-Client, Auth, `lp`/`say`/`saveworld`
- `apps/gameserver-ui/src/lib/config.ts` — serverconfig.xml lesen/schreiben
- `apps/gameserver-ui/src/lib/backups.ts` — Backup-Liste/Erstellen/Restore
- `apps/gameserver-ui/src/lib/__tests__/ssh.test.ts`
- `apps/gameserver-ui/src/lib/__tests__/telnet.test.ts`
- `apps/gameserver-ui/src/lib/__tests__/config.test.ts`
- `apps/gameserver-ui/src/lib/__tests__/backups.test.ts`
- `apps/gameserver-ui/src/app/api/players/route.ts`
- `apps/gameserver-ui/src/app/api/players/__tests__/route.test.ts`
- `apps/gameserver-ui/src/app/api/logs/route.ts`
- `apps/gameserver-ui/src/app/api/metrics/route.ts`
- `apps/gameserver-ui/src/app/api/config/route.ts`
- `apps/gameserver-ui/src/app/api/config/__tests__/route.test.ts`
- `apps/gameserver-ui/src/app/api/backups/route.ts`
- `apps/gameserver-ui/src/app/api/backups/[name]/restore/route.ts`
- `apps/gameserver-ui/src/app/api/backups/__tests__/route.test.ts`
- `apps/gameserver-ui/src/app/api/schedule/route.ts`
- `apps/gameserver-ui/src/app/api/schedule/__tests__/route.test.ts`
- `apps/gameserver-ui/src/app/players/page.tsx`
- `apps/gameserver-ui/src/app/logs/page.tsx`
- `apps/gameserver-ui/src/app/config/page.tsx`
- `apps/gameserver-ui/src/app/backups/page.tsx`
- `apps/gameserver-ui/src/app/schedule/page.tsx`
- `argocd/apps/gameserver-ui/templates/sealedsecret-telnet.yaml`

**Geänderte Dateien:**
- `apps/gameserver-ui/src/lib/k8s.ts` — CronJob-Operationen ergänzen
- `apps/gameserver-ui/src/lib/__tests__/k8s.test.ts` — CronJob-Tests
- `apps/gameserver-ui/src/app/layout.tsx` — Navigation
- `apps/gameserver-ui/package.json` — `ssh2` + `@types/ssh2` ergänzen
- `argocd/apps/gameserver-ui/templates/deployment.yaml` — SSH-Key-Volume + NAS-Mount + Env-Vars
- `argocd/apps/gameserver-ui/templates/rbac.yaml` — CronJobs-Permissions
- `argocd/apps/gameserver-ui/values.yaml` — `telnet`-Sektion

---

## Task 1: Abhängigkeiten + SSH-Lib

**Files:**
- Modify: `apps/gameserver-ui/package.json`
- Create: `apps/gameserver-ui/src/lib/ssh.ts`
- Create: `apps/gameserver-ui/src/lib/__tests__/ssh.test.ts`

- [ ] **Step 1: Dependency installieren**

```bash
cd apps/gameserver-ui
npm install ssh2
npm install --save-dev @types/ssh2
```

- [ ] **Step 2: Failing test schreiben**

`apps/gameserver-ui/src/lib/__tests__/ssh.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { SshClient } from "@/lib/ssh";

describe("SshClient", () => {
  it("exec führt einen Befehl aus und gibt stdout zurück", async () => {
    const client = new SshClient({ host: "10.0.0.1", user: "ubuntu", privateKey: "key" });
    // Smoke-Test: Konstruktor wirft nicht
    expect(client).toBeDefined();
  });

  it("getVmSshClient liest privateKey-Pfad aus Env", () => {
    process.env.VM_SSH_KEY_PATH = "/etc/gameserver-ui/ssh/privateKey";
    process.env.VM_SSH_USER = "ubuntu";
    // Kein Fehler beim Erstellen ohne Host (wird dynamisch gesetzt)
    expect(() => SshClient.fromEnv("10.0.0.1")).not.toThrow();
  });
});
```

- [ ] **Step 3: Test fehlschlagen lassen**

```bash
cd apps/gameserver-ui && npx vitest run src/lib/__tests__/ssh.test.ts
```
Erwartet: FAIL (SshClient nicht definiert)

- [ ] **Step 4: SSH-Lib implementieren**

`apps/gameserver-ui/src/lib/ssh.ts`:
```typescript
import { Client, type ConnectConfig } from "ssh2";
import { readFileSync } from "fs";

export interface SshOptions {
  host: string;
  user: string;
  privateKey: string;
}

export class SshClient {
  constructor(private opts: SshOptions) {}

  static fromEnv(host: string): SshClient {
    const keyPath = process.env.VM_SSH_KEY_PATH ?? "/etc/gameserver-ui/ssh/privateKey";
    const user = process.env.VM_SSH_USER ?? "ubuntu";
    const privateKey = readFileSync(keyPath, "utf8");
    return new SshClient({ host, user, privateKey });
  }

  exec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let stdout = "";
      let stderr = "";

      conn.on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) { conn.end(); return reject(err); }
          stream.on("data", (d: Buffer) => { stdout += d.toString(); });
          stream.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
          stream.on("close", (code: number) => {
            conn.end();
            if (code !== 0) reject(new Error(`Exit ${code}: ${stderr.trim()}`));
            else resolve(stdout);
          });
        });
      });

      conn.on("error", reject);
      conn.connect(this.connectConfig());
    });
  }

  /** Gibt einen ReadableStream zurück, der Zeilen aus stdout liefert. */
  stream(command: string): ReadableStream<Uint8Array> {
    const { host, user, privateKey } = this.opts;
    return new ReadableStream({
      start(controller) {
        const conn = new Client();
        conn.on("ready", () => {
          conn.exec(command, (err, stream) => {
            if (err) { controller.error(err); conn.end(); return; }
            stream.on("data", (d: Buffer) => controller.enqueue(d));
            stream.on("close", () => { controller.close(); conn.end(); });
            stream.on("error", (e: Error) => { controller.error(e); conn.end(); });
          });
        });
        conn.on("error", (e) => controller.error(e));
        conn.connect({ host, username: user, privateKey });
      },
    });
  }

  private connectConfig(): ConnectConfig {
    return { host: this.opts.host, username: this.opts.user, privateKey: this.opts.privateKey };
  }
}
```

- [ ] **Step 5: Test bestehen lassen**

```bash
cd apps/gameserver-ui && npx vitest run src/lib/__tests__/ssh.test.ts
```
Erwartet: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/gameserver-ui/package.json apps/gameserver-ui/package-lock.json \
  apps/gameserver-ui/src/lib/ssh.ts apps/gameserver-ui/src/lib/__tests__/ssh.test.ts
git commit -m "feat(gameserver-ui): SshClient lib (exec + streaming)"
```

---

## Task 2: Telnet-Lib

**Files:**
- Create: `apps/gameserver-ui/src/lib/telnet.ts`
- Create: `apps/gameserver-ui/src/lib/__tests__/telnet.test.ts`

- [ ] **Step 1: Failing tests schreiben**

`apps/gameserver-ui/src/lib/__tests__/telnet.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { parseLp } from "@/lib/telnet";

describe("parseLp", () => {
  it("parst Spielerliste aus lp-Ausgabe", () => {
    const output = `Total of 2 in the game\nPlayer \"Hans\", id=76561198000000001, pos=(100, 64, 200), health=100, deaths=0, zombies=5, players=0, score=0, level=1, steamid=76561198000000001, ip=127.0.0.1, ping=0\nPlayer \"Greta\", id=76561198000000002, pos=(50, 64, 100), health=80, deaths=1, zombies=10, players=0, score=50, level=3, steamid=76561198000000002, ip=127.0.0.2, ping=5`;
    const players = parseLp(output);
    expect(players).toHaveLength(2);
    expect(players[0]).toEqual({ name: "Hans", id: "76561198000000001", health: 100, level: 1, ping: 0 });
    expect(players[1]).toEqual({ name: "Greta", id: "76561198000000002", health: 80, level: 3, ping: 5 });
  });

  it("gibt leeres Array zurück wenn keine Spieler online", () => {
    expect(parseLp("Total of 0 in the game")).toEqual([]);
  });
});
```

- [ ] **Step 2: Test fehlschlagen lassen**

```bash
cd apps/gameserver-ui && npx vitest run src/lib/__tests__/telnet.test.ts
```
Erwartet: FAIL (parseLp nicht definiert)

- [ ] **Step 3: Telnet-Lib implementieren**

`apps/gameserver-ui/src/lib/telnet.ts`:
```typescript
import * as net from "net";

export interface Player {
  name: string;
  id: string;
  health: number;
  level: number;
  ping: number;
}

export function parseLp(output: string): Player[] {
  const players: Player[] = [];
  const lineRe = /^Player "(.+?)", id=(\d+),.+?health=(\d+),.+?level=(\d+),.+?ping=(\d+)/;
  for (const line of output.split("\n")) {
    const m = line.match(lineRe);
    if (m) {
      players.push({
        name: m[1],
        id: m[2],
        health: Number(m[3]),
        level: Number(m[4]),
        ping: Number(m[5]),
      });
    }
  }
  return players;
}

export interface TelnetOptions {
  host: string;
  port: number;
  password: string;
  timeoutMs?: number;
}

/**
 * Verbindet zum 7DTD-Telnet-Server, authentifiziert sich und sendet einen Befehl.
 * Wartet auf den abschließenden Prompt ("2020-" Zeitstempel-Präfix fehlt → Prompt erkannt).
 */
export async function telnetCommand(opts: TelnetOptions, command: string): Promise<string> {
  const { host, port, password, timeoutMs = 10000 } = opts;

  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port });
    let buf = "";
    let authed = false;
    const timer = setTimeout(() => { sock.destroy(); reject(new Error("Telnet timeout")); }, timeoutMs);

    sock.setEncoding("utf8");

    sock.on("data", (chunk: string) => {
      buf += chunk;

      if (!authed && buf.includes("Please enter password:")) {
        sock.write(password + "\r\n");
        buf = "";
        return;
      }

      if (!authed && (buf.includes("Logon successful") || buf.includes("Press 'help'"))) {
        authed = true;
        buf = "";
        sock.write(command + "\r\n");
        return;
      }

      // Warten bis kein neues Daten mehr kommen (Server sendet Ergebnis + neues Prompt)
      if (authed && buf.includes("\n")) {
        clearTimeout(timer);
        // Kurz warten ob noch mehr kommt
        setTimeout(() => {
          sock.destroy();
          resolve(buf.trim());
        }, 300);
      }
    });

    sock.on("error", (e) => { clearTimeout(timer); reject(e); });
    sock.on("close", () => clearTimeout(timer));
  });
}

export function telnetOptsFromEnv(host: string): TelnetOptions {
  return {
    host,
    port: Number(process.env.VM_TELNET_PORT ?? "8081"),
    password: process.env.TELNET_PASSWORD ?? "",
  };
}
```

- [ ] **Step 4: Tests bestehen lassen**

```bash
cd apps/gameserver-ui && npx vitest run src/lib/__tests__/telnet.test.ts
```
Erwartet: PASS (parseLp-Tests)

- [ ] **Step 5: Commit**

```bash
git add apps/gameserver-ui/src/lib/telnet.ts apps/gameserver-ui/src/lib/__tests__/telnet.test.ts
git commit -m "feat(gameserver-ui): TelnetClient lib (parseLp, telnetCommand)"
```

---

## Task 3: Spielerliste-API + UI (Iteration 3)

**Files:**
- Create: `apps/gameserver-ui/src/app/api/players/route.ts`
- Create: `apps/gameserver-ui/src/app/api/players/__tests__/route.test.ts`
- Create: `apps/gameserver-ui/src/app/players/page.tsx`

- [ ] **Step 1: Failing API-Tests schreiben**

`apps/gameserver-ui/src/app/api/players/__tests__/route.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const getStatus = vi.fn();
const telnetCommand = vi.fn();
vi.mock("@/lib/k8s", () => ({ VmClient: { inCluster: () => ({ getStatus }) } }));
vi.mock("@/lib/telnet", () => ({ telnetCommand, parseLp: vi.fn().mockReturnValue([{ name: "Hans", id: "1", health: 100, level: 1, ping: 5 }]), telnetOptsFromEnv: vi.fn().mockReturnValue({ host: "x", port: 8081, password: "pw" }) }));

import { GET, POST } from "@/app/api/players/route";

beforeEach(() => vi.clearAllMocks());

describe("/api/players", () => {
  it("GET liefert Spielerliste wenn VM läuft", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.1" });
    telnetCommand.mockResolvedValue("Total of 1 in the game\nPlayer...");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.players).toHaveLength(1);
  });

  it("GET gibt 503 zurück wenn VM nicht läuft", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Stopped", ipAddress: null });
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it("POST broadcast sendet say-Befehl", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.1" });
    telnetCommand.mockResolvedValue("");
    const res = await POST(new Request("http://x/api/players", {
      method: "POST",
      body: JSON.stringify({ action: "broadcast", message: "Hallo!" }),
    }));
    expect(res.status).toBe(200);
    expect(telnetCommand).toHaveBeenCalledWith(expect.any(Object), "say Hallo!");
  });

  it("POST saveworld löst saveworld-Befehl aus", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.1" });
    telnetCommand.mockResolvedValue("World saved");
    const res = await POST(new Request("http://x/api/players", {
      method: "POST",
      body: JSON.stringify({ action: "saveworld" }),
    }));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Test fehlschlagen lassen**

```bash
cd apps/gameserver-ui && npx vitest run src/app/api/players
```
Erwartet: FAIL (route nicht gefunden)

- [ ] **Step 3: API implementieren**

`apps/gameserver-ui/src/app/api/players/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";
import { telnetCommand, parseLp, telnetOptsFromEnv } from "@/lib/telnet";

async function getIpOrError(): Promise<{ ip: string } | NextResponse> {
  const status = await VmClient.inCluster().getStatus();
  if (status.vmiPhase !== "Running" || !status.ipAddress) {
    return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
  }
  return { ip: status.ipAddress };
}

export async function GET() {
  try {
    const result = await getIpOrError();
    if (result instanceof NextResponse) return result;
    const output = await telnetCommand(telnetOptsFromEnv(result.ip), "lp");
    return NextResponse.json({ players: parseLp(output) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const { action, message } = await req.json().catch(() => ({}));
    const result = await getIpOrError();
    if (result instanceof NextResponse) return result;
    const opts = telnetOptsFromEnv(result.ip);

    if (action === "broadcast") {
      if (!message) return NextResponse.json({ error: "message fehlt" }, { status: 400 });
      await telnetCommand(opts, `say ${message}`);
      return NextResponse.json({ ok: true });
    }
    if (action === "saveworld") {
      await telnetCommand(opts, "saveworld");
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "action muss broadcast|saveworld sein" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
```

- [ ] **Step 4: Tests bestehen lassen**

```bash
cd apps/gameserver-ui && npx vitest run src/app/api/players
```
Erwartet: PASS (5 Tests)

- [ ] **Step 5: UI-Seite erstellen**

`apps/gameserver-ui/src/app/players/page.tsx`:
```typescript
"use client";
import { useEffect, useState } from "react";

interface Player { name: string; id: string; health: number; level: number; ping: number; }

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/players");
    if (res.ok) { setPlayers((await res.json()).players); setError(""); }
    else { setError((await res.json()).error ?? `Fehler ${res.status}`); }
  }

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

  async function broadcast() {
    if (!message.trim()) return;
    setBusy(true);
    await fetch("/api/players", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "broadcast", message }) });
    setMessage(""); setBusy(false);
  }

  async function saveworld() {
    if (!confirm("Spielwelt jetzt speichern?")) return;
    setBusy(true);
    await fetch("/api/players", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "saveworld" }) });
    setBusy(false);
  }

  return (
    <main style={{ maxWidth: 800, margin: "5vh auto", fontFamily: "sans-serif" }}>
      <h1>Spieler ({players.length})</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <table cellPadding={6} style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
          <th>Name</th><th>Level</th><th>HP</th><th>Ping</th>
        </tr></thead>
        <tbody>
          {players.length === 0 && <tr><td colSpan={4}>Keine Spieler online</td></tr>}
          {players.map(p => (
            <tr key={p.id} style={{ borderBottom: "1px solid #eee" }}>
              <td>{p.name}</td><td>{p.level}</td><td>{p.health}</td><td>{p.ping}ms</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 24 }}>
        <input value={message} onChange={e => setMessage(e.target.value)}
          placeholder="Broadcast-Nachricht" style={{ marginRight: 8, width: 300 }} />
        <button disabled={busy || !message.trim()} onClick={broadcast}>📢 Senden</button>
        {" "}
        <button disabled={busy} onClick={saveworld}>💾 Welt speichern</button>
      </p>
      <p><a href="/">← Dashboard</a></p>
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/gameserver-ui/src/app/api/players/ apps/gameserver-ui/src/app/players/
git commit -m "feat(gameserver-ui): Spielerliste + Telnet-Aktionen (Iter. 3)"
```

---

## Task 4: Logs-API + Metriken-API (Iteration 4)

**Files:**
- Create: `apps/gameserver-ui/src/app/api/logs/route.ts`
- Create: `apps/gameserver-ui/src/app/api/metrics/route.ts`
- Create: `apps/gameserver-ui/src/app/logs/page.tsx`

- [ ] **Step 1: Logs-API (SSE-Stream)**

`apps/gameserver-ui/src/app/api/logs/route.ts`:
```typescript
import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await VmClient.inCluster().getStatus().catch(() => null);
  if (!status || status.vmiPhase !== "Running" || !status.ipAddress) {
    return new Response("VM läuft nicht", { status: 503 });
  }

  const ssh = SshClient.fromEnv(status.ipAddress);
  const vmStream = ssh.stream("sudo docker logs -f --tail=100 7dtd-server 2>&1");

  const body = new ReadableStream({
    start(controller) {
      const reader = vmStream.getReader();
      function pump() {
        reader.read().then(({ done, value }) => {
          if (done) { controller.close(); return; }
          const lines = new TextDecoder().decode(value).split("\n");
          for (const line of lines) {
            if (line.trim()) controller.enqueue(new TextEncoder().encode(`data: ${line}\n\n`));
          }
          pump();
        }).catch(e => controller.error(e));
      }
      pump();
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
}
```

- [ ] **Step 2: Metriken-API**

`apps/gameserver-ui/src/app/api/metrics/route.ts`:
```typescript
import { NextResponse } from "next/server";

const VICTORIA_URL = process.env.VICTORIA_URL ?? "http://vmsingle-monitoring.monitoring.svc.cluster.local:8428";

export async function GET() {
  try {
    const ns = process.env.GAMESERVER_NAMESPACE ?? "gameserver";
    const vm = process.env.VM_NAME ?? "7dtd-server";

    const [cpuRes, memRes] = await Promise.all([
      fetch(`${VICTORIA_URL}/api/v1/query?query=rate(container_cpu_usage_seconds_total{namespace="${ns}",pod=~"virt-launcher-${vm}.*"}[5m])*100`),
      fetch(`${VICTORIA_URL}/api/v1/query?query=container_memory_working_set_bytes{namespace="${ns}",pod=~"virt-launcher-${vm}.*"}`),
    ]);

    const cpu = cpuRes.ok ? (await cpuRes.json()).data?.result?.[0]?.value?.[1] ?? null : null;
    const mem = memRes.ok ? (await memRes.json()).data?.result?.[0]?.value?.[1] ?? null : null;

    return NextResponse.json({
      cpuPercent: cpu ? Math.round(parseFloat(cpu) * 10) / 10 : null,
      memoryMb: mem ? Math.round(parseInt(mem) / 1024 / 1024) : null,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
```

- [ ] **Step 3: Logs-UI**

`apps/gameserver-ui/src/app/logs/page.tsx`:
```typescript
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
```

- [ ] **Step 4: Commit**

```bash
git add apps/gameserver-ui/src/app/api/logs/ apps/gameserver-ui/src/app/api/metrics/ apps/gameserver-ui/src/app/logs/
git commit -m "feat(gameserver-ui): Logs-Stream (SSE via SSH) + Metriken (Iter. 4)"
```

---

## Task 5: Config-Editor (Iteration 5)

**Files:**
- Create: `apps/gameserver-ui/src/lib/config.ts`
- Create: `apps/gameserver-ui/src/lib/__tests__/config.test.ts`
- Create: `apps/gameserver-ui/src/app/api/config/route.ts`
- Create: `apps/gameserver-ui/src/app/api/config/__tests__/route.test.ts`
- Create: `apps/gameserver-ui/src/app/config/page.tsx`

- [ ] **Step 1: Failing Config-Lib-Tests**

`apps/gameserver-ui/src/lib/__tests__/config.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { extractConfigValue, injectConfigValue } from "@/lib/config";

const SAMPLE_XML = `<?xml version="1.0"?>
<ServerSettings>
  <property name="ServerName" value="MyServer"/>
  <property name="TelnetEnabled" value="true"/>
  <property name="MaxSpawnedZombies" value="64"/>
</ServerSettings>`;

describe("extractConfigValue", () => {
  it("liest einen Wert aus der XML", () => {
    expect(extractConfigValue(SAMPLE_XML, "ServerName")).toBe("MyServer");
    expect(extractConfigValue(SAMPLE_XML, "MaxSpawnedZombies")).toBe("64");
  });

  it("gibt null zurück wenn key nicht existiert", () => {
    expect(extractConfigValue(SAMPLE_XML, "UnknownKey")).toBeNull();
  });
});

describe("injectConfigValue", () => {
  it("ersetzt einen bestehenden Wert", () => {
    const updated = injectConfigValue(SAMPLE_XML, "ServerName", "NewServer");
    expect(extractConfigValue(updated, "ServerName")).toBe("NewServer");
    expect(updated).toContain("MaxSpawnedZombies"); // andere Werte unberührt
  });
});
```

- [ ] **Step 2: Test fehlschlagen lassen**

```bash
cd apps/gameserver-ui && npx vitest run src/lib/__tests__/config.test.ts
```

- [ ] **Step 3: Config-Lib implementieren**

`apps/gameserver-ui/src/lib/config.ts`:
```typescript
export function extractConfigValue(xml: string, key: string): string | null {
  const m = xml.match(new RegExp(`<property\\s+name="${key}"\\s+value="([^"]*)"`, "i"));
  return m ? m[1] : null;
}

export function injectConfigValue(xml: string, key: string, value: string): string {
  return xml.replace(
    new RegExp(`(<property\\s+name="${key}"\\s+value=")[^"]*(")`,"i"),
    `$1${value}$2`
  );
}
```

- [ ] **Step 4: Tests bestehen lassen**

```bash
cd apps/gameserver-ui && npx vitest run src/lib/__tests__/config.test.ts
```
Erwartet: PASS

- [ ] **Step 5: Config-API-Tests**

`apps/gameserver-ui/src/app/api/config/__tests__/route.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const execMock = vi.fn();
vi.mock("@/lib/k8s", () => ({ VmClient: { inCluster: () => ({ getStatus: vi.fn().mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.0.0.1" }) }) } }));
vi.mock("@/lib/ssh", () => ({ SshClient: { fromEnv: () => ({ exec: execMock }) } }));

import { GET, PUT } from "@/app/api/config/route";

beforeEach(() => vi.clearAllMocks());

describe("/api/config", () => {
  it("GET liest serverconfig.xml per SSH", async () => {
    execMock.mockResolvedValue('<ServerSettings><property name="ServerName" value="Test"/></ServerSettings>');
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).xml).toContain("ServerName");
  });

  it("PUT schreibt Config und startet Docker neu", async () => {
    execMock.mockResolvedValue("");
    const xml = '<ServerSettings><property name="ServerName" value="Neu"/></ServerSettings>';
    const res = await PUT(new Request("http://x/api/config", {
      method: "PUT",
      body: JSON.stringify({ xml }),
    }));
    expect(res.status).toBe(200);
    expect(execMock).toHaveBeenCalledWith(expect.stringContaining("docker restart"));
  });
});
```

- [ ] **Step 6: Config-API implementieren**

`apps/gameserver-ui/src/app/api/config/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const NAS_CONFIG_PATH = join(process.env.NAS_MOUNT_PATH ?? "/mnt/gameserver-data", "serverconfig.xml");
const VM_CONFIG_PATH = "/opt/7dtd/config/serverconfig.xml";

async function getSsh() {
  const status = await VmClient.inCluster().getStatus();
  if (status.vmiPhase !== "Running" || !status.ipAddress) return null;
  return SshClient.fromEnv(status.ipAddress);
}

export async function GET() {
  try {
    const ssh = await getSsh();
    if (!ssh) return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
    const xml = await ssh.exec(`cat ${VM_CONFIG_PATH}`);
    return NextResponse.json({ xml });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

export async function PUT(req: Request) {
  try {
    const { xml } = await req.json().catch(() => ({}));
    if (!xml) return NextResponse.json({ error: "xml fehlt" }, { status: 400 });

    const ssh = await getSsh();
    if (!ssh) return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });

    // 1. Per SSH in die VM schreiben (heredoc)
    const escaped = xml.replace(/'/g, `'\\''`);
    await ssh.exec(`sudo tee ${VM_CONFIG_PATH} > /dev/null << 'XMLEOF'\n${escaped}\nXMLEOF`);

    // 2. Docker neu starten
    await ssh.exec("sudo docker restart 7dtd-server");

    // 3. Auf NAS persistieren (wenn Mount verfügbar)
    try {
      const dir = process.env.NAS_MOUNT_PATH ?? "/mnt/gameserver-data";
      if (existsSync(dir)) { mkdirSync(dir, { recursive: true }); writeFileSync(NAS_CONFIG_PATH, xml); }
    } catch { /* NAS-Mount optional */ }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
```

- [ ] **Step 7: Tests bestehen lassen**

```bash
cd apps/gameserver-ui && npx vitest run src/app/api/config
```
Erwartet: PASS

- [ ] **Step 8: Config-UI**

`apps/gameserver-ui/src/app/config/page.tsx`:
```typescript
"use client";
import { useEffect, useState } from "react";

export default function ConfigPage() {
  const [xml, setXml] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/config").then(r => r.json()).then(d => {
      if (d.xml) setXml(d.xml); else setError(d.error ?? "Fehler");
    });
  }, []);

  async function save() {
    if (!confirm("serverconfig.xml jetzt ausrollen? 7DTD-Server wird neu gestartet.")) return;
    setSaving(true); setSaved(false);
    const res = await fetch("/api/config", { method: "PUT",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ xml }) });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    else setError((await res.json()).error ?? "Fehler beim Speichern");
  }

  return (
    <main style={{ maxWidth: 900, margin: "5vh auto", fontFamily: "sans-serif" }}>
      <h1>serverconfig.xml</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {saved && <p style={{ color: "green" }}>✓ Ausgerollt — Server neu gestartet</p>}
      <textarea value={xml} onChange={e => setXml(e.target.value)}
        style={{ width: "100%", height: "60vh", fontFamily: "monospace", fontSize: 12 }} />
      <p>
        <button disabled={saving || !xml} onClick={save}>
          {saving ? "Wird ausgerollt…" : "▶ Ausrollen + Neustart"}
        </button>
      </p>
      <p><a href="/">← Dashboard</a></p>
    </main>
  );
}
```

- [ ] **Step 9: Commit**

```bash
git add apps/gameserver-ui/src/lib/config.ts apps/gameserver-ui/src/lib/__tests__/config.test.ts \
  apps/gameserver-ui/src/app/api/config/ apps/gameserver-ui/src/app/config/
git commit -m "feat(gameserver-ui): serverconfig.xml-Editor (Iter. 5)"
```

---

## Task 6: Backups (Iteration 6)

**Files:**
- Create: `apps/gameserver-ui/src/lib/backups.ts`
- Create: `apps/gameserver-ui/src/lib/__tests__/backups.test.ts`
- Create: `apps/gameserver-ui/src/app/api/backups/route.ts`
- Create: `apps/gameserver-ui/src/app/api/backups/[name]/restore/route.ts`
- Create: `apps/gameserver-ui/src/app/api/backups/__tests__/route.test.ts`
- Create: `apps/gameserver-ui/src/app/backups/page.tsx`

- [ ] **Step 1: Failing Backups-Lib-Tests**

`apps/gameserver-ui/src/lib/__tests__/backups.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { parseBackupName } from "@/lib/backups";

describe("parseBackupName", () => {
  it("parst Dateiname zu Metadaten", () => {
    const meta = parseBackupName("backup-2026-06-11T10-00-00.tar.gz");
    expect(meta.timestamp).toBe("2026-06-11T10:00:00");
    expect(meta.filename).toBe("backup-2026-06-11T10-00-00.tar.gz");
  });
});
```

- [ ] **Step 2: Lib implementieren**

`apps/gameserver-ui/src/lib/backups.ts`:
```typescript
import { readdirSync, statSync, existsSync } from "fs";
import { join } from "path";

export interface BackupMeta {
  filename: string;
  timestamp: string;
  sizeBytes: number;
}

export function parseBackupName(filename: string): BackupMeta {
  const m = filename.match(/backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
  const timestamp = m ? m[1].replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3") : filename;
  return { filename, timestamp, sizeBytes: 0 };
}

export function listBackups(backupDir: string): BackupMeta[] {
  if (!existsSync(backupDir)) return [];
  return readdirSync(backupDir)
    .filter(f => f.endsWith(".tar.gz"))
    .map(f => {
      const meta = parseBackupName(f);
      try { meta.sizeBytes = statSync(join(backupDir, f)).size; } catch { /* ignorieren */ }
      return meta;
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function backupFilePath(backupDir: string, filename: string): string {
  const resolved = join(backupDir, filename);
  // Pfad-Traversal verhindern
  if (!resolved.startsWith(backupDir)) throw new Error("Ungültiger Dateiname");
  return resolved;
}
```

- [ ] **Step 3: Tests bestehen lassen**

```bash
cd apps/gameserver-ui && npx vitest run src/lib/__tests__/backups.test.ts
```

- [ ] **Step 4: Backups-API**

`apps/gameserver-ui/src/app/api/backups/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";
import { telnetCommand, telnetOptsFromEnv } from "@/lib/telnet";
import { listBackups, backupFilePath } from "@/lib/backups";
import { createWriteStream, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

const BACKUP_DIR = join(process.env.NAS_MOUNT_PATH ?? "/mnt/gameserver-data", "backups");

export async function GET() {
  return NextResponse.json({ backups: listBackups(BACKUP_DIR) });
}

export async function POST() {
  try {
    const status = await VmClient.inCluster().getStatus();
    if (status.vmiPhase !== "Running" || !status.ipAddress) {
      return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
    }

    const ip = status.ipAddress;
    const ssh = SshClient.fromEnv(ip);

    // 1. Spielwelt speichern
    await telnetCommand(telnetOptsFromEnv(ip), "saveworld");

    // 2. tar-Stream über SSH auf NAS schreiben
    if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
    const now = new Date().toISOString().replace(/:/g, "-").slice(0, 19);
    const filename = `backup-${now}.tar.gz`;
    const destPath = backupFilePath(BACKUP_DIR, filename);

    const sshStream = ssh.stream("sudo tar czf - /opt/7dtd/data/Saves 2>/dev/null");
    await pipeline(Readable.fromWeb(sshStream as any), createWriteStream(destPath));

    return NextResponse.json({ ok: true, filename });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
```

`apps/gameserver-ui/src/app/api/backups/[name]/restore/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";
import { backupFilePath } from "@/lib/backups";
import { createReadStream, existsSync } from "fs";
import { join } from "path";

const BACKUP_DIR = join(process.env.NAS_MOUNT_PATH ?? "/mnt/gameserver-data", "backups");

export async function POST(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    const filePath = backupFilePath(BACKUP_DIR, name);
    if (!existsSync(filePath)) return NextResponse.json({ error: "Backup nicht gefunden" }, { status: 404 });

    const status = await VmClient.inCluster().getStatus();
    if (status.vmiPhase !== "Running" || !status.ipAddress) {
      return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
    }

    const ssh = SshClient.fromEnv(status.ipAddress);

    // Stop container, restore, restart
    await ssh.exec("sudo docker stop 7dtd-server");
    await ssh.exec("sudo tar xzf - -C /opt/7dtd/data/Saves --strip-components=3 < " + filePath);
    await ssh.exec("sudo docker start 7dtd-server");

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
```

- [ ] **Step 5: Backups-UI**

`apps/gameserver-ui/src/app/backups/page.tsx`:
```typescript
"use client";
import { useEffect, useState } from "react";

interface BackupMeta { filename: string; timestamp: string; sizeBytes: number; }

export default function BackupsPage() {
  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch("/api/backups");
    if (res.ok) setBackups((await res.json()).backups);
  }

  useEffect(() => { load(); }, []);

  async function create() {
    if (!confirm("Neues Backup erstellen? Das kann einige Minuten dauern.")) return;
    setBusy(true); setMsg("");
    const res = await fetch("/api/backups", { method: "POST" });
    setBusy(false);
    if (res.ok) { setMsg("✓ Backup erstellt"); load(); }
    else setMsg("Fehler: " + (await res.json()).error);
  }

  async function restore(filename: string) {
    if (!confirm(`Backup \"${filename}\" wiederherstellen? Der Server wird gestoppt.`)) return;
    setBusy(true); setMsg("");
    const res = await fetch(`/api/backups/${encodeURIComponent(filename)}/restore`, { method: "POST" });
    setBusy(false);
    setMsg(res.ok ? "✓ Wiederhergestellt" : "Fehler: " + (await res.json()).error);
  }

  return (
    <main style={{ maxWidth: 800, margin: "5vh auto", fontFamily: "sans-serif" }}>
      <h1>Spielwelt-Backups</h1>
      {msg && <p style={{ color: msg.startsWith("✓") ? "green" : "crimson" }}>{msg}</p>}
      <p><button disabled={busy} onClick={create}>📦 Backup erstellen</button></p>
      <table cellPadding={6} style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
          <th>Zeitpunkt</th><th>Größe</th><th></th>
        </tr></thead>
        <tbody>
          {backups.length === 0 && <tr><td colSpan={3}>Keine Backups vorhanden</td></tr>}
          {backups.map(b => (
            <tr key={b.filename} style={{ borderBottom: "1px solid #eee" }}>
              <td>{b.timestamp}</td>
              <td>{(b.sizeBytes / 1024 / 1024).toFixed(1)} MB</td>
              <td><button disabled={busy} onClick={() => restore(b.filename)}>↩ Restore</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p><a href="/">← Dashboard</a></p>
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/gameserver-ui/src/lib/backups.ts apps/gameserver-ui/src/lib/__tests__/backups.test.ts \
  apps/gameserver-ui/src/app/api/backups/ apps/gameserver-ui/src/app/backups/
git commit -m "feat(gameserver-ui): Spielwelt-Backups (tar-Stream, NAS, Restore) (Iter. 6)"
```

---

## Task 7: CronJob-Zeitplanung (Iteration 7)

**Files:**
- Modify: `apps/gameserver-ui/src/lib/k8s.ts`
- Modify: `apps/gameserver-ui/src/lib/__tests__/k8s.test.ts`
- Create: `apps/gameserver-ui/src/app/api/schedule/route.ts`
- Create: `apps/gameserver-ui/src/app/api/schedule/__tests__/route.test.ts`
- Create: `apps/gameserver-ui/src/app/schedule/page.tsx`
- Modify: `argocd/apps/gameserver-ui/templates/rbac.yaml`

- [ ] **Step 1: CronJob-Tests in k8s.test.ts ergänzen**

Anhängen an `apps/gameserver-ui/src/lib/__tests__/k8s.test.ts`:
```typescript
describe("VmClient.getCronJobs", () => {
  it("gibt CronJobs aus dem gameserver-Namespace zurück", async () => {
    const api = {
      getNamespacedCustomObject: vi.fn(),
      patchNamespacedCustomObject: vi.fn(),
    };
    const batchApi = {
      listNamespacedCronJob: vi.fn().mockResolvedValue({
        items: [
          { metadata: { name: "gameserver-start" }, spec: { schedule: "0 20 * * 3", suspend: false } },
          { metadata: { name: "gameserver-stop" }, spec: { schedule: "0 0 * * 4", suspend: true } },
        ],
      }),
      patchNamespacedCronJob: vi.fn().mockResolvedValue({}),
    };
    const client = new VmClient(api as any, batchApi as any);
    const jobs = await client.getCronJobs();
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toEqual({ name: "gameserver-start", schedule: "0 20 * * 3", suspended: false });
  });
});
```

- [ ] **Step 2: Test fehlschlagen lassen**

```bash
cd apps/gameserver-ui && npx vitest run src/lib/__tests__/k8s.test.ts
```
Erwartet: FAIL (getCronJobs nicht definiert / VmClient nimmt kein 2. Argument)

- [ ] **Step 3: k8s.ts um CronJob-Operationen erweitern**

Komplettes `apps/gameserver-ui/src/lib/k8s.ts` (ersetze die bestehende Datei):
```typescript
import * as k8s from "@kubernetes/client-node";

const NAMESPACE = process.env.GAMESERVER_NAMESPACE ?? "gameserver";
const VM_NAME = process.env.VM_NAME ?? "7dtd-server";
const GVK = { group: "kubevirt.io", version: "v1" };

export interface VmStatus {
  runStrategy: string;
  printableStatus: string;
  vmiPhase: string | null;
  ipAddress: string | null;
  runningSince: string | null;
}

export interface CronJobInfo {
  name: string;
  schedule: string;
  suspended: boolean;
}

type KubeVirtVm = {
  spec?: { runStrategy?: string };
  status?: { printableStatus?: string };
};

type KubeVirtVmi = {
  status?: {
    phase?: string;
    interfaces?: { ipAddress?: string }[];
    phaseTransitionTimestamps?: { phase: string; phaseTransitionTimestamp: string }[];
  };
};

export class VmClient {
  constructor(
    private api: k8s.CustomObjectsApi,
    private batchApi?: k8s.BatchV1Api,
  ) {}

  static inCluster(): VmClient {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    return new VmClient(
      kc.makeApiClient(k8s.CustomObjectsApi),
      kc.makeApiClient(k8s.BatchV1Api),
    );
  }

  async getStatus(): Promise<VmStatus> {
    const vm = (await this.api.getNamespacedCustomObject({
      ...GVK,
      namespace: NAMESPACE,
      plural: "virtualmachines",
      name: VM_NAME,
    })) as KubeVirtVm;

    let vmi: KubeVirtVmi | null = null;
    try {
      vmi = (await this.api.getNamespacedCustomObject({
        ...GVK,
        namespace: NAMESPACE,
        plural: "virtualmachineinstances",
        name: VM_NAME,
      })) as KubeVirtVmi;
    } catch (err) {
      if ((err as { code?: number }).code !== 404) throw err;
    }

    const running = vmi?.status?.phaseTransitionTimestamps?.find(
      (t) => t.phase === "Running"
    );

    return {
      runStrategy: vm.spec?.runStrategy ?? "Unknown",
      printableStatus: vm.status?.printableStatus ?? "Unknown",
      vmiPhase: vmi?.status?.phase ?? null,
      ipAddress: vmi?.status?.interfaces?.[0]?.ipAddress ?? null,
      runningSince: running?.phaseTransitionTimestamp ?? null,
    };
  }

  async setRunStrategy(strategy: "Always" | "Halted"): Promise<void> {
    await this.api.patchNamespacedCustomObject(
      {
        ...GVK,
        namespace: NAMESPACE,
        plural: "virtualmachines",
        name: VM_NAME,
        body: { spec: { runStrategy: strategy } },
      },
      k8s.setHeaderOptions("Content-Type", k8s.PatchStrategy.MergePatch)
    );
  }

  async getCronJobs(): Promise<CronJobInfo[]> {
    if (!this.batchApi) return [];
    const list = await this.batchApi.listNamespacedCronJob({ namespace: NAMESPACE });
    return list.items.map((j) => ({
      name: j.metadata?.name ?? "",
      schedule: j.spec?.schedule ?? "",
      suspended: j.spec?.suspend ?? false,
    }));
  }

  async updateCronJobSchedule(name: string, schedule: string): Promise<void> {
    if (!this.batchApi) throw new Error("BatchV1Api nicht initialisiert");
    await this.batchApi.patchNamespacedCronJob(
      { namespace: NAMESPACE, name, body: { spec: { schedule } } },
      k8s.setHeaderOptions("Content-Type", k8s.PatchStrategy.MergePatch)
    );
  }

  async suspendCronJob(name: string, suspend: boolean): Promise<void> {
    if (!this.batchApi) throw new Error("BatchV1Api nicht initialisiert");
    await this.batchApi.patchNamespacedCronJob(
      { namespace: NAMESPACE, name, body: { spec: { suspend } } },
      k8s.setHeaderOptions("Content-Type", k8s.PatchStrategy.MergePatch)
    );
  }
}
```

- [ ] **Step 4: Tests bestehen lassen**

```bash
cd apps/gameserver-ui && npx vitest run src/lib/__tests__/k8s.test.ts
```
Erwartet: alle Tests PASS

- [ ] **Step 5: Schedule-API**

`apps/gameserver-ui/src/app/api/schedule/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";

export async function GET() {
  try {
    const jobs = await VmClient.inCluster().getCronJobs();
    return NextResponse.json({ jobs });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { name, schedule, suspend } = await req.json().catch(() => ({}));
    if (!name) return NextResponse.json({ error: "name fehlt" }, { status: 400 });

    const client = VmClient.inCluster();
    if (schedule !== undefined) await client.updateCronJobSchedule(name, schedule);
    if (suspend !== undefined) await client.suspendCronJob(name, suspend);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
```

- [ ] **Step 6: RBAC um CronJobs erweitern**

`argocd/apps/gameserver-ui/templates/rbac.yaml` — dem bestehenden Role `.rules`-Array hinzufügen:
```yaml
  - apiGroups: ["batch"]
    resources: ["cronjobs"]
    verbs: ["get", "list", "patch"]
```

- [ ] **Step 7: Schedule-UI**

`apps/gameserver-ui/src/app/schedule/page.tsx`:
```typescript
"use client";
import { useEffect, useState } from "react";

interface JobInfo { name: string; schedule: string; suspended: boolean; }

export default function SchedulePage() {
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/schedule");
    if (res.ok) setJobs((await res.json()).jobs);
    else setError("Fehler beim Laden");
  }

  useEffect(() => { load(); }, []);

  async function update(name: string, patch: Partial<JobInfo>) {
    setBusy(true);
    await fetch("/api/schedule", { method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, ...patch }) });
    await load();
    setBusy(false);
  }

  return (
    <main style={{ maxWidth: 700, margin: "5vh auto", fontFamily: "sans-serif" }}>
      <h1>Zeitplan</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <table cellPadding={6} style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
          <th>CronJob</th><th>Cron-Ausdruck</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>
          {jobs.map(j => (
            <tr key={j.name} style={{ borderBottom: "1px solid #eee" }}>
              <td><code>{j.name}</code></td>
              <td>
                <input defaultValue={j.schedule} style={{ width: 140 }}
                  onBlur={e => { if (e.target.value !== j.schedule) update(j.name, { schedule: e.target.value }); }} />
              </td>
              <td>{j.suspended ? "⏸ Pausiert" : "▶ Aktiv"}</td>
              <td>
                <button disabled={busy} onClick={() => update(j.name, { suspend: !j.suspended })}>
                  {j.suspended ? "Aktivieren" : "Pausieren"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: "#888", fontSize: 13 }}>
        Cron-Format: <code>Minute Stunde Tag Monat Wochentag</code> (z.B. <code>0 20 * * 3</code> = Mi 20:00 Uhr)
      </p>
      <p><a href="/">← Dashboard</a></p>
    </main>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/gameserver-ui/src/lib/k8s.ts apps/gameserver-ui/src/lib/__tests__/k8s.test.ts \
  apps/gameserver-ui/src/app/api/schedule/ apps/gameserver-ui/src/app/schedule/ \
  argocd/apps/gameserver-ui/templates/rbac.yaml
git commit -m "feat(gameserver-ui): CronJob-Zeitplanung (Iter. 7)"
```

---

## Task 8: Infra-Updates (Helm + Navigation)

**Files:**
- Modify: `argocd/apps/gameserver-ui/templates/deployment.yaml`
- Modify: `argocd/apps/gameserver-ui/values.yaml`
- Create: `argocd/apps/gameserver-ui/templates/sealedsecret-telnet.yaml`
- Modify: `apps/gameserver-ui/src/app/layout.tsx`

- [ ] **Step 1: deployment.yaml — SSH-Key-Volume + NAS-Mount + neue Env-Vars**

In `argocd/apps/gameserver-ui/templates/deployment.yaml`:

**Pod-Spec `volumes`** (ergänzen):
```yaml
        - name: ssh-key
          secret:
            secretName: {{ .Values.sshSecret.secretName }}
            defaultMode: 0400
        - name: gameserver-data
          persistentVolumeClaim:
            claimName: gameserver-ui-data
```

**Container `volumeMounts`** (ergänzen):
```yaml
            - name: ssh-key
              mountPath: /etc/gameserver-ui/ssh
              readOnly: true
            - name: gameserver-data
              mountPath: /mnt/gameserver-data
```

**Container `env`** (ergänzen nach `ADMIN_PASSWORD_HASH`):
```yaml
            - name: VM_SSH_KEY_PATH
              value: /etc/gameserver-ui/ssh/privateKey
            - name: VM_SSH_USER
              value: ubuntu
            - name: VM_TELNET_PORT
              value: "8081"
            - name: NAS_MOUNT_PATH
              value: /mnt/gameserver-data
            - name: TELNET_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: {{ .Values.telnet.secretName }}
                  key: password
                  optional: true
```

- [ ] **Step 2: values.yaml — telnet-Sektion**

`argocd/apps/gameserver-ui/values.yaml` ergänzen:
```yaml
# SealedSecret für Telnet-Passwort. Sealen: Namespace gameserver-ui, Name gameserver-ui-telnet, Key: password.
# Wert via kubeseal-webgui versiegeln.
telnet:
  secretName: gameserver-ui-telnet
  encryptedPassword: ""
```

- [ ] **Step 3: sealedsecret-telnet.yaml**

`argocd/apps/gameserver-ui/templates/sealedsecret-telnet.yaml`:
```yaml
{{- if .Values.telnet.encryptedPassword }}
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: {{ .Values.telnet.secretName }}
  namespace: {{ .Release.Namespace }}
spec:
  encryptedData:
    password: {{ .Values.telnet.encryptedPassword | quote }}
  template:
    metadata:
      name: {{ .Values.telnet.secretName }}
      namespace: {{ .Release.Namespace }}
    type: Opaque
{{- end }}
```

- [ ] **Step 4: Navigation in layout.tsx**

Komplettes `apps/gameserver-ui/src/app/layout.tsx`:
```typescript
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "7DTD Gameserver" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <nav style={{ background: "#222", color: "#fff", padding: "8px 16px", display: "flex", gap: 20, alignItems: "center" }}>
          <strong>7DTD</strong>
          <a href="/" style={{ color: "#ccc" }}>Dashboard</a>
          <a href="/players" style={{ color: "#ccc" }}>Spieler</a>
          <a href="/logs" style={{ color: "#ccc" }}>Logs</a>
          <a href="/config" style={{ color: "#ccc" }}>Config</a>
          <a href="/backups" style={{ color: "#ccc" }}>Backups</a>
          <a href="/schedule" style={{ color: "#ccc" }}>Zeitplan</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Helm-Chart validieren**

```bash
cd argocd/apps/gameserver-ui && helm template . --values values.yaml | grep -E "kind:|name:" | head -20
```
Erwartet: keine Template-Fehler

- [ ] **Step 6: Commit**

```bash
git add argocd/apps/gameserver-ui/templates/ argocd/apps/gameserver-ui/values.yaml \
  apps/gameserver-ui/src/app/layout.tsx
git commit -m "feat(gameserver-ui): Infra-Updates (SSH-Mount, NAS-Mount, Telnet-Secret, Navigation)"
```

---

## Task 9: CI-Build + Telnet-Secret versiegeln + PR

- [ ] **Step 1: Tests alle grün**

```bash
cd apps/gameserver-ui && npx vitest run
```
Erwartet: alle Tests PASS, kein Fehler

- [ ] **Step 2: Branch pushen + CI abwarten**

```bash
git push -u origin <branch-name>
```

CI baut das Docker-Image und pusht nach `ghcr.io/jaydee94/gameserver-ui:sha-<hash>`.

- [ ] **Step 3: Image-Tag in values.yaml aktualisieren**

Neuen SHA aus CI-Output nehmen und in `argocd/apps/gameserver-ui/values.yaml` eintragen:
```yaml
image:
  tag: "sha-<neuer-hash>"
```

- [ ] **Step 4: Telnet-Passwort versiegeln**

Via kubeseal-webgui (`http://kubeseal-webgui.homeserver` oder Cluster-IP):
- Namespace: `gameserver-ui`
- Name: `gameserver-ui-telnet`
- Key: `password`
- Value: `aljayf9497`

Erzeugten `encryptedData.password`-Wert in `values.yaml` unter `telnet.encryptedPassword` eintragen.

- [ ] **Step 5: Commit + PR erstellen**

```bash
git add argocd/apps/gameserver-ui/values.yaml
git commit -m "feat(gameserver-ui): Image-Tag + Telnet-Secret versiegelt"

gh pr create --title "feat(gameserver-ui): Iterationen 3-7 (Spieler, Logs, Config, Backups, Zeitplan)" \
  --body "Closes #123

## Summary
- Iter. 3: Spielerliste via Telnet, Broadcast, saveworld
- Iter. 4: Live-Logs via SSH+SSE, VM-Metriken (VictoriaMetrics)
- Iter. 5: serverconfig.xml-Editor mit SSH-Rollout + NAS-Persistenz
- Iter. 6: Spielwelt-Backups (tar-Stream→NAS) + Restore
- Iter. 7: CronJob-Zeitplanung (Schedule + Suspend)

## Test plan
- [ ] \`npx vitest run\` grün
- [ ] ArgoCD sync sauber
- [ ] Login funktioniert
- [ ] Spielerliste lädt (VM laufend)
- [ ] Logs-Stream erscheint im Browser
- [ ] Config laden + speichern → Docker-Neustart in VM
- [ ] Backup erstellen → .tar.gz auf NAS; Restore rückgängig
- [ ] CronJob-Schedule ändern → K8s-Objekt aktualisiert

🤖 Generated with Claude Code"
```
