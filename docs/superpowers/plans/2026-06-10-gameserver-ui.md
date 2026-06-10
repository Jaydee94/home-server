# Gameserver-UI Implementation Plan — Phase 1 (Gerüst, Login, VM-Steuerung)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploybare Next.js-Weboberfläche (`gameserver.homeserver`) mit Login, die die 7DTD-KubeVirt-VM anzeigt und startet/stoppt.

**Architecture:** Next.js (App Router, TypeScript) in einem Container; Backend-Routen sprechen die Kubernetes-API über einen ServiceAccount (RBAC auf Namespace `gameserver`). Deployment als ArgoCD-App `argocd/apps/gameserver-ui/` (eigenes Helm-Chart), Image-Build via GitHub Actions → ghcr.io. Login: Single-Admin, iron-session-Cookie, bcrypt-Hash aus SealedSecret.

**Tech Stack:** Next.js 15, TypeScript, vitest, iron-session, bcryptjs, @kubernetes/client-node, Helm, GitHub Actions, Sealed Secrets.

**Spec:** `docs/superpowers/specs/2026-06-10-gameserver-ui-design.md` · **Issue:** #123

**Scope-Hinweis:** Iterationen 3–7 (Telnet/Spieler, Logs/Monitoring, Config-Editor, Backups, Zeitplan) folgen als eigene Plan-Dokumente. SSH-Key + NAS-PV (#122) werden erst dort benötigt — der NAS-Mount nutzt das vorhandene csi-driver-smb-Muster von Jellyfin (`argocd/apps/jellyfin/templates/media-pv.yaml`), **kein Ansible nötig**.

---

## File Structure

```
apps/gameserver-ui/                  ← Quellcode (neu, erste In-Repo-App)
  package.json, next.config.ts, tsconfig.json, vitest.config.ts
  src/middleware.ts                  ← Session-Guard für alle Routen
  src/lib/session.ts                 ← iron-session Konfiguration
  src/lib/k8s.ts                     ← VM/VMI-Operationen (injizierbarer Client)
  src/app/login/page.tsx             ← Login-Formular
  src/app/api/login/route.ts         ← POST Login / DELETE Logout
  src/app/api/vm/route.ts            ← GET Status / POST start|stop
  src/app/page.tsx                   ← Dashboard (Status + Start/Stop)
  src/lib/__tests__/k8s.test.ts
  src/app/api/__tests__/login.test.ts
  Dockerfile
.github/workflows/gameserver-ui.yml  ← Image-Build → ghcr.io
argocd/apps/gameserver-ui/           ← Helm-Chart (Deployment, RBAC, Ingress, SealedSecret)
```

---

### Task 1: Next.js-Projekt + vitest aufsetzen

**Files:**
- Create: `apps/gameserver-ui/` (Scaffold)
- Create: `apps/gameserver-ui/vitest.config.ts`

- [ ] **Step 1: Scaffold erzeugen**

```bash
cd /home/jaydee/git/home-server
npx create-next-app@latest apps/gameserver-ui \
  --typescript --app --src-dir --no-tailwind --eslint \
  --no-import-alias --use-npm --skip-install
cd apps/gameserver-ui && npm install
```

- [ ] **Step 2: Test-Dependencies installieren**

```bash
cd apps/gameserver-ui
npm install -D vitest @vitest/coverage-v8
npm install iron-session bcryptjs @kubernetes/client-node
npm install -D @types/bcryptjs
```

- [ ] **Step 3: vitest.config.ts anlegen**

```ts
// apps/gameserver-ui/vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

In `package.json` scripts ergänzen: `"test": "vitest run"`.

- [ ] **Step 4: Smoke-Test — `npm run test` läuft (0 Tests, exit 0 mit `--passWithNoTests`)**

Script anpassen: `"test": "vitest run --passWithNoTests"`. Run: `npm run test` → Expected: exit 0.

- [ ] **Step 5: next.config.ts auf standalone stellen**

```ts
// apps/gameserver-ui/next.config.ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = { output: "standalone" };
export default nextConfig;
```

- [ ] **Step 6: Build prüfen + committen**

```bash
cd apps/gameserver-ui && npm run build   # Expected: ✓ Compiled successfully
cd /home/jaydee/git/home-server
git add apps/gameserver-ui && git commit -m "feat(gameserver-ui): scaffold Next.js app with vitest"
```

(`apps/gameserver-ui/node_modules` ist durch create-next-apps eigenes `.gitignore` ausgeschlossen — prüfen mit `git status`.)

---

### Task 2: Login (iron-session + bcrypt)

**Files:**
- Create: `src/lib/session.ts`, `src/app/api/login/route.ts`, `src/app/login/page.tsx`, `src/middleware.ts`
- Test: `src/app/api/__tests__/login.test.ts`

Env-Kontrakt: `SESSION_SECRET` (≥32 Zeichen), `ADMIN_PASSWORD_HASH` (bcrypt).

- [ ] **Step 1: Failing Test für die Passwort-Prüfung schreiben**

```ts
// src/app/api/__tests__/login.test.ts
import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { verifyPassword } from "@/lib/session";

describe("verifyPassword", () => {
  it("akzeptiert das korrekte Passwort", async () => {
    const hash = await bcrypt.hash("geheim", 10);
    expect(await verifyPassword("geheim", hash)).toBe(true);
  });
  it("lehnt ein falsches Passwort ab", async () => {
    const hash = await bcrypt.hash("geheim", 10);
    expect(await verifyPassword("falsch", hash)).toBe(false);
  });
  it("lehnt ab wenn kein Hash konfiguriert ist", async () => {
    expect(await verifyPassword("geheim", "")).toBe(false);
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm run test` → Expected: FAIL (`verifyPassword` existiert nicht).

- [ ] **Step 3: session.ts implementieren**

```ts
// src/lib/session.ts
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

export interface SessionData { loggedIn?: boolean }

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? "dev-only-secret-change-me-32chars!!",
  cookieName: "gameserver-ui",
  cookieOptions: { httpOnly: true, sameSite: "lax", secure: false },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}
```

(`secure: false` weil die UI wie alle anderen Dashboards über plain HTTP im LAN/Tailnet läuft.)

- [ ] **Step 4: Test ausführen — muss bestehen**

Run: `npm run test` → Expected: 3 passed.

- [ ] **Step 5: Login-API-Route**

```ts
// src/app/api/login/route.ts
import { NextResponse } from "next/server";
import { getSession, verifyPassword } from "@/lib/session";

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({}));
  if (!(await verifyPassword(password ?? "", process.env.ADMIN_PASSWORD_HASH ?? ""))) {
    return NextResponse.json({ error: "Falsches Passwort" }, { status: 401 });
  }
  const session = await getSession();
  session.loggedIn = true;
  await session.save();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Middleware-Guard**

```ts
// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  if (!session.loggedIn) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return res;
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 7: Login-Seite**

```tsx
// src/app/login/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) router.push("/");
    else setError("Falsches Passwort");
  }

  return (
    <main style={{ maxWidth: 320, margin: "20vh auto", fontFamily: "sans-serif" }}>
      <h1>7DTD Gameserver</h1>
      <form onSubmit={submit}>
        <input type="password" value={password} placeholder="Passwort"
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: 8 }} autoFocus />
        <button type="submit" style={{ width: "100%", padding: 8, marginTop: 8 }}>
          Anmelden
        </button>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}
