# RAM Relative Display — Design-Spec

- **Datum:** 2026-06-11
- **Status:** Approved

## Ziel

Die RAM-Kachel im Gameserver-UI Dashboard zeigt neben dem aktuellen Verbrauch auch den konfigurierten Gesamt-RAM der VM an — z.B. `"4.7 / 8.0 GB"` statt `"4848 MB"`.

## Ist-Zustand

- `/api/metrics` liefert `{ cpuPercent, memoryMb }` — `memoryMb` = aktueller Verbrauch (MB)
- RAM-Kachel: `<StatTile label="RAM" value={metrics?.memoryMb ?? "—"} unit="MB" />`
- `kubevirt_vm_resource_requests{resource="memory", source="guest"}` liefert 8589934592 Bytes (= 8192 MB) als Gesamt-RAM

## Änderungen

### 1. API (`apps/gameserver-ui/src/app/api/metrics/route.ts`)

Dritter paralleler Fetch neben CPU und RAM:

```
query=kubevirt_vm_resource_requests%7Bname%3D%22${vm}%22%2Cresource%3D%22memory%22%2Csource%3D%22guest%22%7D
```

Antwort-Feld: `memoryTotalMb: number | null` (Bytes → MB, analog zu `memoryMb`).

### 2. UI (`apps/gameserver-ui/src/app/page.tsx`)

`Metrics`-Interface: `memoryTotalMb: number | null` ergänzen.

Hilfsfunktion `ramDisplay`:
- Beide null → `{ value: "—", unit: undefined }`
- Nur `memoryMb` → `{ value: "X.X", unit: "GB" }`
- Beide gesetzt → `{ value: "X.X / Y.Y", unit: "GB" }`

RAM-Kachel:
```tsx
const ram = ramDisplay(metrics?.memoryMb ?? null, metrics?.memoryTotalMb ?? null);
<StatTile label="RAM" value={ram.value} unit={ram.unit} />
```

## Fehlerfall

Wenn `memoryTotalMb` null (Metrik nicht verfügbar) → Fallback zeigt nur `"X.X GB"` (ohne `/`-Anteil).

## Nicht im Scope

- StatTile-Umbau
- Fortschrittsbalken oder Prozent-Anzeige
