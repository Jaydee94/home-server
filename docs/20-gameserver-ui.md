# 20 — Gameserver-UI

Web-Oberfläche zur Verwaltung der 7DTD-KubeVirt-VM unter `http://gameserver.homeserver`.

## Architektur

```
Browser → Traefik (LAN/Tailnet) → Namespace gameserver-ui
            Service :80 → Pod :3000 (Next.js standalone)
                            ↓
                  ServiceAccount gameserver-ui
                  Role/RoleBinding im Namespace gameserver
                            ↓
                  KubeVirt API: VirtualMachine + VirtualMachineInstance
```

- **Authentifizierung:** Single-Admin, iron-session-Cookie, bcrypt-Hash aus SealedSecret `gameserver-ui-auth`
- **VM-Steuerung:** PATCH `spec.runStrategy` (`Always` = starten, `Halted` = stoppen)
- **Container-Neustart:** `POST /api/restart` → `saveworld` + `sudo docker restart 7dtd-server` via SSH (bei Online-Spielern 30 s Broadcast-Countdown). Startet nur den 7DTD-Container neu (nicht die VM) — lädt u. a. neue Mods.
- **Spielversion:** `GET /api/version` → Telnet `version` → `parseVersion` (`V 2.6 (b14)`)
- **Metriken:** VictoriaMetrics-Abfragen via `/api/metrics` — CPU-Auslastung (`kubevirt_vmi_vcpu_seconds_total`) und RAM `X.X / Y.Y GB` (`kubevirt_vmi_memory_resident_bytes` / `kubevirt_vm_resource_requests`)
- **RBAC:** Cross-Namespace — ServiceAccount im Namespace `gameserver-ui`, Role/RoleBinding im Namespace `gameserver` (nur `get/list` auf VMI, `get/list/patch` auf VM)
- **Image:** `ghcr.io/jaydee94/gameserver-ui` — Build via GitHub Actions (`.github/workflows/gameserver-ui.yml`), Tag `sha-<short-sha>`

## Seal-Prozedur

Bei Erstinstallation oder Rotation:

```bash
# 1. Neues SESSION_SECRET erzeugen
SESSION_SECRET=$(openssl rand -hex 32)

# 2. Admin-Passwort festlegen
read -s -p "Admin-Passwort: " PW; echo

# 3. bcrypt-Hash erzeugen
HASH=$(cd apps/gameserver-ui && node -e \
  "console.log(require('bcryptjs').hashSync(process.argv[1],10))" "$PW")

# 4. SESSION_SECRET sealen
SEALED_SESSION=$(echo -n "$SESSION_SECRET" | ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubeseal --raw --namespace gameserver-ui --name gameserver-ui-auth \
   --controller-name sealed-secrets-controller \
   --controller-namespace sealed-secrets \
   --from-file=/dev/stdin')

# 5. HASH sealen
SEALED_HASH=$(echo -n "$HASH" | ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubeseal --raw --namespace gameserver-ui --name gameserver-ui-auth \
   --controller-name sealed-secrets-controller \
   --controller-namespace sealed-secrets \
   --from-file=/dev/stdin')

# 6. Beide Werte in argocd/apps/gameserver-ui/values.yaml eintragen:
#    sealedSecret.encryptedSessionSecret: "<SEALED_SESSION>"
#    sealedSecret.encryptedAdminPasswordHash: "<SEALED_HASH>"
```

Anschließend committen und pushen — ArgoCD synct automatisch.

## Image-Tag pinnen

Nach jedem CI-Build den neuen `sha-<short-sha>`-Tag in `values.yaml` eintragen:

```bash
# Letzten erfolgreichen Build ermitteln
gh run list --workflow=gameserver-ui --repo jaydee94/home-server --limit 1

# Tag in values.yaml setzen
# image.tag: "sha-<short-sha>"
# image.pullPolicy: IfNotPresent
```

## Troubleshooting

### Pod bleibt in CrashLoop / Login schlägt mit 500 fehl

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n gameserver-ui logs -l app=gameserver-ui --tail=50'
```

Ursache meistens: `SESSION_SECRET` oder `ADMIN_PASSWORD_HASH` fehlen (SealedSecret noch nicht versiegelt oder Controller hat Secret noch nicht entschlüsselt). Lösung: Seal-Prozedur oben durchführen, danach Pod neu starten:

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n gameserver-ui rollout restart deployment gameserver-ui'
```

### 502 vom /api/vm-Endpunkt

RBAC-Problem — ServiceAccount hat keine Berechtigung auf die KubeVirt-Ressourcen:

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl auth can-i get virtualmachines -n gameserver \
   --as=system:serviceaccount:gameserver-ui:gameserver-ui'
# Expected: yes
```

Falls `no`: ArgoCD-Sync erzwingen (Role/RoleBinding im Namespace `gameserver` prüfen).

### VM-Status bleibt "Unknown"

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n gameserver get vm,vmi'
```

Die VM muss im Namespace `gameserver` existieren und den Namen `7dtd-server` tragen.

### Konsole zeigt `IOException … socket has been shut down`

7DTD hält pro Telnet-Verbindung einen Writer-Thread (`TelnetConnection.handleWriting`),
der das Server-Log fortlaufend an den Client broadcastet. Wird der Socket abrupt
gekappt (`channel.destroy()` ohne vorheriges 7DTD-`exit`), stirbt dieser Thread beim
nächsten Schreibvorgang mit `ERR/EXC IOException: Unable to write data … socket has
been shut down`. Da 7DTD die jüngste Log-History auch an neu verbundene Clients
sendet, erscheint der Fehler in der Ausgabe des **nächsten** Befehls.

