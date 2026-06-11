# RAM Relative Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RAM-Kachel im Gameserver-UI zeigt `"4.7 / 8.0 GB"` (aktuell / gesamt) statt `"4848 MB"`.

**Architecture:** `/api/metrics` bekommt einen dritten VictoriaMetrics-Query für `kubevirt_vm_resource_requests` (Gesamt-RAM). Die UI-Seite rechnet beide Werte in GB um und zeigt sie als `"X.X / Y.Y GB"` an. Fallback auf `"X.X GB"` wenn Gesamt-RAM nicht verfügbar.

**Tech Stack:** Next.js 16, TypeScript, VictoriaMetrics PromQL, Vitest.

---

## Codebase-Kontext

- `apps/gameserver-ui/src/app/api/metrics/route.ts` — API-Route, liefert `{ cpuPercent, memoryMb }`
- `apps/gameserver-ui/src/app/api/__tests__/metrics.test.ts` — Vitest-Tests für die Route
- `apps/gameserver-ui/src/app/page.tsx` — Dashboard-Page, `interface Metrics`, RAM-`StatTile`
- `apps/gameserver-ui/src/components/ui/StatTile.tsx` — `{ label, value, unit }` Props
- VictoriaMetrics-URL: `http://vmsingle-monitoring-victoria-metrics-k8s-stack.monitoring.svc.cluster.local:8428`
- Gesamt-RAM-Query: `kubevirt_vm_resource_requests{name="${vm}", resource="memory", source="guest"}` → liefert Bytes (z.B. 8589934592 = 8192 MB)

---

## Task 1: API-Route — `memoryTotalMb` ergänzen (TDD)

**Files:**
- Modify: `apps/gameserver-ui/src/app/api/__tests__/metrics.test.ts`
- Modify: `apps/gameserver-ui/src/app/api/metrics/route.ts`

- [ ] **Step 1: Tests für `memoryTotalMb` schreiben**

Ersetze die gesamte Testdatei `apps/gameserver-ui/src/app/api/__tests__/metrics.test.ts` mit:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { GET } from "@/app/api/metrics/route";

beforeEach(() => fetchMock.mockReset());

function makeMetricResponse(value: string | null) {
  return {
    ok: value !== null,
    json: async () => ({
      data: { result: value !== null ? [{ value: [0, value] }] : [] },
    }),
  };
}

