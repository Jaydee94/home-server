# Active Context

## Aktueller Branch
main (alle gameserver-ui-Arbeiten gemergt + live verifiziert)

## Aktueller Fokus
Gameserver-UI Konsolen-/Logs-/Dashboard-Verbesserungen abgeschlossen.

## Zuletzt abgeschlossen (12.06.2026) — alle live verifiziert
- **PR #163**: Telnet graceful `exit` (`channel.end`) statt `channel.destroy()` →
  keine `IOException` mehr; `stripServerLog` filtert Server-Logzeilen.
- **PR #164**: Konsolen-Output ab `Executing command`-Marker schneiden
  (`extractCommandOutput`) → 'session.'-Fragment weg; `/logs` Toggle
  „Verbindungs-Logs" (`isConnectionNoise`, Default aus), `--tail` 100→500.
- **PR #165**: Container-Neustart (`POST /api/restart`, `restartServer`) — nur
  `docker restart 7dtd-server` statt VM-Stopp/Start; saveworld + 30s-Countdown bei
  Online-Spielern, sofort bei 0. Buttons Dashboard + Mods. Spielversion-Kachel
  (`GET /api/version`, `parseVersion` → `V 2.6 (b14)`).
- **Echter Restart end-to-end getestet**: UI-Klick → Container StartedAt wechselte
  (05:27→06:31), `StartGame done` + `GameServer.LogOn successful`, danach
  `gettime` wieder responsiv.

## Wichtige verifizierte Fakten (gameserver-ui ↔ VM)
- 7DTD = Docker-Container `7dtd-server` (vinanrra/7dtd-server, --network host) auf KubeVirt-VM.
- `docker logs 7dtd-server` == LinuxGSM `/home/sdtdserver/log/console/sdtdserver-console.log`
  (byte-identisch) — enthält Gameplay (GMSG joined/died, Chat, PlayerSpawned).
- VM-SSH: nur SealedSecret-Key `gameserver-ui-ssh` für ubuntu autorisiert (jaydee-Key NICHT);
  docker braucht `sudo`. VMI-IP via `kubectl -n gameserver get vmi 7dtd-server`.
- Deploy: gameserver-ui Image-Tag `:stable` → nach Merge **Pod-Restart nötig**
  (`kubectl -n gameserver-ui rollout restart deploy gameserver-ui`); ArgoCD triggert
  bei gleichem Tag keinen Rollout.

## Offene Punkte (nicht gameserver-ui)
- TinyTeller ggf. noch auf NAS unter /opt/tinyteller — manuell stoppen.

## Davor gemergt
- PR #162/#161: TinyTeller entfernt. PR #159: Homepage-Redesign. PR #47: NAS-Migration.