```

- [ ] **Step 8: Manuell verifizieren + committen**

```bash
cd apps/gameserver-ui
ADMIN_PASSWORD_HASH=$(node -e 'console.log(require("bcryptjs").hashSync("test",10))') npm run dev
# Browser http://localhost:3000 → Redirect auf /login → "test" → Dashboard (Default-Page)
git add -A && git commit -m "feat(gameserver-ui): single-admin login with iron-session"
```

---

### Task 3: K8s-Lib — VM-Status lesen, Start/Stop

**Files:**
- Create: `src/lib/k8s.ts`
- Test: `src/lib/__tests__/k8s.test.ts`

Designentscheidung: `VmClient` bekommt das API-Objekt injiziert (Default: in-cluster `CustomObjectsApi`) — Tests mocken nur die Systemgrenze.

- [ ] **Step 1: Failing Tests schreiben**

```ts
// src/lib/__tests__/k8s.test.ts
import { describe, it, expect, vi } from "vitest";
import { VmClient } from "@/lib/k8s";

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    getNamespacedCustomObject: vi.fn(),
    patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

describe("VmClient.getStatus", () => {
  it("liefert runStrategy, printableStatus und VMI-Phase wenn die VM läuft", async () => {
    const api = fakeApi({
      getNamespacedCustomObject: vi.fn()
        .mockResolvedValueOnce({ spec: { runStrategy: "Always" }, status: { printableStatus: "Running" } })
        .mockResolvedValueOnce({
          status: { phase: "Running", interfaces: [{ ipAddress: "10.42.0.99" }],
            phaseTransitionTimestamps: [{ phase: "Running", phaseTransitionTimestamp: "2026-06-10T18:00:00Z" }] },
        }),
    });
    const c = new VmClient(api as never);
    const s = await c.getStatus();
    expect(s).toEqual({
      runStrategy: "Always", printableStatus: "Running",
      vmiPhase: "Running", ipAddress: "10.42.0.99",
      runningSince: "2026-06-10T18:00:00Z",
    });
  });

  it("liefert vmiPhase=null wenn keine VMI existiert (404)", async () => {
    const api = fakeApi({
      getNamespacedCustomObject: vi.fn()
        .mockResolvedValueOnce({ spec: { runStrategy: "Halted" }, status: { printableStatus: "Stopped" } })
        .mockRejectedValueOnce(Object.assign(new Error("not found"), { code: 404 })),
    });
    const c = new VmClient(api as never);
    const s = await c.getStatus();
    expect(s.vmiPhase).toBeNull();
    expect(s.runStrategy).toBe("Halted");
  });
});

