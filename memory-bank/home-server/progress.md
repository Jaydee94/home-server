# Progress

## Recent Activity

### fix/gameserver-ui-console-output-marker (offen 2026-06-12)
Folge zu PR #163. Zwei gebündelte gameserver-ui-Fixes:
1. Konsolen-Ausgabe ab `Executing command`-Marker schneiden (entfernt
   durchgerutschtes 'session.'-Banner-Fragment).
2. /logs: Toggle „Verbindungs-Logs" blendet Telnet-Polling-Rauschen aus
   (Default aus); --tail 100->500. Quelle verifiziert: docker logs ==
   LinuxGSM sdtdserver-console.log, enthält Gameplay (GMSG/Chat/Spawn).
Suite 98/98, tsc+eslint+build clean. Spec unter docs/superpowers/specs/.

### PR #163 gemergt (2026-06-12) — Telnet graceful exit
channel.end('exit') statt channel.destroy() → keine IOException mehr;
stripServerLog filtert Server-Logzeilen. Live verifiziert.

### PR #162 + #161 gemergt (2026-06-12) — TinyTeller entfernt
Ansible-Rolle, Playbook, host/group_vars, Homepage-Kachel, CLAUDE.md, memory-bank.

### PR #159 gemergt (2026-06-12) — Homepage Layout-Redesign
7 Sektionen → 4 (Cluster, Media, NAS, Tools). Icon-Fixes.

### feat/ugreen-nas-migration (PR #47 gemergt)
Migration ugreen-paperless → home-server: NAS-Dienste aus diesem Repo verwaltbar.

## Gameserver-UI Log-Quelle (verifiziert)
- /logs streamt `sudo docker logs -f --tail=500 7dtd-server`.
- == LinuxGSM `/home/sdtdserver/log/console/sdtdserver-console.log` (Container).
- Enthält Gameplay (GMSG joined/died/left, Chat, PlayerSpawned) — Quelle vollständig.

## NAS-Dienste (aktiv)
- Paperless-NGX (8000), OpenCode (4096), Day Pilot (3003), Node Exporter + cAdvisor

## Known Issues
- TinyTeller läuft ggf. noch auf NAS unter /opt/tinyteller — manuell stoppen.

## Was als nächstes kommt
1. fix/gameserver-ui-console-output-marker mergen → Pod-Restart → /console + /logs live verifizieren
2. TinyTeller auf NAS abschalten + `make semaphore-bootstrap`
