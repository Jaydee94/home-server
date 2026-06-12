# 7 Days to Die Gameserver (KubeVirt VM)

Dedizierter **7 Days to Die**-Server für bis zu 8 Spieler, betrieben als
**KubeVirt-VM** im k3s-Cluster. Zugang ausschließlich über **Tailscale** —
kein offener Internet-Port. Kollegen erhalten via **Node-Sharing** Zugriff
auf genau diesen Tailscale-Node.

## Inhaltsverzeichnis

1. [Architektur](#architektur)
2. [Voraussetzungen](#voraussetzungen)
3. [Erstdeploy](#erstdeploy)
4. [Secrets versiegeln](#secrets-versiegeln)
5. [VM starten](#vm-starten)
6. [Tailscale Node-Sharing](#tailscale-node-sharing)
7. [7DTD im Browser-Dashboard](#7dtd-im-browser-dashboard)
8. [Zeitplan & Scheduling](#zeitplan--scheduling)
9. [Backup](#backup)
10. [Troubleshooting](#troubleshooting)

---

## Architektur

```
k3s-Cluster (Bare Metal, i5, 32 GB RAM, NVMe)
  ├── argocd/apps/kubevirt/      KubeVirt Operator + CDI (Kustomize)
  │     ├── virt-operator        Managed KubeVirt controller
  │     ├── virt-api             KubeVirt API extension
  │     ├── virt-controller      VirtualMachine lifecycle
  │     ├── virt-handler         Per-Node VM agent (DaemonSet, privileged)
  │     └── cdi-controller       Containerized Data Importer
  │
  └── argocd/apps/gameserver/    7DTD VirtualMachine (Helm)
        ├── DataVolume           40 Gi local-path (Ubuntu 22.04 cloud image)
        ├── SealedSecret         cloud-init userdata (Tailscale key + PW)
        └── VirtualMachine "7dtd-server"
              ├── tailscaled     eigene Tailnet-IP, tag:gameserver
              └── Docker → vinanrra/7dtd-server (--network host)
                    ├── 26900 TCP/UDP  7DTD Spiel
                    ├── 26901-26902 UDP  EAC / Erkennung
                    ├── 8080 TCP  Web-Dashboard (intern)
                    └── 8081 TCP  Telnet (intern)

Zugang:
  Kollegen → Tailscale Client → Node-Sharing → 100.x.x.x:26900
  7DTD Client: "Connect to IP" → Tailscale-IP der VM
```

**Warum KubeVirt statt direktem Pod?**
Tailscale Node-Sharing erfordert einen eigenständigen Tailscale-Node mit
eigener Identität. Eine VM mit `tailscaled` im Gast erfüllt das — ein
Kubernetes-Pod würde die Node-IP des k3s-Hosts teilen.

**Warum keine Ingress/Service/MetalLB?**
7DTD-Traffic läuft über den Tailscale-Tunnel der VM. Kein LAN-Port benötigt.

---

## Voraussetzungen

### Hardware-Virtualisation prüfen

```bash
ssh jaydee@192.168.178.127 'sudo virt-host-validate'
```

Erwartete Ausgabe (alles PASS oder WARN):
```
QEMU: Checking if device /dev/kvm exists                      : PASS
QEMU: Checking if device /dev/kvm is accessible               : PASS
QEMU: Checking if device /dev/vhost-net exists                : PASS
QEMU: Checking if device /net/tun exists                      : PASS
```

Falls `/dev/kvm` fehlt → Host läuft selbst in einer VM (Nested Virt). In
diesem Fall `useEmulation: true` in `argocd/apps/kubevirt/kubevirt-cr.yaml`
einkommentieren (Performance deutlich schlechter).

### tools installieren (lokal)

```bash
# kubeseal für Secret-Verschlüsselung
brew install kubeseal          # macOS
# oder: https://github.com/bitnami-labs/sealed-secrets/releases

# kubectl (Zugriff via SSH-Tunnel oder direkt falls kubeconfig lokal)
brew install kubectl
```

### Kubeseal-Zugang konfigurieren

```bash
# kubeconfig vom Server holen (einmalig):
ssh jaydee@192.168.178.127 'sudo cat /etc/rancher/k3s/k3s.yaml' \
  | sed 's/127.0.0.1/192.168.178.127/' > ~/.kube/homeserver.yaml
export KUBECONFIG=~/.kube/homeserver.yaml
```

---

## Erstdeploy

### Schritt 1: kubevirt-App deployen

```bash
git add argocd/apps/kubevirt/
git commit -m "feat(kubevirt): add KubeVirt operator + CDI"
git push
```

ArgoCD erkennt den neuen Ordner und synct innerhalb von ~3 Minuten. Der
ApplicationSet-Retry (5×, exponential backoff) konvergiert automatisch, da
die CRDs vor den CRs verfügbar werden.

KubeVirt-Status prüfen:

```bash
ssh jaydee@192.168.178.127 \
  'sudo kubectl -n kubevirt get kubevirt kubevirt -o jsonpath="{.status.phase}"'
# Erwartet: Deployed
```

CDI-Status prüfen:

```bash
ssh jaydee@192.168.178.127 \
  'sudo kubectl -n cdi get cdi cdi -o jsonpath="{.status.phase}"'
# Erwartet: Deployed
```

### Schritt 2: gameserver-App deployen (ohne Secret)

```bash
git add argocd/apps/gameserver/
git commit -m "feat(gameserver): add 7DTD VirtualMachine (halted)"
git push
```

ArgoCD synct. Da `sealedSecret.encryptedUserdata` leer ist, wird kein
SealedSecret gerendert. Die VM hat `runStrategy: Halted` und startet
noch nicht. Das ist beabsichtigt.

---

## Secrets versiegeln

Die cloud-init-Userdata enthält den **Tailscale Auth Key** und das
**7DTD-Server-Passwort** — beide müssen versiegelt werden, bevor die VM
starten kann.

### Schritt 1: cloud-init-Vorlage ausfüllen

Erstelle eine lokale Datei `/tmp/7dtd-userdata.yaml` mit folgendem Inhalt
(Platzhalter ersetzen):

```yaml
#cloud-config
hostname: 7dtd-server

package_update: true
package_upgrade: true

packages:
  - ca-certificates
  - curl
  - gnupg
  - unzip   # von der Gameserver-UI für Mod-Uploads benötigt (sudo unzip)

runcmd:
  # Docker Engine installieren
  - install -m 0755 -d /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  - chmod a+r /etc/apt/keyrings/docker.asc
  - |
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
    https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  - apt-get update -qq
  - apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

  # Tailscale installieren via APT (signiertes Repository, kein curl-pipe-sh)
  - curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/jammy.noarmor.gpg -o /usr/share/keyrings/tailscale-archive-keyring.gpg
  - curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/jammy.tailscale-keyring.list -o /etc/apt/sources.list.d/tailscale.list
  - apt-get update -qq
  - apt-get install -y tailscale
  - >-
    tailscale up
    --authkey=DEIN_TAILSCALE_AUTHKEY
    --advertise-tags=tag:gameserver
    --hostname=7dtd-server

  # Datenverzeichnis anlegen (mods → Bind-Mount für Gameserver-UI-Uploads)
  - mkdir -p /opt/7dtd/data /opt/7dtd/config /opt/7dtd/mods

  # Server-Konfiguration schreiben (serverconfig.xml)
  # ACHTUNG: Der folgende Block ist hier GEKÜRZT dargestellt. Da diese Datei als
  # configfile gemountet wird (-> serverfiles/sdtdserver.xml), MUSS sie die
  # VOLLSTÄNDIGE 7DTD-serverconfig enthalten (~98 Properties) — ein Minimal-Auszug
  # bringt 7DTD beim Start zum Absturz ("double fault"). Vor dem Versiegeln daher
  # die komplette Config einsetzen (Basis: vom Image generierte
  # serverfiles/sdtdserver.xml; eigene Werte inkl. EACEnabled=false überlagern).
  # Details/Seeding: Troubleshooting "Server-Config & Gameserver-UI".
  - |
    cat > /opt/7dtd/config/serverconfig.xml << 'XMLEOF'
    <?xml version="1.0"?>
    <ServerSettings>
      <property name="ServerName"         value="Home 7DTD Server"/>
      <property name="ServerDescription"  value="Private Server"/>
      <property name="ServerPassword"     value="DEIN_SERVERPASSWORT"/>
      <property name="ServerMaxPlayerCount" value="8"/>
      <property name="GameWorld"          value="Navezgane"/>
      <property name="GameName"           value="HomeGame"/>
      <property name="GameMode"           value="GameModeSurvival"/>
      <property name="ServerPort"         value="26900"/>
      <property name="ControlPanelEnabled" value="true"/>
      <property name="ControlPanelPort"   value="8080"/>
      <property name="ControlPanelPassword" value="DEIN_WEBADMIN_PASSWORT"/>
      <property name="TelnetEnabled"      value="true"/>
      <property name="TelnetPort"         value="8081"/>
      <!-- LEER lassen: die Gameserver-UI spricht Telnet über einen SSH-Tunnel
           (= localhost), und 7DTD erlaubt localhost-Telnet ohne Passwort. Ein
           nicht-leeres TelnetPassword bricht die UI, SOFERN es nicht exakt dem
           gameserver-ui `TELNET_PASSWORD`-Secret entspricht. Siehe Troubleshooting. -->
      <property name="TelnetPassword"     value=""/>
    </ServerSettings>
    XMLEOF

  # docker-compose.yml schreiben
  - |
    cat > /opt/7dtd/docker-compose.yml << 'COMPOSEEOF'
    services:
      7dtd-server:
        # PFLICHT: Vor dem Versiegeln einen fixen Tag setzen (z.B. 1.0).
        # :stable ist ein floating tag — VM-Rebuild zieht unbekannte Version
        # und kann Spielstände beschädigen. Tags: https://hub.docker.com/r/vinanrra/7dtd-server/tags
        image: vinanrra/7dtd-server:stable
        container_name: 7dtd-server
        network_mode: host
        restart: unless-stopped
        environment:
          - START_MODE=1
          - PUID=1000
          - PGID=1000
          - TimeZone=Europe/Berlin
        volumes:
          # serverfiles MUSS ein benanntes Volume sein (nicht das anonyme Image-Volume):
          # sonst legt jedes `docker compose up -d` nach einer Config-Änderung ein
          # frisches leeres serverfiles an → SteamCMD lädt die komplette ~16-GB-
          # Installation neu. Ein benanntes Volume überlebt Recreates.
          - serverfiles:/home/sdtdserver/serverfiles
          - /opt/7dtd/data:/home/sdtdserver/.local/share/7DaysToDie
          # serverconfig: MUSS auf serverfiles/sdtdserver.xml zeigen — das ist die
          # Datei, die 7DTD per `-configfile=` liest UND die die Gameserver-UI
          # (/api/config) editiert. NICHT auf einen sdtdserver/-Unterordner mappen
          # (der wird nie gelesen → Custom-Config/EAC bleiben wirkungslos).
          # ACHTUNG: die gemountete Datei MUSS eine VOLLSTÄNDIGE 7DTD-serverconfig
          # sein (~98 Properties). Ein Minimal-Auszug bringt 7DTD beim Start zum
          # Absturz ("double fault"). Seeding-Prozedur siehe Troubleshooting.
          - /opt/7dtd/config/serverconfig.xml:/home/sdtdserver/serverfiles/sdtdserver.xml
          # Mods-Bind-Mount: Gameserver-UI entpackt Uploads nach /opt/7dtd/mods;
          # 7DTD lädt sie aus serverfiles/Mods beim Container-Neustart (vinanrra "Manual Mods").
          # ACHTUNG: dieser Mount ÜBERDECKT serverfiles/Mods komplett — die Stock-TFP-Mods
          # (0_TFP_Harmony u.a., für DLL-Mods zwingend) müssen daher EINMALIG nach dem
          # ersten Install nach /opt/7dtd/mods kopiert werden (siehe Gotcha unten).
          - /opt/7dtd/mods:/home/sdtdserver/serverfiles/Mods
    volumes:
      serverfiles:
    COMPOSEEOF

  # 7DTD starten
  - cd /opt/7dtd && docker compose up -d

  # Täglicher Neustart gegen Memory-Leak (04:00 Uhr lokale Zeit)
  - echo "0 4 * * * root docker restart 7dtd-server" > /etc/cron.d/7dtd-restart
  - chmod 644 /etc/cron.d/7dtd-restart
```

> **Hinweis**: Ersetze `DEIN_TAILSCALE_AUTHKEY`, `DEIN_SERVERPASSWORT`,
> `DEIN_WEBADMIN_PASSWORT` und `DEIN_TELNET_PASSWORT` mit echten Werten,
> bevor du versiegelst.
>
> **Sicherheit**: Lösche `/tmp/7dtd-userdata.yaml` nach dem Versiegeln:
> `shred -u /tmp/7dtd-userdata.yaml`. Die Datei enthält Passwörter im Klartext.

### Schritt 2: Tailscale Auth Key erzeugen

1. Tailscale Admin Console → **Keys** → **Generate auth key**
2. Optionen:
   - **Reusable**: ✅ (reusable — single-use Keys können bei cloud-init-Fehlern nicht wiederholt werden; Expiry auf 90 Tage setzen)
   - **Ephemeral**: ❌ (VM soll dauerhaft im Tailnet bleiben)
   - **Pre-authorized**: ✅
   - **Tags**: `tag:gameserver`
3. Key kopieren → in die Vorlage einsetzen

### Schritt 3: cloud-init versiegeln

```bash
export KUBECONFIG=~/.kube/homeserver.yaml

printf '%s' "$(cat /tmp/7dtd-userdata.yaml)" | kubeseal --raw \
  --namespace gameserver \
  --name gameserver-cloudinit \
  --controller-name sealed-secrets-controller \
  --controller-namespace sealed-secrets \
  --from-file=/dev/stdin
```

Die Ausgabe ist ein langer `AgB...`-String.

### Schritt 4: Sealed-Wert in values.yaml eintragen

```yaml
# argocd/apps/gameserver/values.yaml
sealedSecret:
  secretName: gameserver-cloudinit
  encryptedUserdata: "AgB...der-lange-string-von-kubeseal..."
```

Committen + pushen:

```bash
git add argocd/apps/gameserver/values.yaml
git commit -m "feat(gameserver): seal cloud-init secret"
git push
```

---

## VM starten

Nachdem das SealedSecret eingetragen ist und ArgoCD die App gesynct hat,
verwalten die **CronJobs** den VM-Lebenszyklus automatisch. `runStrategy: Halted`
bleibt der Git-Default — ArgoCD ignoriert Laufzeit-Abweichungen dieses Felds
(`ignoreDifferences` in `root-applicationset.yaml`).

**Sofortstart (on-demand):**

```bash
# VM starten:
ssh jaydee@192.168.178.127 \
  'sudo kubectl patch vm 7dtd-server -n gameserver --type merge \
   -p '"'"'{"spec":{"runStrategy":"Always"}}'"'"''

# VM stoppen:
ssh jaydee@192.168.178.127 \
  'sudo kubectl patch vm 7dtd-server -n gameserver --type merge \
   -p '"'"'{"spec":{"runStrategy":"Halted"}}'"'"''
```

**Geplanter Betrieb:** Die CronJobs starten die VM jeden Mittwoch um 20:00 Uhr
und stoppen sie um 00:00 Uhr (Donnerstag) automatisch — kein manueller Eingriff
nötig. Siehe [Zeitplan & Scheduling](#zeitplan--scheduling).

Nach dem Start läuft cloud-init durch (~5–10 Minuten für Pakete + 7DTD-Download).

### VM-Status verfolgen

```bash
# VirtualMachineInstance (laufende VM) prüfen
ssh jaydee@192.168.178.127 \
  'sudo kubectl -n gameserver get vmi 7dtd-server'

# Serielle Konsole für cloud-init-Debugging (virtctl lokal installieren: brew install virtctl)
export KUBECONFIG=~/.kube/homeserver.yaml
virtctl -n gameserver console 7dtd-server

# Alternativ: SSH in die VM (nach cloud-init abgeschlossen)
ssh ubuntu@$(sudo kubectl -n gameserver get vmi 7dtd-server \
  -o jsonpath="{.status.interfaces[0].ipAddress}")
```

### 7DTD-Container-Logs

```bash
# via SSH in die VM:
ssh ubuntu@<VM-IP> 'docker logs -f 7dtd-server'
```

---

## Tailscale Node-Sharing

### VM-Tailscale-IP ermitteln

Nach dem Start erscheint `7dtd-server` in der Tailscale Admin Console unter
**Machines** mit einer `100.x.x.x`-IP. Diese IP ist der Verbindungspunkt
für alle Kollegen.

### ACL konfigurieren (Tailscale Admin Console)

1. **Admin Console → Access Controls**
2. Tag `gameserver` in `tagOwners` eintragen (du als Owner):

```json
"tagOwners": {
  "tag:gameserver": ["autogroup:admin"]
},
```

3. Grant für Node-Sharing-Kollegen (erlaubt nur 7DTD-Ports):

```json
"grants": [
  {
    "src": ["autogroup:shared"],
    "dst": ["tag:gameserver"],
    "ip": [
      {"proto": "tcp", "ports": ["26900"]},
      {"proto": "udp", "ports": ["26900", "26901", "26902"]}
    ]
  }
]
```

### Node mit Kollegen teilen

1. **Admin Console → Machines → 7dtd-server → ⋮ → Share**
2. E-Mail-Adresse des Kollegen eingeben
3. Kollege akzeptiert die Einladung in seinem Tailscale-Client
4. `7dtd-server` erscheint in seinem Gerätemenü

### Verbindung im 7DTD-Client (Kollegen)

1. Tailscale installieren und mit dem eigenen Account verbinden
2. 7 Days to Die → **Join Game** → **Connect to IP**
3. IP: Tailscale-IP der VM (100.x.x.x), Port: 26900
4. Server-Passwort eingeben

---

## 7DTD im Browser-Dashboard

Das Web-Dashboard (Port 8080) ist nur innerhalb der VM erreichbar. Für
Zugriff über Tailscale:

```bash
# SSH-Tunnel von lokal zur VM (über den Homeserver als Jump-Host):
ssh -L 8080:localhost:8080 \
  -J jaydee@192.168.178.127 \
  ubuntu@<VM-Tailscale-IP>

# Browser öffnen:
open http://localhost:8080
```

---

## Zeitplan & Scheduling

Der Gameserver läuft **nur mittwochs von 20:00–00:00 Uhr** (Europe/Berlin).
Zwei Kubernetes-CronJobs steuern den VM-Lebenszyklus:

| CronJob | Schedule | Aktion |
|---------|----------|--------|
| `gameserver-start` | `0 20 * * 3` (Mi 20:00) | `runStrategy: Always` |
| `gameserver-stop` | `0 0 * * 4` (Do 00:00) | `runStrategy: Halted` |

```bash
# Status prüfen:
ssh jaydee@192.168.178.127 \
  'sudo kubectl -n gameserver get cronjobs'
```

### On-Demand-Betrieb

```bash
# VM außerhalb des Zeitplans starten:
ssh jaydee@192.168.178.127 \
  'sudo kubectl patch vm 7dtd-server -n gameserver --type merge \
   -p '"'"'{"spec":{"runStrategy":"Always"}}'"'"''

# VM manuell stoppen:
ssh jaydee@192.168.178.127 \
  'sudo kubectl patch vm 7dtd-server -n gameserver --type merge \
   -p '"'"'{"spec":{"runStrategy":"Halted"}}'"'"''
```

### Täglicher Docker-Neustart (Memory-Leak)

7DTD hat ein bekanntes Memory-Leak. Cloud-init richtet in der VM einen
Cron-Job ein:

```bash
# /etc/cron.d/7dtd-restart (in der VM):
0 4 * * * root docker restart 7dtd-server
```

Der Neustart um 04:00 Uhr lokaler Zeit dauert ca. 2 Minuten. Da der
Kubernetes-CronJob die VM bereits um 00:00 Uhr stoppt, greift dieser
VM-interne Cron nur wenn die VM außerhalb des Zeitplans läuft.

### Zeitplan anpassen

```yaml
# argocd/apps/gameserver/values.yaml
schedule:
  enabled: true
  timezone: Europe/Berlin
  start: "0 20 * * 3"   # Mittwoch 20:00
  stop: "0 0 * * 4"     # Donnerstag 00:00
  kubectlImage: "bitnami/kubectl:1.31"
```

Commit + Push → ArgoCD synct die neuen CronJob-Schedules.

---

## Backup

Spielstände liegen in der VM unter `/opt/7dtd/data/`. Optionales Backup
auf die UGREEN NAS:

```bash
# In der VM: rsync in Cron
# Oder: SMB-Mount (nutzt dasselbe Muster wie der Scanner):
# /etc/fstab in der VM:
# //jays-ugreen/backup  /mnt/nas  cifs  credentials=/etc/nas-creds,uid=1000  0  0

# Cron für nächtliches Backup (03:30, vor dem 04:00 Neustart):
# 30 3 * * * rsync -az /opt/7dtd/data/ /mnt/nas/7dtd-backup/
```

Die Backup-Konfiguration wird als zusätzlicher cloud-init-Block eingebaut
(gesiegeltes Secret neu erstellen).

---

## Troubleshooting

### VM startet nicht (`runStrategy: Always` gesetzt, aber kein VMI)

```bash
ssh jaydee@192.168.178.127 \
  'sudo kubectl -n gameserver describe vm 7dtd-server'
# Häufige Ursache: gameserver-cloudinit Secret fehlt (encryptedUserdata leer)
```

### DataVolume hängt bei "ImportInProgress"

```bash
ssh jaydee@192.168.178.127 \
  'sudo kubectl -n gameserver describe datavolume 7dtd-os-disk'
# Import-Pod prüfen:
ssh jaydee@192.168.178.127 \
  'sudo kubectl -n gameserver get pods -l app=containerized-data-importer'
```

Download dauert je nach Internetanbindung 5–15 Minuten.

### KubeVirt-Status nicht "Deployed"

```bash
ssh jaydee@192.168.178.127 \
  'sudo kubectl -n kubevirt get kubevirt kubevirt -o yaml | tail -40'
# "Deploying" ist normal für 3–5 Minuten nach dem ersten Sync.
# Falls "error": virt-handler-DaemonSet-Logs prüfen:
ssh jaydee@192.168.178.127 \
  'sudo kubectl -n kubevirt logs -l kubevirt.io=virt-handler --tail=50'
```

### Tailscale verbindet sich nicht (cloud-init)

```bash
# VM-Konsole öffnen:
ssh jaydee@192.168.178.127 \
  'sudo kubectl -n gameserver exec -it $(sudo kubectl -n gameserver \
   get pods -l kubevirt.io=virt-launcher -o name | head -1) -- \
   /bin/bash -c "cat /var/log/cloud-init-output.log"'
# Häufige Ursachen:
# - Auth Key abgelaufen → neuen Key erzeugen + cloud-init neu versiegeln
# - tag:gameserver noch nicht in tagOwners → ACL prüfen
```

### 7DTD-Container startet nicht nach cloud-init

```bash
# In der VM:
docker logs 7dtd-server
docker ps -a
# Typische Ursache: 7DTD-Download (SteamCMD) dauert sehr lange (~30 min)
# START_MODE=1 → kein erneuter Download, aber AppID 294420 muss installiert sein
```

### VM-IP für SSH ermitteln

```bash
ssh jaydee@192.168.178.127 \
  'sudo kubectl -n gameserver get vmi 7dtd-server \
   -o jsonpath="{.status.interfaces[*].ipAddress}"'
# Gibt die pod-interne IP zurück — besser: Tailscale-IP aus der Admin Console
```

### Mod-Upload (Gameserver-UI) + serverfiles-Persistenz

Der Mod-Upload der Gameserver-UI (`docs/20-gameserver-ui.md`) entpackt Zips per
`sudo unzip` nach `/opt/7dtd/mods`; 7DTD lädt aus `serverfiles/Mods`. Drei
VM-seitige Voraussetzungen:

1. **`unzip` installiert** (in `packages:` oben). Sonst `502: unzip: command not found`.
2. **`serverfiles` ist ein benanntes Volume.** Liegt die Spielinstallation im
   anonymen Image-Volume, erzeugt jedes `docker compose up -d` nach einer
   Config-Änderung ein leeres serverfiles → **kompletter ~16-GB-Redownload**.
   Recovery ohne Redownload, falls das alte Volume noch existiert:
   ```bash
   sudo docker volume ls   # das ~16-GB-Volume ist die alte Installation
   # in /opt/7dtd/docker-compose.yml serverfiles als external pinnen:
   #   volumes: { serverfiles: { external: true, name: <alte-volume-id> } }
   cd /opt/7dtd && sudo docker compose up -d
   ```
3. **Stock-TFP-Mods einmalig nach `/opt/7dtd/mods` seeden.** Der Bind-Mount
   `/opt/7dtd/mods → serverfiles/Mods` überdeckt die mitgelieferten Mods
   (`0_TFP_Harmony` — zwingend für DLL-Mods —, `TFP_CommandExtensions`,
   `TFP_MapRendering`, `TFP_WebServer`, `Xample_MarkersMod`). Nach dem ersten
   Install einmalig:
   ```bash
   sudo cp -an /var/lib/docker/volumes/<serverfiles-vol>/_data/Mods/. /opt/7dtd/mods/
   ```
   Verifikation im Log: `[MODS] Loaded Mod: TFP_Harmony` **und** der eigene Mod
   (`docker logs 7dtd-server | grep '\[MODS\] Loaded Mod'`).

### Server-Config & Gameserver-UI: Änderungen wirken nicht / EAC bleibt an

**Symptom:** In der Gameserver-UI (`/config`) oder direkt in
`/opt/7dtd/config/serverconfig.xml` gesetzte Werte (z. B. `EACEnabled=false`,
ServerName, Multiplikatoren) haben keinen Effekt — der Server läuft mit
Stock-Defaults (z. B. EAC an, ServerName „My Game Host").

**Ursache:** Zwei verkettete Fehler:

1. **Falscher Mount-Pfad.** 7DTD startet mit
   `-configfile=/home/sdtdserver/serverfiles/sdtdserver.xml`. Wurde
   `/opt/7dtd/config/serverconfig.xml` fälschlich nach
   `serverfiles/sdtdserver/serverconfig.xml` (Unterordner) gemountet, liest der
   Server die Datei nie. Prüfen:
   ```bash
   docker exec 7dtd-server sh -c "tr '\0' '\n' < /proc/\$(pgrep -f 7DaysToDieServer|head -1)/cmdline | grep configfile"
   docker inspect 7dtd-server --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
   ```
   Mount-Ziel muss exakt `…/serverfiles/sdtdserver.xml` sein.
2. **Unvollständige Config crasht.** Wird die gemountete Datei als configfile
   genutzt, MUSS sie vollständig sein (~98 Properties). Ein Minimal-Auszug →
   `Exiting early due to double fault` beim Start.

Die Gameserver-UI (`/api/config`) liest/schreibt `/opt/7dtd/config/serverconfig.xml`
und macht danach `docker restart`. Zeigt der Mount korrekt auf `sdtdserver.xml`
**und** ist die Datei vollständig, landen UI-Änderungen sofort in der aktiven
Config.

**Seeding/Fix (einmalig):**
```bash
# 1. Vollständige Basis = die laufende Config des Servers
docker exec 7dtd-server cat /home/sdtdserver/serverfiles/sdtdserver.xml > /tmp/base.xml
# 2. Eigene Werte überlagern (EAC aus + ServerName etc.), Struktur vollständig lassen:
#    z. B. python3-Merge value-genau (name="X" → value="…"), EACEnabled=false erzwingen
#    -> Ergebnis nach /opt/7dtd/config/serverconfig.xml schreiben (≈98 Properties behalten!)
# 3. Mount-Pfad in docker-compose.yml auf serverfiles/sdtdserver.xml korrigieren
# 4. cd /opt/7dtd && docker compose up -d   (serverfiles ist gepinntes Volume → kein Redownload)
```
Verifikation (Laufzeit, nicht nur Datei): `GamePref.EACEnabled = False` und kein
`[EAC] Starting EAC server` im aktuellen Boot:
```bash
S=$(docker inspect -f '{{.State.StartedAt}}' 7dtd-server)
docker logs --since "$S" 7dtd-server | grep -iE 'GamePref.EACEnabled|\[EAC\]'
```

**Achtung TelnetPassword:** Die Gameserver-UI (`/api/version`, `/api/gametime`,
Restart via Telnet `lp`/`saveworld`) verbindet sich über einen SSH-Tunnel —
also als **localhost**. 7DTD erlaubt localhost-Telnet **ohne** Passwort, wenn
`TelnetPassword` leer ist. Ist es **nicht leer und ≠ dem gameserver-ui
`TELNET_PASSWORD`-Secret**, schlägt die Telnet-Auth fehl → `/api/version` &
Restart liefern `502 "Telnet timeout"`, obwohl Port 8081 lauscht. Lösung:
`TelnetPassword` leer lassen (localhost-bypass) **oder** in serverconfig und
gameserver-ui-Secret denselben Wert setzen. Prüfen (per Hash, ohne Klartext):
```bash
# Secret:
kubectl -n gameserver-ui get secret gameserver-ui-telnet -o jsonpath='{.data.password}' | base64 -d | sha256sum
# serverconfig:
docker exec 7dtd-server grep -oP 'TelnetPassword"\s*value="\K[^"]*' /home/sdtdserver/serverfiles/sdtdserver.xml | tr -d '\n' | sha256sum
```
