# Active Context

## Aktueller Branch
fix/gameserver-ui-console-output-marker (PR offen) — bündelt zwei zusammenhängende
gameserver-ui-Fixes (Konsolen-Ausgabe + Logs-Rauschen).

## Aktueller Fokus
Gameserver-UI Konsolen-/Logs-Rauschen aufräumen (Folge zu PR #163).

## Erledigt in diesem Branch
1. **Konsolen-Ausgabe ab Marker schneiden** (`telnet.ts` `extractCommandOutput`):
   PR #163 entfernte die IOException, aber ein Banner-Fragment ('…to end session.'
   -> 'session.') rutschte durch. Jetzt wird ab der letzten
   `Executing command '<cmd>' by Telnet`-Markerzeile geschnitten.
2. **/logs Verbindungs-Rauschen ausblendbar** (`logfilter.ts` `isConnectionNoise`,
   `logs/page.tsx` Toggle, `/api/logs` --tail 100->500). Default sauber, Toggle
   „Verbindungs-Logs" zeigt Telnet-Plumbing. Spec:
   docs/superpowers/specs/2026-06-12-gameserver-ui-logs-noise-toggle-design.md
- TDD: Tests für extractCommandOutput + isConnectionNoise. Suite 98/98, tsc+eslint+build clean.
- docs/20 aktualisiert (Logs-Beschreibung + E2E-Schritt 7).

## Verifiziert auf der VM (read-only, via gameserver-ui-ssh Key aus Secret)
- 7DTD läuft als Docker-Container `7dtd-server` (vinanrra/7dtd-server, --network host).
- **`docker logs 7dtd-server` == `/home/sdtdserver/log/console/sdtdserver-console.log`**
  (Tail byte-identisch) — Quelle korrekt & vollständig, KEINE Quellen-Änderung nötig.
- Gameplay-Events enthalten: `GMSG … joined/died/left`, `Chat (…)`, `PlayerSpawned`.
- „Keine Game-Logs"-Eindruck kam vom idle-Server (letzter Spieler 10.06. 22:38) →
  jüngste Logs = reines Telnet-Polling-Rauschen, das der Filter jetzt ausblendet.
- VM-Zugriff: ubuntu@<vmi-ip>, Key NUR aus SealedSecret gameserver-ui-ssh
  (jaydee-Key NICHT auf VM autorisiert); docker braucht `sudo`.

## Offene Punkte
- PR mergen → gameserver-ui-Image baut → **Pod-Restart nötig** (Tag :stable, ArgoCD
  triggert keinen Rollout): `kubectl -n gameserver-ui rollout restart deploy gameserver-ui`.
- Danach /console + /logs live verifizieren (docs/20 E2E-Schritte 6+7).

## Zuletzt gemergt
- PR #163: Telnet graceful exit (channel.end 'exit') statt channel.destroy() —
  behebt IOException; live verifiziert (Server-Log: neue Verbindungen schließen sauber).
- PR #162/#161: TinyTeller entfernt. PR #159: Homepage-Redesign.
