# RPS-Arena

Schere-Stein-Papier im Browser: eine eigene Svelte-SPA mit Socket.IO-Backend und mitgeliefertem Redis.

| | |
|---|---|
| URL | http://rps-arena.homeserver · ohne DNS: `http://192.168.178.127:30808` |
| Namespace | `rps-arena` |
| Quelle | [`argocd/apps/rps-arena/`](../argocd/apps/rps-arena/) (Wrapper-Chart, Werte unter `rps-arena:`) |
| Chart | `oci://ghcr.io/jaydee94/charts/rps-arena` 1.4.0, Code: [Jaydee94/rps-arena](https://github.com/Jaydee94/rps-arena) |

## Architektur

```text
Browser ── HTTP + WebSocket ──→ Traefik (Ingress rps-arena.homeserver) ──┐
Browser im LAN ──→ NodePort 30808 (rps-arena-nodeport) ──────────────────┤
                                                                         ▼
                                         rps-arena Pod :8080 ──→ Redis (PVC local-path 1Gi)
```

Traefik reicht WebSocket-Upgrades ohne Annotationen durch. `ingress.annotations: {}` überschreibt die
nginx-Timeout-Annotationen aus dem Chart-Default.

## Konfiguration

| Wert unter `rps-arena:` | Default | Zweck |
|---|---|---|
| `replicaCount` | `1` | eine Replica, daher keine Sticky Sessions nötig |
| `ingress.host` | `rps-arena.homeserver` | Hostname, auch in `ingressTls.hosts` von cert-manager |
| `redis.maxmemory` / `redis.maxmemoryPolicy` | `100mb` / `volatile-lru` | Speichergrenze von Redis |
| `redis.persistence.size` | `1Gi` | PVC für Redis |

Renovate hebt die Chart-Version in `Chart.yaml` per PR an. Rollback: diesen PR reverten.

## NetworkPolicy

`rps-arena-namespace-isolation` lässt Ingress nur aus dem eigenen Namespace (App zu Redis), aus `kube-system`
(Traefik), aus `monitoring` und aus `192.168.178.0/24` zu. Mehr dazu in [NetworkPolicies](23-network-policies.md).

## Fallstricke

- Der NodePort-Service braucht `externalTrafficPolicy: Local`. Mit `Cluster` ersetzt kube-proxy die Client-IP durch
  eine Pod-CIDR-Adresse, und die `ipBlock`-Regel für das LAN greift nicht mehr.