describe("VmClient.setRunStrategy", () => {
  it("patcht die VM mit merge-patch", async () => {
    const api = fakeApi();
    const c = new VmClient(api as never);
    await c.setRunStrategy("Always");
    expect(api.patchNamespacedCustomObject).toHaveBeenCalledWith(
      expect.objectContaining({
        group: "kubevirt.io", version: "v1", namespace: "gameserver",
        plural: "virtualmachines", name: "7dtd-server",
        body: { spec: { runStrategy: "Always" } },
      })
    );
  });
});
```

- [ ] **Step 2: Tests ausführen — FAIL** (`VmClient` existiert nicht)

- [ ] **Step 3: k8s.ts implementieren**

```ts
// src/lib/k8s.ts
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
  constructor(private api: k8s.CustomObjectsApi) {}

  static inCluster(): VmClient {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    return new VmClient(kc.makeApiClient(k8s.CustomObjectsApi));
  }

  async getStatus(): Promise<VmStatus> {
    const vm = (await this.api.getNamespacedCustomObject({
      ...GVK, namespace: NAMESPACE, plural: "virtualmachines", name: VM_NAME,
    })) as KubeVirtVm;

    let vmi: KubeVirtVmi | null = null;
    try {
      vmi = (await this.api.getNamespacedCustomObject({
        ...GVK, namespace: NAMESPACE, plural: "virtualmachineinstances", name: VM_NAME,
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
    await this.api.patchNamespacedCustomObject({
      ...GVK, namespace: NAMESPACE, plural: "virtualmachines", name: VM_NAME,
      body: { spec: { runStrategy: strategy } },
    });
  }
}
```

> `@kubernetes/client-node` ≥ 1.0 nutzt Objekt-Parameter und setzt den
> Content-Type für merge-patch automatisch wenn `body` ein Plain-Object ist.
> Bei Problemen: Doku via context7 (`/kubernetes-client/javascript`) prüfen.

- [ ] **Step 4: Tests ausführen — PASS** (`npm run test` → alle grün)

- [ ] **Step 5: Commit**

```bash
git add src/lib/k8s.ts src/lib/__tests__/k8s.test.ts
git commit -m "feat(gameserver-ui): VmClient for KubeVirt status + runStrategy patch"
```

---

### Task 4: API-Route /api/vm

**Files:**
- Create: `src/app/api/vm/route.ts`
- Test: `src/app/api/__tests__/vm.test.ts`

- [ ] **Step 1: Failing Test**

```ts
// src/app/api/__tests__/vm.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getStatus = vi.fn();
const setRunStrategy = vi.fn();
vi.mock("@/lib/k8s", () => ({
  VmClient: { inCluster: () => ({ getStatus, setRunStrategy }) },
}));

import { GET, POST } from "@/app/api/vm/route";

beforeEach(() => vi.clearAllMocks());

describe("/api/vm", () => {
  it("GET liefert den VM-Status", async () => {
    getStatus.mockResolvedValue({ runStrategy: "Halted", vmiPhase: null });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ runStrategy: "Halted", vmiPhase: null });
  });

  it("POST start setzt runStrategy=Always", async () => {
    const res = await POST(new Request("http://x/api/vm", {
      method: "POST", body: JSON.stringify({ action: "start" }),
    }));
    expect(res.status).toBe(200);
    expect(setRunStrategy).toHaveBeenCalledWith("Always");
  });

  it("POST mit unbekannter Action → 400", async () => {
    const res = await POST(new Request("http://x/api/vm", {
      method: "POST", body: JSON.stringify({ action: "explode" }),
    }));
    expect(res.status).toBe(400);
    expect(setRunStrategy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Test ausführen — FAIL**

- [ ] **Step 3: Route implementieren**

```ts
// src/app/api/vm/route.ts
import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";

export async function GET() {
  try {
    return NextResponse.json(await VmClient.inCluster().getStatus());
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const { action } = await req.json().catch(() => ({}));
  if (action !== "start" && action !== "stop") {
    return NextResponse.json({ error: "action muss start|stop sein" }, { status: 400 });
  }
  try {
    await VmClient.inCluster().setRunStrategy(action === "start" ? "Always" : "Halted");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
```

- [ ] **Step 4: Tests — PASS, dann Commit** (`feat(gameserver-ui): /api/vm status + start/stop`)

---

### Task 5: Dashboard-Seite

**Files:**
- Modify: `src/app/page.tsx` (Scaffold-Inhalt ersetzen)

- [ ] **Step 1: Dashboard implementieren**

```tsx
// src/app/page.tsx
"use client";
import { useCallback, useEffect, useState } from "react";

interface VmStatus {
  runStrategy: string; printableStatus: string;
  vmiPhase: string | null; ipAddress: string | null; runningSince: string | null;
}

export default function Dashboard() {
  const [status, setStatus] = useState<VmStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/vm");
    if (res.ok) { setStatus(await res.json()); setError(""); }
    else setError(`Status nicht abrufbar (${res.status})`);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  async function act(action: "start" | "stop") {
    if (action === "stop" && !confirm("VM wirklich stoppen? Laufende Spielstände werden durch den Shutdown beendet.")) return;
    setBusy(true);
    await fetch("/api/vm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await refresh();
    setBusy(false);
  }

  const running = status?.vmiPhase === "Running";
  return (
    <main style={{ maxWidth: 640, margin: "5vh auto", fontFamily: "sans-serif" }}>
      <h1>7DTD Gameserver</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {!status ? <p>Lade…</p> : (
        <>
          <table cellPadding={6}>
            <tbody>
              <tr><td>Status</td><td><strong>{status.printableStatus}</strong> (VMI: {status.vmiPhase ?? "—"})</td></tr>
              <tr><td>runStrategy</td><td>{status.runStrategy}</td></tr>
              <tr><td>IP</td><td>{status.ipAddress ?? "—"}</td></tr>
              <tr><td>Läuft seit</td><td>{status.runningSince ? new Date(status.runningSince).toLocaleString("de-DE") : "—"}</td></tr>
            </tbody>
          </table>
          <p>
            <button disabled={busy || running} onClick={() => act("start")}>▶ Starten</button>{" "}
            <button disabled={busy || !running} onClick={() => act("stop")}>■ Stoppen</button>
          </p>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Build + Tests grün, Commit** (`npm run build && npm run test`, dann `feat(gameserver-ui): dashboard with VM status and start/stop`)

---

### Task 6: Dockerfile + GitHub-Actions-Build

**Files:**
- Create: `apps/gameserver-ui/Dockerfile`, `apps/gameserver-ui/.dockerignore`
- Create: `.github/workflows/gameserver-ui.yml`

- [ ] **Step 1: Dockerfile (multi-stage, standalone)**

```dockerfile
# apps/gameserver-ui/Dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
CMD ["node", "server.js"]
```

```
# apps/gameserver-ui/.dockerignore
node_modules
.next
```

- [ ] **Step 2: Lokal bauen und smoke-testen**

```bash
cd apps/gameserver-ui
docker build -t gameserver-ui:dev .
docker run --rm -p 3000:3000 \
  -e SESSION_SECRET=12345678901234567890123456789012 \
  -e ADMIN_PASSWORD_HASH='$2b$10$replace-with-real-hash' gameserver-ui:dev &
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/login   # Expected: 200
```

- [ ] **Step 3: Workflow anlegen** — Action-SHAs gemäß Repo-Policy pinnen. Die SHA für `actions/checkout` aus `.github/workflows/lint.yml` übernehmen; für die Docker-Actions aktuelle Release-SHAs ermitteln:

```bash
gh api repos/docker/login-action/tags --jq '.[0] | "\(.name) \(.commit.sha)"'
gh api repos/docker/build-push-action/tags --jq '.[0] | "\(.name) \(.commit.sha)"'
gh api repos/docker/metadata-action/tags --jq '.[0] | "\(.name) \(.commit.sha)"'
```

```yaml
# .github/workflows/gameserver-ui.yml
---
name: gameserver-ui
on:
  push:
    branches: [main]
    paths: ["apps/gameserver-ui/**", ".github/workflows/gameserver-ui.yml"]
  workflow_dispatch: {}

permissions:
  contents: read
  packages: write

jobs:
  test:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: apps/gameserver-ui } }
    steps:
      - uses: actions/checkout@<SHA-aus-lint.yml> # vX.Y.Z
      - uses: actions/setup-node@<SHA> # vX.Y.Z
        with: { node-version: 22, cache: npm, cache-dependency-path: apps/gameserver-ui/package-lock.json }
      - run: npm ci
      - run: npm run test
      - run: npm run build

  build-push:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<SHA-aus-lint.yml> # vX.Y.Z
      - uses: docker/login-action@<SHA> # vX.Y.Z
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@<SHA> # vX.Y.Z
        id: meta
        with:
          images: ghcr.io/jaydee94/gameserver-ui
          tags: |
            type=sha,format=short
            type=raw,value=latest
      - uses: docker/build-push-action@<SHA> # vX.Y.Z
        with:
          context: apps/gameserver-ui
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

- [ ] **Step 4: actionlint lokal laufen lassen** (falls installiert: `actionlint .github/workflows/gameserver-ui.yml`; sonst übernimmt es der Lint-CI-Job)

- [ ] **Step 5: Commit + Push, Workflow-Run prüfen**

```bash
git add apps/gameserver-ui/Dockerfile apps/gameserver-ui/.dockerignore .github/workflows/gameserver-ui.yml
git commit -m "ci(gameserver-ui): build and push image to ghcr.io"
git push
gh run watch $(gh run list --workflow=gameserver-ui --limit 1 --json databaseId -q '.[0].databaseId')
```

- [ ] **Step 6: ghcr-Package auf public stellen** (einmalig, sonst braucht k3s imagePullSecrets):
GitHub → Profil → Packages → `gameserver-ui` → Package settings → Change visibility → Public.

---

### Task 7: Helm-Chart `argocd/apps/gameserver-ui/`

**Files:**
- Create: `argocd/apps/gameserver-ui/Chart.yaml`, `values.yaml`,
  `templates/deployment.yaml`, `templates/service.yaml`, `templates/ingress.yaml`,
  `templates/rbac.yaml`, `templates/sealedsecret.yaml`

- [ ] **Step 1: Chart.yaml + values.yaml**

```yaml
# argocd/apps/gameserver-ui/Chart.yaml
---
apiVersion: v2
name: gameserver-ui
description: Web UI for managing the 7DTD KubeVirt gameserver.
type: application
version: 0.1.0
appVersion: "0.1.0"
```

```yaml
# argocd/apps/gameserver-ui/values.yaml
---
image:
  repository: ghcr.io/jaydee94/gameserver-ui
  # Nach jedem CI-Build auf den neuen sha-Tag pinnen (GitOps-reproduzierbar).
  tag: "latest"
  pullPolicy: Always

ingress:
  host: gameserver.homeserver

vm:
  namespace: gameserver
  name: 7dtd-server

# SealedSecret mit Login-Daten. Solange beide Werte leer sind, wird kein
# Secret gerendert und das Deployment referenziert es optional (Pod startet,
# Login schlägt fehl) — sealen gemäß docs/20-gameserver-ui.md.
sealedSecret:
  secretName: gameserver-ui-auth
  encryptedSessionSecret: ""
  encryptedAdminPasswordHash: ""
```

- [ ] **Step 2: Deployment + Service**

```yaml
# argocd/apps/gameserver-ui/templates/deployment.yaml
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gameserver-ui
  namespace: {{ .Release.Namespace }}
spec:
  replicas: 1
  selector:
    matchLabels: { app: gameserver-ui }
  template:
    metadata:
      labels: { app: gameserver-ui }
    spec:
      serviceAccountName: gameserver-ui
      containers:
        - name: gameserver-ui
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports: [{ containerPort: 3000 }]
          env:
            - name: GAMESERVER_NAMESPACE
              value: {{ .Values.vm.namespace | quote }}
            - name: VM_NAME
              value: {{ .Values.vm.name | quote }}
            - name: SESSION_SECRET
              valueFrom:
                secretKeyRef:
                  name: {{ .Values.sealedSecret.secretName }}
                  key: sessionSecret
                  optional: true
            - name: ADMIN_PASSWORD_HASH
              valueFrom:
                secretKeyRef:
                  name: {{ .Values.sealedSecret.secretName }}
                  key: adminPasswordHash
                  optional: true
          resources:
            requests: { cpu: 50m, memory: 128Mi }
            limits: { memory: 256Mi }
          readinessProbe:
            httpGet: { path: /login, port: 3000 }
            initialDelaySeconds: 5
```

```yaml
# argocd/apps/gameserver-ui/templates/service.yaml
---
apiVersion: v1
kind: Service
metadata:
  name: gameserver-ui
  namespace: {{ .Release.Namespace }}
spec:
  selector: { app: gameserver-ui }
  ports: [{ port: 80, targetPort: 3000 }]
```

- [ ] **Step 3: Ingress**

```yaml
# argocd/apps/gameserver-ui/templates/ingress.yaml
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: gameserver-ui
  namespace: {{ .Release.Namespace }}
spec:
  rules:
    - host: {{ .Values.ingress.host }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: gameserver-ui
                port: { number: 80 }
```

- [ ] **Step 4: RBAC** — SA im UI-Namespace, Role/RoleBinding **im Namespace `gameserver`** (Cross-Namespace, Muster wie CDI in CLAUDE.md beschrieben):

```yaml
# argocd/apps/gameserver-ui/templates/rbac.yaml
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: gameserver-ui
  namespace: {{ .Release.Namespace }}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: gameserver-ui
  namespace: {{ .Values.vm.namespace }}
rules:
  - apiGroups: ["kubevirt.io"]
    resources: ["virtualmachines"]
    verbs: ["get", "list", "patch"]
  - apiGroups: ["kubevirt.io"]
    resources: ["virtualmachineinstances"]
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: gameserver-ui
  namespace: {{ .Values.vm.namespace }}
subjects:
  - kind: ServiceAccount
    name: gameserver-ui
    namespace: {{ .Release.Namespace }}
roleRef:
  kind: Role
  name: gameserver-ui
  apiGroup: rbac.authorization.k8s.io
```

- [ ] **Step 5: SealedSecret (guarded, Jellyfin-Muster)**

```yaml
# argocd/apps/gameserver-ui/templates/sealedsecret.yaml
---
{{- if and .Values.sealedSecret.encryptedSessionSecret .Values.sealedSecret.encryptedAdminPasswordHash }}
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: {{ .Values.sealedSecret.secretName }}
  namespace: {{ .Release.Namespace }}
spec:
  encryptedData:
    sessionSecret: {{ .Values.sealedSecret.encryptedSessionSecret }}
    adminPasswordHash: {{ .Values.sealedSecret.encryptedAdminPasswordHash }}
  template:
    metadata:
      name: {{ .Values.sealedSecret.secretName }}
      namespace: {{ .Release.Namespace }}
{{- end }}
```

- [ ] **Step 6: Lint + Commit**

```bash
helm lint argocd/apps/gameserver-ui
yamllint argocd/apps/gameserver-ui   # falls lokal installiert
git add argocd/apps/gameserver-ui
git commit -m "feat(apps): add gameserver-ui ArgoCD app"
```

---

### Task 8: Secrets sealen, deployen, verifizieren

- [ ] **Step 1: Secrets erzeugen und sealen** (lokal, `KUBECONFIG=~/.kube/homeserver.yaml`)

```bash
SESSION_SECRET=$(openssl rand -hex 32)
read -s -p "Admin-Passwort: " PW; echo
HASH=$(cd apps/gameserver-ui && node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" "$PW")

printf '%s' "$SESSION_SECRET" | kubeseal --raw --namespace gameserver-ui \
  --name gameserver-ui-auth --controller-name sealed-secrets-controller \
  --controller-namespace sealed-secrets --from-file=/dev/stdin
printf '%s' "$HASH" | kubeseal --raw --namespace gameserver-ui \
  --name gameserver-ui-auth --controller-name sealed-secrets-controller \
  --controller-namespace sealed-secrets --from-file=/dev/stdin
```

Beide `AgB…`-Strings in `values.yaml` eintragen (`encryptedSessionSecret`, `encryptedAdminPasswordHash`).

- [ ] **Step 2: Image-Tag pinnen** — den `sha-…`-Tag des CI-Builds in `values.yaml` als `image.tag` setzen, `pullPolicy: IfNotPresent`.

- [ ] **Step 3: Commit + Push → ArgoCD-Sync abwarten**

```bash
git add argocd/apps/gameserver-ui/values.yaml
git commit -m "feat(gameserver-ui): seal auth secret + pin image tag"
git push
# Nach ~3 min:
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n gameserver-ui get pods,ingress'
# Expected: Pod Running, Ingress host gameserver.homeserver
```

- [ ] **Step 4: End-to-End verifizieren**

1. `http://gameserver.homeserver` öffnen → Redirect auf /login
2. Anmelden → Dashboard zeigt `runStrategy: Halted`, VMI `—`
3. „Starten" → nach ~60 s VMI-Phase `Running` + IP sichtbar
4. „Stoppen" (Bestätigungs-Dialog) → VMI verschwindet, Status `Stopped`
5. RBAC-Negativtest: `ssh … 'sudo kubectl auth can-i delete vm -n gameserver --as=system:serviceaccount:gameserver-ui:gameserver-ui'` → Expected: `no`

---

### Task 9: Doku + Abschluss

- [ ] **Step 1: `docs/20-gameserver-ui.md` schreiben** — Architektur (Kurzfassung aus Spec), Seal-Prozedur (Task 8), Troubleshooting (Pod CrashLoop → Secret fehlt; 502 vom /api/vm → RBAC prüfen).
- [ ] **Step 2: CLAUDE.md Service-Tabelle ergänzen:** `| Gameserver-UI | http://gameserver.homeserver | 7DTD-VM-Verwaltung (docs/20-gameserver-ui.md) |`
- [ ] **Step 3: Homepage-Dashboard-Eintrag** (optional): `argocd/apps/homepage/values.yaml` Services-Liste um Gameserver-UI erweitern, Muster der bestehenden Einträge folgen.
- [ ] **Step 4: Tests + Lint gesamt grün, committen, pushen.**
- [ ] **Step 5: Issue #123 kommentieren:** „Phase 1 (Login + VM-Steuerung) deployed". Issue offen lassen (Iterationen 3–7 folgen).
