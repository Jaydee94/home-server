# rps-arena — Rock-Paper-Scissors Browser-Game

**URL:** http://rps-arena.homeserver

Ein browserbasiertes Rock-Paper-Scissors-Spiel (Svelte SPA + Socket.IO Backend)
mit Turnier-Modus, Bot-Gegnern und Deutsch/Englisch-Lokalisierung.

---

## Architektur

```
Browser
  │  HTTP + WebSocket (socket.io)
  ▼
Traefik (kube-system) → Ingress rps-arena.homeserver
  │
  ▼
rps-arena Pod (Port 8080)
  │  REDIS_URL (intern)
  ▼
Redis Pod (bundled, same namespace)
  │  PVC: local-path 1Gi
```

- **Image:** `ghcr.io/jaydee94/rps-arena` — Renovate hält Tag aktuell
- **Helm-Chart:** `oci://ghcr.io/jaydee94/charts/rps-arena` (selbe Versionierung)
- **Redis:** bundled, in-namespace — kein externes Secret nötig
- **Replica-Count:** 1 — kein Sticky-Session-Middleware erforderlich

---

## Deployment

Der App-Ordner `argocd/apps/rps-arena/` wird vom Root-ApplicationSet automatisch
erkannt. Nach einem `git push` auf `main` synchronisiert ArgoCD innerhalb von ~3 Minuten.

ArgoCD erstellt den Namespace `rps-arena` automatisch (`CreateNamespace=true`).

---

## Traefik WebSocket

Traefik v2 verarbeitet WebSocket-Upgrades (HTTP → WS) **nativ** ohne zusätzliche
Annotationen. Die nginx-spezifischen Timeout-Annotationen aus dem Chart-Default
(`nginx.ingress.kubernetes.io/proxy-*-timeout`) werden bewusst überschrieben:
`ingress.annotations: {}`.

---

## Konfiguration

Alle Werte liegen in `argocd/apps/rps-arena/values.yaml`.

| Wert | Default | Beschreibung |
|---|---|---|
| `replicaCount` | 1 | Einzel-Replica (kein Sticky-Session-Bedarf) |
| `ingress.host` | `rps-arena.homeserver` | LAN + Tailnet via dnsmasq-Wildcard |
| `redis.maxmemory` | 100mb | Redis-Speicher-Cap (volatile-lru Eviction) |
| `redis.persistence.size` | 1Gi | PVC für Redis (local-path) |

---

## Upgrade

Renovate öffnet automatisch PRs wenn eine neue Chart-Version erscheint.
Merge auf `main` → ArgoCD rollt das neue Image aus.

Manueller Rollback (falls nötig):

```bash
# Chart-Version in values.yaml zurücksetzen, committen, pushen
# ArgoCD erkennt den Diff und rollt zurück
```

---

## NetworkPolicy

Nur Traefik (`kube-system`) und Monitoring dürfen von außen in den Namespace.
Der interne Redis-Traffic läuft über `podSelector: {}` (same namespace).
Details: `docs/23-network-policies.md`.