`telnetCommand` (`src/lib/telnet.ts`) meldet sich deshalb per `exit` ab (der Server
schließt den Socket selbst) und filtert Server-Logzeilen (ISO-Zeitstempel) via
`stripServerLog()` aus der angezeigten Ausgabe. Tritt der Fehler erneut auf, prüfen
ob diese beiden Mechanismen noch greifen.

### Mod-Upload schlägt mit 502 fehl / Mods werden nicht geladen

`POST /api/mods` entpackt die Zip auf der VM (`sudo unzip -o … -d /opt/7dtd/mods`)
und 7DTD lädt aus `serverfiles/Mods`. Zwei VM-seitige Voraussetzungen müssen
erfüllt sein (in `docs/19-gameserver.md` cloud-init verankert):

1. **`unzip` installiert** — sonst `502` mit `sudo: unzip: command not found`.
   Live nachinstallieren: `sudo apt-get install -y unzip`.
2. **Bind-Mount `/opt/7dtd/mods → /home/sdtdserver/serverfiles/Mods`** in
   `/opt/7dtd/docker-compose.yml` — sonst landet der Mod zwar auf dem Host, kommt
   aber nie im Container an. Volume ergänzen, dann `cd /opt/7dtd && sudo docker
   compose up -d` (Recreate, nicht nur `restart` — neue Mounts greifen erst beim
   Recreate). Mod-Pfad laut vinanrra „Manual Mods": `serverfiles/Mods/<ModName>/`.

Verifikation: Upload → `200`, Mod in der Liste, im Container sichtbar via
`docker exec 7dtd-server ls /home/sdtdserver/serverfiles/Mods`.

## End-to-End-Verifikation nach Merge

1. `http://gameserver.homeserver` → Redirect auf `/login`
2. Admin-Passwort eingeben → Dashboard mit `runStrategy: Halted`
3. „Starten" → nach ~60 s VMI-Phase `Running` + Tailscale-IP sichtbar
4. „Stoppen" (Bestätigungs-Dialog) → VMI verschwindet, Status `Stopped`
5. RBAC-Negativtest: `kubectl auth can-i delete vm -n gameserver --as=system:serviceaccount:gameserver-ui:gameserver-ui` → `no`
6. Konsole (`/console`): nacheinander `lp` und `gettime` senden → nur das jeweilige
   Ergebnis (`Total of N …`, `Day X, HH:MM`) sichtbar, **keine** `ERR/EXC IOException`-Zeilen.
   Gegenprobe `/logs`: keine neuen `IOException … socket has been shut down` nach Befehlen.
7. Logs (`/logs`): Default-Ansicht ohne Telnet-Plumbing (`Telnet connection from/closed`,
   `Executing command … by Telnet`); Toggle „Verbindungs-Logs" blendet es wieder ein.
   Spielgeschehen (`GMSG … joined/died`, `Chat (…)`) bleibt in beiden Modi sichtbar.
8. Dashboard: Kachel „Version" zeigt die aktive Spielversion (z. B. `V 2.6 (b14)`).
9. Dashboard „↻ Neustarten" (bzw. Mods → „Mods anwenden"): Confirm → Container startet
   neu (~1 Min); im `/logs` erscheinen Shutdown + Startup, danach läuft der Server wieder.

## Implementierte Seiten

| Seite | Pfad | Funktion |
|---|---|---|
| Dashboard | `/` | VM-Status, CPU/RAM/Version-Kacheln, Horde-Night-Countdown, Starten/Stoppen/**Neustarten** (Container-Restart) |
| Logs | `/logs` | Live-Logs (`docker logs -f --since <Container-Start> --tail=2000 7dtd-server`, == LinuxGSM `sdtdserver-console.log`) — zeigt nur den **aktuellen** Server-Start (frühere Boots gefiltert via `.State.StartedAt`); mit Suche, Pause, Kopieren, Download; Toggle „Verbindungs-Logs" blendet Telnet-Polling-Rauschen aus (Default aus) |
| Console | `/console` | Interaktive Telnet-Console zur VM |
| Config | `/config` | Alle ~70 serverconfig.xml-Settings (V2.6) mit typgerechten Controls (Dropdown/Toggle/Slider/Stepper), gruppiert (Akkordeon) + Suche; Map-Dropdown via `/api/worlds`; „Experten (XML)" für Rohbearbeitung; veraltete/unbekannte Properties (Gruppe „Sonstige") per 🗑 entfernbar. Speichern schreibt XML + Container-Neustart. Schreibt nach `/opt/7dtd/config/serverconfig.xml` — diese Datei MUSS per Bind-Mount auf die vom Server gelesene `serverfiles/sdtdserver.xml` zeigen und vollständig sein, sonst wirken Änderungen nicht bzw. crasht 7DTD (siehe `docs/19` → „Server-Config & Gameserver-UI") |
| Backups | `/backups` | Backup erstellen (mit Retention), Download, Löschen |
| Mods | `/mods` | Mod-Liste anzeigen/verwalten; „Mods anwenden (Neustart)" lädt hochgeladene Mods via Container-Restart. Stock-Mods (Präfix `0_TFP`/`TFP_`/`Xample_`, z. B. `0_TFP_Harmony`) sind als „System" markiert und vor Löschen geschützt — auch server-seitig (DELETE → 403) |
| Players | `/players` | Online-Spieler mit Session-Dauer |

## Weiterführend

- Quellcode: `apps/gameserver-ui/`
- Helm-Chart: `argocd/apps/gameserver-ui/`
- Gameserver-Infra (KubeVirt VM, CronJobs, Tailscale): `docs/19-gameserver.md`
