# 7 Days to Die Gameserver

Dedizierter 7DTD-Server für bis zu 8 Spieler in einer KubeVirt-VM. Die VM ist ein eigener Tailscale-Node; Freunde
bekommen ihn per Node-Sharing, ein Port ins Internet ist nicht offen.

| | |
|---|---|
| Spiel | `<tailscale-ip-der-vm>:26900` |
| Verwaltung | [Gameserver-UI](20-gameserver-ui.md), http://gameserver.homeserver |
| Namespace | `gameserver` (VM), `kubevirt`, `cdi` (Operatoren) |
| Quelle | [`argocd/apps/gameserver/`](../argocd/apps/gameserver/) (Helm), [`argocd/apps/kubevirt/`](../argocd/apps/kubevirt/) (Kustomize) |
| Versionen | KubeVirt v1.9.1, CDI v1.66.1 (Renovate, `kustomization.yaml`) |

## Architektur

```text
argocd/apps/kubevirt     virt-operator/-api/-controller/-handler, CDI
argocd/apps/gameserver
  ├─ DataVolume 7dtd-os-disk    40Gi local-path, Ubuntu 22.04 Cloud-Image
  ├─ SealedSecret gameserver-cloudinit   komplette cloud-init-Userdata
  ├─ CronJobs gameserver-start/-stop     patchen runStrategy
  └─ VirtualMachine 7dtd-server          4 Kerne, 10Gi RAM, feste MAC
       ├─ tailscaled (tag:gameserver)
       └─ Docker: vinanrra/7dtd-server, network_mode host
            26900 TCP/UDP Spiel · 26901-26902 UDP · 8080 Web-Dashboard · 8081 Telnet
```

Ein Pod reicht nicht, weil Node-Sharing einen eigenen Tailscale-Node mit eigener Identität verlangt.
Service, Ingress und MetalLB gibt es deshalb nicht. Die feste MAC (`vm.macAddress`) hält das netplan-Match aus dem
ersten Boot gültig; ohne sie bliebe `enp1s0` nach einem neuen VMI ohne Netz. 10Gi RAM sind gesetzt, weil 7DTD 8Gi
ausschöpfte und der OOM-Killer `tailscaled` traf.

## Konfiguration

| Wert in `values.yaml` | Default | Zweck |
|---|---|---|
| `vm.runStrategy` | `Halted` | Startzustand; danach steuern CronJobs und UI, ArgoCD ignoriert das Feld |
| `vm.cpu.cores` / `vm.memory.guest` | `4` / `10Gi` | Ressourcen der VM |
| `dataVolume.size` | `40Gi` | OS, Docker und Spieldateien (ca. 30 GB) |
| `schedule.start` / `schedule.stop` | `0 20 * * 3` / `0 0 * * 4` | Mittwoch 20:00 bis Donnerstag 00:00, `Europe/Berlin` |
| `schedule.kubectlImage` | `rancher/kubectl:v1.36.2` | Image der CronJobs |
| `sealedSecret.encryptedUserdata` | gesetzt | versiegelte cloud-init-Userdata |

Ist `vm.runStrategy: Always` gesetzt und `encryptedUserdata` leer, bricht das Rendern mit `fail` ab.

## Voraussetzungen

Der Host braucht `/dev/kvm`. Vor dem ersten Sync prüfen:

```bash
sudo virt-host-validate
```

`argocd/apps/kubevirt/` muss vor `argocd/apps/gameserver/` konvergieren. Das erledigt der ApplicationSet-Retry,
erste Sync-Fehler sind normal.

## Secrets versiegeln

Die Userdata enthalten den Tailscale-Auth-Key und die Server-Passwörter und liegen deshalb vollständig im
SealedSecret. Jede Änderung heißt: Vorlage anpassen, neu sealen, `values.yaml` aktualisieren.

Den Auth-Key in der Tailscale Admin Console erzeugen: reusable (Ablauf 90 Tage, damit ein fehlgeschlagenes
cloud-init wiederholbar ist), nicht ephemeral, pre-authorized, Tag `tag:gameserver`.

Vorlage (`/tmp/7dtd-userdata.yaml`, Platzhalter ersetzen):

