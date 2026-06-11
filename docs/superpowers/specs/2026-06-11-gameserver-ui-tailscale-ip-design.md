# Design: Tailscale-IP im Gameserver-UI Dashboard

**Datum:** 2026-06-11  
**Status:** Approved

## Ziel

Die Tailscale-IP der 7DTD-VM im Dashboard anzeigen, damit Nutzer direkt die Adresse sehen, über die sie den Server via Tailscale erreichen können.

## Kontext

- KubeVirt meldet in `vmi.status.interfaces` nur die Cluster-IP (`eth0`, z.B. `10.42.0.198`) — die Tailscale-Schnittstelle (`tailscale0`) erscheint dort nicht.
- Die App hat bereits eine `SshClient`-Abstraktion, die in allen API-Routen genutzt wird: erst `getStatus()` holen, dann `SshClient.fromEnv(ipAddress)` bauen und einen Befehl ausführen.
- Das Dashboard pollt `/api/vm` alle 5 Sekunden — SSH-Calls dort wären zu teuer.

## Architektur

### Neuer Endpoint: `GET /api/vm/tailscale`

Datei: `src/app/api/vm/tailscale/route.ts`

Ablauf:
1. `VmClient.inCluster().getStatus()` aufrufen
2. VM nicht Running oder keine `ipAddress` → 503 zurückgeben
3. `SshClient.fromEnv(ipAddress).exec("tailscale ip -4")` ausführen
4. Ausgabe trimmen, als `{ tailscaleIp: string }` zurückgeben
5. SSH-Fehler → 502

Response-Schema:
```json
{ "tailscaleIp": "100.x.x.x" }
```

Fehlerfall: `{ "error": "..." }` mit Status 502 oder 503.

### Frontend: `src/app/page.tsx`

- Neuer State: `tailscaleIp: string | null`
- **Einmalig** beim Mount gefetcht (`useEffect` ohne Interval) — Tailscale-IP ist stabil, kein 5s-Polling nötig
- Neue Tabellenzeile unterhalb von "IP": `Tailscale IP | 100.x.x.x`
- Zeigt `—` wenn Endpoint 503/502 zurückgibt oder VM down ist

## Fehlerbehandlung

| Szenario | Verhalten |
|----------|-----------|
| VM nicht Running | Endpoint gibt 503, Frontend zeigt `—` |
| SSH schlägt fehl (VM boot, key fehlt) | Endpoint gibt 502, Frontend zeigt `—` |
| `tailscale ip` gibt leere Ausgabe | `tailscaleIp: null`, Frontend zeigt `—` |

## Tests

Unit-Test `src/app/api/vm/tailscale/__tests__/route.test.ts`:
- VM Running + SSH liefert IP → 200 mit `tailscaleIp`
- VM nicht Running → 503
- SSH wirft Fehler → 502

Mocks: `VmClient.inCluster` + `SshClient.fromEnv` (gleiche Mocking-Strategie wie bestehende Route-Tests).

## Abgrenzung

- Kein Polling der Tailscale-IP (stabil, einmalig reicht)
- Kein Env-Var-Fallback (YAGNI — SSH reicht für diesen Use Case)
- Kein Tailscale API-Key nötig
