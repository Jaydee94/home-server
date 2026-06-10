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
8. [Täglicher Neustart](#täglicher-neustart)
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

  # Tailscale installieren und verbinden
  - curl -fsSL https://tailscale.com/install.sh | sh
  - >-
    tailscale up
    --authkey=DEIN_TAILSCALE_AUTHKEY
    --advertise-tags=tag:gameserver
    --hostname=7dtd-server

  # Datenverzeichnis anlegen
  - mkdir -p /opt/7dtd/data /opt/7dtd/config

  # Server-Konfiguration schreiben (serverconfig.xml)
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
      <property name="TelnetPassword"     value="DEIN_TELNET_PASSWORT"/>
    </ServerSettings>
    XMLEOF

  # docker-compose.yml schreiben
  - |
    cat > /opt/7dtd/docker-compose.yml << 'COMPOSEEOF'
    services:
      7dtd-server:
        # renovate: docker depName=vinanrra/7dtd-server
        image: vinanrra/7dtd-server:latest
        container_name: 7dtd-server
        network_mode: host
        restart: unless-stopped
        environment:
          - START_MODE=1
          - PUID=1000
          - PGID=1000
          - TimeZone=Europe/Berlin
        volumes:
          - /opt/7dtd/data:/home/sdtdserver/.local/share/7DaysToDie
          - /opt/7dtd/config/serverconfig.xml:/home/sdtdserver/serverfiles/sdtdserver/serverconfig.xml
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

### Schritt 2: Tailscale Auth Key erzeugen

1. Tailscale Admin Console → **Keys** → **Generate auth key**
2. Optionen:
   - **Reusable**: ❌ (single-use ist sicherer für eine VM)
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

Nachdem das SealedSecret eingetragen ist, `runStrategy` auf `Always` setzen:

```yaml
# argocd/apps/gameserver/values.yaml
vm:
  runStrategy: Always
```

```bash
git add argocd/apps/gameserver/values.yaml
git commit -m "feat(gameserver): start VM (runStrategy: Always)"
git push
```

ArgoCD synct die Änderung. Die VM startet, cloud-init läuft durch (~5–10
Minuten für Pakete + 7DTD-Download).

### VM-Status verfolgen

```bash
# VirtualMachineInstance (laufende VM) prüfen
ssh jaydee@192.168.178.127 \
  'sudo kubectl -n gameserver get vmi 7dtd-server'

# VNC-Konsole (SPICE) für cloud-init-Debugging
ssh jaydee@192.168.178.127 \
  'sudo kubectl -n gameserver exec -it deploy/virt-api -- \
   virtctl console 7dtd-server'

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

## Täglicher Neustart

7DTD hat ein bekanntes Memory-Leak. Cloud-init richtet einen Cron-Job ein:

```bash
# /etc/cron.d/7dtd-restart (in der VM):
0 4 * * * root docker restart 7dtd-server
```

Der Neustart um 04:00 Uhr lokaler Zeit dauert ca. 2 Minuten. Spieler werden
zuvor nicht benachrichtigt — falls gewünscht, ein Gotify-Notify-Skript
ergänzen (z.B. via `telnet` an Port 8081 vor dem Restart).

### Manueller Neustart

```bash
# Via SSH in der VM:
docker restart 7dtd-server

# Oder direkt auf dem Host via kubectl exec:
ssh jaydee@192.168.178.127 \
  'sudo kubectl -n gameserver exec -it <virt-launcher-pod> -- \
   docker restart 7dtd-server'
```

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