```yaml
#cloud-config
hostname: 7dtd-server
package_update: true
package_upgrade: true
packages: [ca-certificates, curl, gnupg, unzip]   # unzip für Mod-Uploads der Gameserver-UI
ssh_authorized_keys:
  - <public key aus gameserver-ui-ssh>             # SSH-Zugang der Gameserver-UI

runcmd:
  # Docker Engine
  - install -m 0755 -d /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  - chmod a+r /etc/apt/keyrings/docker.asc
  - |
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
    https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  - apt-get update -qq
  - apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

  # Tailscale aus dem signierten APT-Repo
  - curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/jammy.noarmor.gpg -o /usr/share/keyrings/tailscale-archive-keyring.gpg
  - curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/jammy.tailscale-keyring.list -o /etc/apt/sources.list.d/tailscale.list
  - apt-get update -qq
  - apt-get install -y tailscale
  - tailscale up --authkey=DEIN_TAILSCALE_AUTHKEY --advertise-tags=tag:gameserver --hostname=7dtd-server

  - mkdir -p /opt/7dtd/data /opt/7dtd/config /opt/7dtd/mods

  # serverconfig.xml: hier gekürzt. Die Datei MUSS die vollständige 7DTD-Config (~98 Properties) enthalten,
  # siehe Fallstricke. TelnetPassword leer lassen.
  - |
    cat > /opt/7dtd/config/serverconfig.xml << 'XMLEOF'
    <?xml version="1.0"?>
    <ServerSettings>
      <property name="ServerName"           value="Home 7DTD Server"/>
      <property name="ServerPassword"       value="DEIN_SERVERPASSWORT"/>
      <property name="ServerMaxPlayerCount" value="8"/>
      <property name="ServerPort"           value="26900"/>
      <property name="EACEnabled"           value="false"/>
      <property name="ControlPanelEnabled"  value="true"/>
      <property name="ControlPanelPort"     value="8080"/>
      <property name="ControlPanelPassword" value="DEIN_WEBADMIN_PASSWORT"/>
      <property name="TelnetEnabled"        value="true"/>
      <property name="TelnetPort"           value="8081"/>
      <property name="TelnetPassword"       value=""/>
      <!-- ... alle übrigen Properties ... -->
    </ServerSettings>
    XMLEOF

  - |
    cat > /opt/7dtd/docker-compose.yml << 'COMPOSEEOF'
    services:
      7dtd-server:
        image: vinanrra/7dtd-server:<fester-tag>   # kein :stable, ein Rebuild zöge sonst eine unbekannte Version
        container_name: 7dtd-server
        network_mode: host
        restart: unless-stopped
        environment: [START_MODE=1, PUID=1000, PGID=1000, TimeZone=Europe/Berlin]
        volumes:
          - serverfiles:/home/sdtdserver/serverfiles     # benanntes Volume, sonst ~16 GB Redownload
          - /opt/7dtd/data:/home/sdtdserver/.local/share/7DaysToDie
          - /opt/7dtd/config/serverconfig.xml:/home/sdtdserver/serverfiles/sdtdserver.xml
          - /opt/7dtd/mods:/home/sdtdserver/serverfiles/Mods
    volumes:
      serverfiles:
    COMPOSEEOF

  - cd /opt/7dtd && docker compose up -d
  # täglicher Neustart gegen das Memory-Leak von 7DTD
  - echo "0 4 * * * root docker restart 7dtd-server" > /etc/cron.d/7dtd-restart
  - chmod 644 /etc/cron.d/7dtd-restart
```

Sealen und die Klartextdatei löschen:

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubeseal --raw --namespace gameserver --name gameserver-cloudinit \
   --controller-name sealed-secrets-controller --controller-namespace sealed-secrets \
   --from-file=/dev/stdin' < /tmp/7dtd-userdata.yaml
