# Active Context

## Aktueller Branch
feat/gameserver-ui-restart-version (PR offen)

## Aktueller Fokus
Gameserver-UI: Container-Neustart + Spielversion im Dashboard.

## Erledigt in diesem Branch
- **POST /api/restart** + `restartServer(ssh, opts, {sleep, telnet})`: startet nur den
  Docker-Container `7dtd-server` neu (nicht die VM). Bei Online-Spielern 30s-Countdown
  (Broadcast 30s+10s) + `saveworld`, dann `sudo docker restart`; bei 0 Spielern sofort.
  Buttons: Dashboard „↻ Neustarten" + Mods-Seite „Mods anwenden (Neustart)".
- **GET /api/version** + `parseVersion()`: Telnet `version` → `V 2.6 (b14)`; neue
  StatTile „Version" im Dashboard.
- TDD: parseVersion + restartServer Tests. Suite 105/105, tsc+build clean.
- eslint: 1 verbleibender Fehler ist VORBESTEHEND (page.tsx loadMetrics-Effect),
  nicht von diesem Branch; eslint läuft nicht in CI (gameserver-ui.yml = test+build).
- docs/20 + Spec aktualisiert.

## Hintergrund / Mod-Zusammenspiel
- Mods werden via /mods nach /opt/7dtd/mods hochgeladen; 7DTD lädt sie nur beim
  Server-Start → Container-Restart ist der schnelle Apply-Weg (ohne VM/OS/Tailscale-Reboot).
- 7DTD läuft als Docker-Container vinanrra/7dtd-server (--network host) auf der VM.

## Offene Punkte
- PR mergen → Image-Build → **Pod-Restart** der gameserver-ui (Tag :stable):
  `kubectl -n gameserver-ui rollout restart deploy gameserver-ui`.
- Danach live verifizieren: Version-Kachel, „Neustarten" (docs/20 E2E 8+9).
- Hinweis: Während eines Container-Restarts bleibt VMI-Phase „Running" → Dashboard
  zeigt weiter „läuft" (bewusst; Toast kommuniziert ~1 Min Wartezeit).

## Zuletzt gemergt (alle live verifiziert)
- PR #164: Konsolen-Ausgabe ab Marker schneiden ('session.' weg) + /logs
  Verbindungs-Rauschen-Toggle (--tail 500). Quelle verifiziert: docker logs ==
  LinuxGSM sdtdserver-console.log, enthält Gameplay.
- PR #163: Telnet graceful exit statt channel.destroy() → keine IOException.
- PR #162/#161: TinyTeller entfernt. PR #159: Homepage-Redesign.
