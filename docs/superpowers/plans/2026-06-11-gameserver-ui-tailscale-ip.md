# Tailscale-IP im Gameserver-UI Dashboard — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Tailscale-IP der 7DTD-VM via SSH (`tailscale ip -4`) abrufen und als neue Zeile im Dashboard anzeigen.

**Architecture:** Neuer Endpoint `GET /api/vm/tailscale` folgt dem bestehenden SSH-Muster (getStatus → SshClient.fromEnv → exec). Das Frontend fetcht die IP einmalig beim Mount in einem separaten State — unabhängig vom 5s-VM-Status-Polling.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, `@/lib/k8s` (VmClient), `@/lib/ssh` (SshClient)

---

## Dateistruktur

| Datei | Aktion | Verantwortung |
|-------|--------|---------------|
| `apps/gameserver-ui/src/app/api/vm/tailscale/route.ts` | Neu anlegen | Tailscale-IP via SSH holen |
| `apps/gameserver-ui/src/app/api/vm/tailscale/__tests__/route.test.ts` | Neu anlegen | Unit-Tests für den Endpoint |
| `apps/gameserver-ui/src/app/page.tsx` | Ändern | Tailscale-IP State + Tabellenzeile |

---

## Task 1: Feature-Branch anlegen

**Files:** —

- [ ] **Branch anlegen**

```bash
git checkout main && git pull
git checkout -b feat/gameserver-ui-tailscale-ip
```

---

## Task 2: Failing Tests schreiben

**Files:**
- Create: `apps/gameserver-ui/src/app/api/vm/tailscale/__tests__/route.test.ts`

- [ ] **Testdatei anlegen**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const getStatus = vi.fn();
vi.mock("@/lib/k8s", () => ({
  VmClient: { inCluster: () => ({ getStatus }) },
}));

const mockExec = vi.fn();
vi.mock("@/lib/ssh", () => ({
  SshClient: { fromEnv: () => ({ exec: mockExec }) },
}));

import { GET } from "@/app/api/vm/tailscale/route";

beforeEach(() => vi.clearAllMocks());

describe("/api/vm/tailscale", () => {
  it("liefert 503 wenn K8s nicht erreichbar", async () => {
    getStatus.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: expect.any(String) });
  });

  it("liefert 503 wenn VM nicht Running", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Stopped", ipAddress: null });
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "VM läuft nicht" });
  });

  it("liefert 503 wenn VM Running aber keine IP", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: null });
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "VM läuft nicht" });
  });

  it("liefert tailscaleIp wenn SSH erfolgreich", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.42.0.198" });
    mockExec.mockResolvedValue("100.64.0.5\n");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tailscaleIp: "100.64.0.5" });
  });

  it("liefert 502 wenn SSH fehlschlägt", async () => {
    getStatus.mockResolvedValue({ vmiPhase: "Running", ipAddress: "10.42.0.198" });
    mockExec.mockRejectedValue(new Error("Exit 1: tailscale not found"));
    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: expect.any(String) });
  });
});
```

- [ ] **Tests ausführen — müssen FEHLSCHLAGEN**

```bash
cd apps/gameserver-ui && npm test -- src/app/api/vm/tailscale/__tests__/route.test.ts
```

Erwartetes Ergebnis: Fehler mit `Cannot find module '@/app/api/vm/tailscale/route'`

---

## Task 3: API-Endpoint implementieren

**Files:**
- Create: `apps/gameserver-ui/src/app/api/vm/tailscale/route.ts`

- [ ] **Route anlegen**

```typescript
import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";
import { SshClient } from "@/lib/ssh";

export async function GET() {
  let status;
  try {
    status = await VmClient.inCluster().getStatus();
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }

  if (status.vmiPhase !== "Running" || !status.ipAddress) {
    return NextResponse.json({ error: "VM läuft nicht" }, { status: 503 });
  }

  try {
    const raw = await SshClient.fromEnv(status.ipAddress).exec("tailscale ip -4");
    return NextResponse.json({ tailscaleIp: raw.trim() });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
```

- [ ] **Tests ausführen — müssen BESTEHEN**

```bash
cd apps/gameserver-ui && npm test -- src/app/api/vm/tailscale/__tests__/route.test.ts
```

Erwartetes Ergebnis: 5 Tests grün, 0 Fehler

- [ ] **Commit**

```bash
git add apps/gameserver-ui/src/app/api/vm/tailscale/
git commit -m "feat(gameserver-ui): add /api/vm/tailscale endpoint"
```

---

## Task 4: Dashboard erweitern

**Files:**
- Modify: `apps/gameserver-ui/src/app/page.tsx`

- [ ] **`page.tsx` anpassen** — `tailscaleIp` State hinzufügen und einmalig beim Mount fetchen

Ersetze den Anfang der Komponente (ab `export default function Dashboard`) mit:

```typescript
export default function Dashboard() {
  const [status, setStatus] = useState<VmStatus | null>(null);
  const [tailscaleIp, setTailscaleIp] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/vm");
    if (res.ok) {
      setStatus(await res.json());
      setError("");
    } else {
      setError(`Status nicht abrufbar (${res.status})`);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    fetch("/api/vm/tailscale")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setTailscaleIp(d?.tailscaleIp ?? null))
      .catch(() => setTailscaleIp(null));
  }, []);
```

- [ ] **Neue Tabellenzeile hinzufügen** — direkt nach der "IP"-Zeile in der `<tbody>`:

```tsx
<tr>
  <td>IP</td>
  <td>{status.ipAddress ?? "—"}</td>
</tr>
<tr>
  <td>Tailscale IP</td>
  <td>{tailscaleIp ?? "—"}</td>
</tr>
```

- [ ] **Alle Tests ausführen**

```bash
cd apps/gameserver-ui && npm test
```

Erwartetes Ergebnis: Alle Tests grün (kein Frontend-Unit-Test nötig da reine State-Composition)

- [ ] **Commit**

```bash
git add apps/gameserver-ui/src/app/page.tsx
git commit -m "feat(gameserver-ui): show Tailscale IP on dashboard"
```

---

## Task 5: Manueller Test + PR

- [ ] **App im Browser prüfen** — http://gameserver.homeserver aufrufen und prüfen ob neue Zeile "Tailscale IP" mit `100.x.x.x` erscheint (braucht ~2s für SSH-Call)

- [ ] **PR erstellen**

```bash
git push -u origin feat/gameserver-ui-tailscale-ip
gh pr create \
  --title "feat(gameserver-ui): show Tailscale IP on dashboard" \
  --body "$(cat <<'EOF'
## Summary

- Neuer Endpoint `GET /api/vm/tailscale`: holt Tailscale-IP via SSH (`tailscale ip -4`)
- Dashboard zeigt neue Zeile "Tailscale IP" — einmalig beim Page-Load gefetcht, unabhängig vom 5s-VM-Status-Polling
- Fehlerfall (VM down, SSH schlägt fehl): zeigt `—`

## Test plan

- [ ] Unit-Tests: `npm test` in `apps/gameserver-ui/` — alle grün
- [ ] Browser: http://gameserver.homeserver — Zeile "Tailscale IP" mit `100.x.x.x` sichtbar
- [ ] VM stoppen → Tailscale IP zeigt `—`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