shred -u /tmp/7dtd-userdata.yaml
```

Die Ausgabe (`AgB…`) als `sealedSecret.encryptedUserdata` eintragen und per PR mergen.

## Betrieb

Die CronJobs starten die VM mittwochs um 20:00 und stoppen sie um 00:00. Außerhalb davon per Gameserver-UI oder:

```bash
sudo kubectl patch vm 7dtd-server -n gameserver --type merge -p '{"spec":{"runStrategy":"Always"}}'   # starten
sudo kubectl patch vm 7dtd-server -n gameserver --type merge -p '{"spec":{"runStrategy":"Halted"}}'   # stoppen
sudo kubectl -n gameserver get vm,vmi,cronjobs
sudo kubectl -n gameserver describe datavolume 7dtd-os-disk    # Import des Cloud-Images
```

Der erste Boot dauert mit Paketen und SteamCMD-Download deutlich länger als ein normaler Start. Der VM-interne
Neustart um 04:00 greift nur, wenn die VM außerhalb des Zeitplans läuft.

Zugriff in die VM:

```bash
virtctl -n gameserver console 7dtd-server        # lokal, mit kubeconfig des Servers
ssh ubuntu@<tailscale-ip-der-vm>                 # nach cloud-init
docker logs -f 7dtd-server                       # in der VM
cat /var/log/cloud-init-output.log               # in der VM, bei Tailscale-Problemen
```

Das Web-Dashboard auf Port 8080 ist nur in der VM erreichbar:

```bash
ssh -L 8080:localhost:8080 -J jaydee@192.168.178.127 ubuntu@<tailscale-ip-der-vm>
```

## Tailscale-Freigabe

In der Tailnet-Policy `tag:gameserver` in `tagOwners` eintragen und den Sharees nur die Spielports erlauben:

```json
"tagOwners": { "tag:gameserver": ["autogroup:admin"] },
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

Greift der Tag-Grant bei Sharees nicht, die Tailscale-IP der VM als `dst` eintragen (siehe Gotchas). Teilen: Admin
Console > Machines > `7dtd-server` > Share. Die Freunde verbinden sich im Spiel über Join Game > Connect to IP mit
der Tailscale-IP der VM, Port 26900, und dem Server-Passwort.

## Backup

Spielstände liegen in der VM unter `/opt/7dtd/data/Saves`. Die Seite Backups der [Gameserver-UI](20-gameserver-ui.md)
packt sie per SSH als `tar.gz` auf den NAS-Share `//jays-ugreen/gameserver-data` (Ordner `backups/`), behält die
sieben neuesten und spielt sie auch zurück. Das geht nur bei laufender VM. Das nächtliche restic-Backup des Hosts
lässt die OS-Disk der VM bewusst aus ([Backup](26-backup.md)).

## Fallstricke

Die Themen KVM, AppArmor, Bootstrap-Reihenfolge, `runStrategy` und Tailscale-Tags stehen in
[Gotchas: KubeVirt / Gameserver](gotchas.md#kubevirt--gameserver). Dazu kommen:

- Die Server-Config muss vollständig sein und am richtigen Pfad liegen. 7DTD liest
  `-configfile=/home/sdtdserver/serverfiles/sdtdserver.xml`. Ein Mount auf einen anderen Pfad wird ignoriert (Werte
  wie `EACEnabled=false` wirken dann nicht), und eine unvollständige Datei bricht den Start mit
  `Exiting early due to double fault` ab. Abhilfe: die laufende Config als Basis nehmen
  (`docker exec 7dtd-server cat /home/sdtdserver/serverfiles/sdtdserver.xml`), eigene Werte einsetzen, nach
  `/opt/7dtd/config/serverconfig.xml` schreiben, `docker compose up -d`. Prüfen:
  `docker logs --since "$(docker inspect -f '{{.State.StartedAt}}' 7dtd-server)" 7dtd-server | grep -iE 'GamePref.EACEnabled|\[EAC\]'`.
- `TelnetPassword` leer lassen. Die UI spricht Telnet über SSH-Tunnel als localhost, und 7DTD lässt localhost ohne
  Passwort zu. Ein Passwort, das nicht exakt dem Secret `gameserver-ui-telnet` entspricht, führt zu
  `502 "Telnet timeout"`.
- Der Mods-Bind-Mount überdeckt `serverfiles/Mods` samt den mitgelieferten Mods (`0_TFP_Harmony` ist für DLL-Mods
  Pflicht). Nach dem ersten Install einmal kopieren:
  `sudo cp -an /var/lib/docker/volumes/<serverfiles-vol>/_data/Mods/. /opt/7dtd/mods/`. Neue Mounts greifen erst
  nach `docker compose up -d`, ein `restart` reicht nicht.
- Ist `serverfiles` versehentlich ein anonymes Volume, legt jedes `docker compose up -d` eine leere Installation an.
  Das alte Volume (`sudo docker volume ls`, ca. 16 GB) lässt sich in der Compose-Datei als
  `serverfiles: { external: true, name: <volume-id> }` wieder einhängen.
