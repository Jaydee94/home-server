# Gameserver-UI

Web-Oberfläche zur Verwaltung der 7DTD-KubeVirt-VM (Next.js), erreichbar
unter `http://gameserver.homeserver`. Seiten: Dashboard, Logs, Console,
Config, Backups, Mods, Players.

## npm-Skripte

```bash
npm ci           # Abhängigkeiten installieren
npm run dev      # Entwicklungsserver (next dev)
npm run build    # Produktions-Build (next build)
npm run lint     # ESLint
npm test         # Unit-Tests (vitest run)
```

## Weiterführend

Architektur, Seal-Prozedur, Image-Tag-Pinning, Troubleshooting und die
Seitenübersicht stehen in [`docs/20-gameserver-ui.md`](../../docs/20-gameserver-ui.md).
Das Helm-Chart liegt unter `argocd/apps/gameserver-ui/`.