describe("/api/metrics", () => {
  it("liefert CPU, RAM und memoryTotalMb wenn VictoriaMetrics antwortet", async () => {
    fetchMock
      .mockResolvedValueOnce(makeMetricResponse("25.5"))
      .mockResolvedValueOnce(makeMetricResponse(String(512 * 1024 * 1024)))
      .mockResolvedValueOnce(makeMetricResponse(String(8192 * 1024 * 1024)));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cpuPercent).toBe(25.5);
    expect(body.memoryMb).toBe(512);
    expect(body.memoryTotalMb).toBe(8192);
  });

  it("liefert memoryTotalMb null wenn Metrik leer", async () => {
    fetchMock
      .mockResolvedValueOnce(makeMetricResponse("25.5"))
      .mockResolvedValueOnce(makeMetricResponse(String(512 * 1024 * 1024)))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { result: [] } }) });

    const res = await GET();
    const body = await res.json();
    expect(body.memoryTotalMb).toBeNull();
  });

  it("liefert null-Werte wenn alle Metriken leer sind", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { result: [] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { result: [] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { result: [] } }) });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cpuPercent).toBeNull();
    expect(body.memoryMb).toBeNull();
    expect(body.memoryTotalMb).toBeNull();
  });

  it("liefert null wenn VictoriaMetrics nicht erreichbar (HTTP-Fehler)", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cpuPercent).toBeNull();
    expect(body.memoryMb).toBeNull();
    expect(body.memoryTotalMb).toBeNull();
  });

  it("liefert 502 wenn fetch wirft", async () => {
    const err = new Error("Network error");
    fetchMock.mockRejectedValueOnce(err);

    const res = await GET();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("Network error");
  });

  it("rundet CPU auf eine Nachkommastelle", async () => {
    fetchMock
      .mockResolvedValueOnce(makeMetricResponse("12.3456789"))
      .mockResolvedValueOnce(makeMetricResponse(String(256 * 1024 * 1024)))
      .mockResolvedValueOnce(makeMetricResponse(String(8192 * 1024 * 1024)));

    const res = await GET();
    const body = await res.json();
    expect(body.cpuPercent).toBe(12.3);
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

```bash
cd apps/gameserver-ui && npx vitest run src/app/api/__tests__/metrics.test.ts 2>&1 | tail -20
```

Expected: FAIL — `memoryTotalMb` ist undefined, nicht null/8192.

- [ ] **Step 3: Route implementieren**

Ersetze den gesamten Inhalt von `apps/gameserver-ui/src/app/api/metrics/route.ts` mit:

```typescript
import { NextResponse } from "next/server";

const VICTORIA_URL = process.env.VICTORIA_URL
  ?? "http://vmsingle-monitoring-victoria-metrics-k8s-stack.monitoring.svc.cluster.local:8428";

export async function GET() {
  try {
    const vm = process.env.VM_NAME ?? "7dtd-server";

    const [cpuRes, memRes, memTotalRes] = await Promise.all([
      fetch(`${VICTORIA_URL}/api/v1/query?query=rate(kubevirt_vmi_vcpu_seconds_total%7Bname%3D%22${vm}%22%7D%5B5m%5D)*100`),
      fetch(`${VICTORIA_URL}/api/v1/query?query=kubevirt_vmi_memory_resident_bytes%7Bname%3D%22${vm}%22%7D`),
      fetch(`${VICTORIA_URL}/api/v1/query?query=kubevirt_vm_resource_requests%7Bname%3D%22${vm}%22%2Cresource%3D%22memory%22%2Csource%3D%22guest%22%7D`),
    ]);

    const cpu = cpuRes.ok ? (await cpuRes.json()).data?.result?.[0]?.value?.[1] ?? null : null;
    const mem = memRes.ok ? (await memRes.json()).data?.result?.[0]?.value?.[1] ?? null : null;
    const memTotal = memTotalRes.ok ? (await memTotalRes.json()).data?.result?.[0]?.value?.[1] ?? null : null;

    return NextResponse.json({
      cpuPercent: cpu !== null ? Math.round(parseFloat(cpu) * 10) / 10 : null,
      memoryMb: mem !== null ? Math.round(parseInt(mem) / 1024 / 1024) : null,
      memoryTotalMb: memTotal !== null ? Math.round(parseInt(memTotal) / 1024 / 1024) : null,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
```

- [ ] **Step 4: Tests ausführen — müssen bestehen**

```bash
cd apps/gameserver-ui && npx vitest run src/app/api/__tests__/metrics.test.ts 2>&1 | tail -10
```

Expected: `6 passed`.

- [ ] **Step 5: Committen**

```bash
git add apps/gameserver-ui/src/app/api/__tests__/metrics.test.ts \
        apps/gameserver-ui/src/app/api/metrics/route.ts
git commit -m "feat(gameserver-ui): add memoryTotalMb to metrics API"
```

---

## Task 2: UI — RAM-Kachel auf GB-Relative-Ansicht umstellen

**Files:**
- Modify: `apps/gameserver-ui/src/app/page.tsx`

- [ ] **Step 1: `Metrics`-Interface und `ramDisplay`-Funktion ergänzen**

In `apps/gameserver-ui/src/app/page.tsx`, ersetze Zeile 13:

```typescript
interface Metrics { cpuPercent: number | null; memoryMb: number | null; }
```

mit:

```typescript
interface Metrics { cpuPercent: number | null; memoryMb: number | null; memoryTotalMb: number | null; }

function ramDisplay(mb: number | null, totalMb: number | null): { value: string; unit?: string } {
  if (mb === null) return { value: "—" };
  const usedGb = (mb / 1024).toFixed(1);
  if (totalMb === null) return { value: usedGb, unit: "GB" };
  return { value: `${usedGb} / ${(totalMb / 1024).toFixed(1)}`, unit: "GB" };
}
```

- [ ] **Step 2: RAM-Kachel im JSX anpassen**

In `apps/gameserver-ui/src/app/page.tsx`, ersetze Zeile 85:

```tsx
<StatTile label="RAM" value={metrics?.memoryMb ?? "—"} unit={metrics?.memoryMb != null ? "MB" : undefined} />
```

mit:

```tsx
<StatTile label="RAM" {...ramDisplay(metrics?.memoryMb ?? null, metrics?.memoryTotalMb ?? null)} />
```

- [ ] **Step 3: TypeScript-Build prüfen**

```bash
cd apps/gameserver-ui && npm run build 2>&1 | tail -10
```

Expected: kein TypeScript-Fehler, `✓ Compiled successfully`.

- [ ] **Step 4: Vitest-Suite komplett laufen lassen**

```bash
cd apps/gameserver-ui && npx vitest run 2>&1 | tail -10
```

Expected: alle Tests grün, keine Regressionen.

- [ ] **Step 5: Committen**

```bash
git add apps/gameserver-ui/src/app/page.tsx
git commit -m "feat(gameserver-ui): show relative RAM usage (X.X / Y.Y GB)"
```

---

## Task 3: PR erstellen und CI prüfen

- [ ] **Step 1: Push**

```bash
git push -u origin feat/ram-relative-display
```

- [ ] **Step 2: PR erstellen**

```bash
gh pr create \
  --title "feat(gameserver-ui): show relative RAM usage (X.X / Y.Y GB)" \
  --body "$(cat <<'EOF'
## Summary

- `/api/metrics` liefert jetzt `memoryTotalMb` aus `kubevirt_vm_resource_requests{resource=memory, source=guest}`
- RAM-Kachel zeigt `4.7 / 8.0 GB` statt `4848 MB`
- Fallback: wenn `memoryTotalMb` null → `4.7 GB`; wenn beide null → `—`

## Test plan

- [ ] CI lint grün
- [ ] Gameserver-UI Dashboard: RAM-Kachel zeigt `X.X / 8.0 GB`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: CI-Status abwarten**

```bash
gh pr checks --watch
```

Expected: alle Checks grün.
