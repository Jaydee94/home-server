# Gameserver-UI

Next.js-App (Next 16, React 19) zum Verwalten der 7DTD-KubeVirt-VM unter http://gameserver.homeserver. Betrieb,
Secrets und Rollout stehen in [`docs/20-gameserver-ui.md`](../../docs/20-gameserver-ui.md), das Helm-Chart liegt
unter [`argocd/apps/gameserver-ui/`](../../argocd/apps/gameserver-ui/).

## Entwicklung

Node 26 (wie CI und `Dockerfile`).

```bash
npm ci              # Abhängigkeiten installieren
npm run dev         # Entwicklungsserver (next dev)
npm run build       # Produktions-Build (next build, Output standalone)
npm run start       # Build lokal starten (next start)
npm run lint        # ESLint
npm test            # Vitest (src/**/*.test.ts)
npx next typegen && npx tsc --noEmit   # Type-Check wie in CI
```

Ohne `SESSION_SECRET` (mindestens 32 Zeichen) nutzt die App außerhalb von `NODE_ENV=production` einen
Dev-Fallback. In Production verweigert sie dann jede Session.

## Umgebungsvariablen

| Variable | Default | Zweck |
|---|---|---|
| `SESSION_SECRET` | Dev-Fallback | Schlüssel des iron-session-Cookies |
| `ADMIN_PASSWORD` | | Admin-Login |
| `GAMESERVER_NAMESPACE`, `VM_NAME` | | Namespace und Name der VirtualMachine |
| `VM_SSH_USER`, `VM_SSH_KEY_PATH`, `VM_SSH_PORT` | Port 22 | SSH-Zugang zur VM |
| `VM_SSH_HOST_FINGERPRINT` | leer (keine Prüfung) | SHA-256-Fingerprint des VM-Host-Keys, Hex |
| `VM_TELNET_PORT`, `TELNET_PASSWORD` | `8081`, leer | Telnet über SSH-Tunnel |
| `VICTORIA_URL` | | VictoriaMetrics für CPU und RAM |
| `NAS_MOUNT_PATH` | `/mnt/gameserver-data` | NAS-Mount, Backups unter `backups/` |
| `BACKUP_KEEP` | `7` | Anzahl aufbewahrter Backups |

Die Werte im Cluster setzt [`deployment.yaml`](../../argocd/apps/gameserver-ui/templates/deployment.yaml).

## CI und Image

[`.github/workflows/gameserver-ui.yml`](../../.github/workflows/gameserver-ui.yml) läuft bei Änderungen unter
`apps/gameserver-ui/`: `npm ci`, Type-Check, Lint, Tests. Auf PRs wird das Image nur gebaut, auf `main` als
`ghcr.io/jaydee94/gameserver-ui:sha-<short-sha>` und `:stable` gepusht. Ausgerollt wird erst, wenn der
Renovate-PR mit dem neuen Digest gemergt ist.

## ESLint und TypeScript 7

typescript-eslint unterstützt TypeScript 7 noch nicht. [`eslint-ts6-shim.mjs`](eslint-ts6-shim.mjs) leitet deshalb
`typescript` für ESLint auf den Alias `typescript-6` um. Den Alias nicht auf 7 anheben, sonst bricht `npm run lint`
(Renovate-Regel in `renovate.json`).
