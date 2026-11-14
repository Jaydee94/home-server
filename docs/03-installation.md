# Installation

Ein Lauf von [`ansible/site.yml`](../ansible/site.yml) provisioniert den Server vom frischen Ubuntu bis zum laufenden Cluster, in dem ArgoCD alle Apps aus `argocd/apps/` ausrollt. Vorher muss alles aus [Voraussetzungen](02-prerequisites.md) erledigt sein.

## Konfigurieren

```bash
git clone https://github.com/Jaydee94/home-server.git && cd home-server
$EDITOR ansible/inventory/hosts.yml      # ansible_host, ansible_user
$EDITOR ansible/group_vars/all.yml
```

Die Gruppe `homeservers` im Inventory bekommt den kompletten Stack. `ugreen_nas` wird nur von `make nas` angesprochen, `semaphore_targets` bekommt den SSH-Key von Semaphore.

Pflichtwerte in [`all.yml`](../ansible/group_vars/all.yml) sind `timezone`, `argocd_repo_url`, `local_subnet` und die Vault-Werte aus [Voraussetzungen](02-prerequisites.md#vault). Die übrigen Defaults passen zum Referenz-Setup:

| Variable | Default | Zweck |
|---|---|---|
| `hostname` | `homeserver` | Hostname, k3s-Node-Name, Tailscale-Name |
| `auto_upgrade` | `true` | `apt dist-upgrade` bei jedem Lauf und `unattended-upgrades` zwischen den Läufen |
| `auto_reboot_if_required` | `true` | Reboot am Ende von `common`, wenn `/var/run/reboot-required` existiert. In Semaphore-Läufen übersprungen |
| `unattended_reboot_time` | `"05:00"` | Uhrzeit für den Reboot durch `unattended-upgrades` (`unattended_reboot_enabled`) |
| `ssh_hardening_enabled` | `true` | sshd nur mit Key, kein Root-Login, kein X11 |
| `k3s_version`, `helm_version` | gepinnt | Updates kommen als Renovate-PR. Leer heißt: neueste Version bei jedem Lauf. Die ArgoCD-Version steht in `argocd/apps/argocd/Chart.yaml` |
| `argocd_repo_revision` | `main` | Branch, Tag oder SHA, dem ArgoCD folgt |
| `tailscale_cidr` | `100.64.0.0/10` | Quellnetz der Tailnet-Peers für UFW |
| `pihole_dns_ip` | `192.168.178.2` | Primärer Resolver des Hosts, muss zur MetalLB-IP von Pi-hole passen |
| `network_configure_static_ip` | `false` | Netplan-Datei für die feste IP ([Ubuntu-Installation](00-ubuntu-server-install.md#feste-ip)) |

## Ausführen

```bash
make install    # make deps (Galaxy-Collections) + ansible-playbook ansible/site.yml --ask-vault-pass
make check      # Dry-Run mit --check --diff
```

Ein kompletter Erstlauf dauert etwa 15 bis 25 Minuten, die meiste Zeit geht für Downloads drauf. Das Playbook ist idempotent und lässt sich jederzeit erneut starten.

Das erste Play läuft gegen `homeservers` und führt die Rollen in dieser Reihenfolge aus:

| Rolle | Make | Was sie tut |
|---|---|---|
| `common` | `make common` | Hostname, Zeitzone, Pakete und `dist-upgrade`, `unattended-upgrades`, chrony, Swap aus, Kernel-Module und sysctl für k3s, journald-Limit, SSH-Härtung, NIC-Tuning, UFW, optional feste IP, Reboot bei Bedarf, wöchentlicher Cleanup-Timer |
| `host_dns` | `make host-dns` | entfernt dnsmasq, öffnet Port 53 für LAN und Tailnet, stellt `systemd-resolved` auf Pi-hole (`pihole_dns_ip`) mit dem Router als Fallback |
| `tailscale` | `make tailscale` | installiert Tailscale aus dem APT-Repo, meldet den Host mit `tailscale_auth_key` an und bietet `local_subnet` als Subnet-Route an |
| `k3s` | `make k3s` | schreibt `/etc/rancher/k3s/config.yaml`, installiert k3s in `k3s_version`, kopiert die kubeconfig nach `~/.kube/config` des Ansible-Users, installiert Helm |
| `argocd` | `make argocd` | installiert ArgoCD per Helm (NodePort 30080/30443), wendet die Bootstrap-Application und das Root-`ApplicationSet` an |
| `scanner` | `make scanner` | SANE, scanbd, CIFS-Mount des Paperless-`consume`-Shares, Scan-Skripte und Healthcheck ([Scanner](10-scanner.md)) |
| `semaphore_secrets` | `make semaphore` | erzeugt beim ersten Lauf Admin-Passwort, Encryption-Key und SSH-Keypair für Semaphore und legt sie als Secret im Namespace `semaphore` ab |
| `backup` | `make backup` | nächtlicher restic-Lauf (04:00) auf die NAS, übersprungen ohne `backup_restic_password` ([Backup](26-backup.md)) |

Danach folgen zwei weitere Plays:

| Play | Make | Was es tut |
|---|---|---|
| `semaphore_targets` | `make semaphore-targets` | trägt den Semaphore-Public-Key in `authorized_keys` aller Hosts der Gruppe `semaphore_targets` ein |
| `semaphore_bootstrap` | `make semaphore-bootstrap` | wartet auf das Deployment `semaphore` und legt über die REST-API Projekte, Keys, Repositories, Inventories, Templates und Schedules an ([Semaphore](08-semaphore.md)) |

Einzelne Rollen startest du über die Make-Targets oder direkt mit Tags aus `site.yml`:

```bash
ansible-playbook -i ansible/inventory/hosts.yml ansible/site.yml --tags k3s,argocd --ask-vault-pass
ansible-playbook -i ansible/inventory/hosts.yml ansible/site.yml --skip-tags scanner --ask-vault-pass
```

> [!NOTE]
> Die Rolle `scanner` bricht ab, wenn `scanner_usb_product_id` oder `scanner_smb_password` fehlen. Ohne Scanner läuft die Installation mit `--skip-tags scanner`.

Beim Erstlauf gibt es Pi-hole noch nicht. Der Host löst dann über den Router auf, bis ArgoCD die App `pihole` ausgerollt hat. Hat ArgoCD die App `semaphore` beim ersten Lauf noch nicht synchronisiert, schlägt `semaphore_bootstrap` fehl. Dann später `make semaphore-bootstrap` nachholen.

## Prüfen

```bash
ssh jaydee@192.168.178.127
sudo kubectl get nodes                       # homeserver Ready
sudo kubectl get pods -A                     # alles Running oder Completed
sudo kubectl get applications -n argocd      # Synced / Healthy
tailscale status                             # Host verbunden mit 100.x.x.x
```

ArgoCD ist unter `http://192.168.178.127:30080` erreichbar, Benutzer `admin`. Das Playbook gibt das Passwort nur mit `-e argocd_show_initial_password=true` aus. Sonst liest du es so aus und änderst es nach dem ersten Login:

```bash
sudo kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d; echo
```

Die Subnet-Route `192.168.178.0/24` muss in der [Tailscale-Konsole](https://login.tailscale.com/admin/machines) einmal freigegeben werden. Erst dann erreichen Tailnet-Geräte Pi-hole und die LAN-IPs ([Tailscale](06-tailscale.md), [Pi-hole](15-pihole.md)).

## kubectl von der Workstation

Die kubeconfig auf dem Server zeigt auf `127.0.0.1:6443`. Das k3s-Zertifikat gilt auch für die Server-IP und `homeserver`, deshalb reicht es, die Adresse zu ersetzen:

```bash
ssh jaydee@192.168.178.127 'cat ~/.kube/config' | sed 's/127.0.0.1/192.168.178.127/' > ~/.kube/home-server
KUBECONFIG=~/.kube/home-server kubectl get nodes
```

## Später ändern

Host-Konfiguration änderst du in `all.yml` und spielst sie mit `make install` oder dem passenden Rollen-Target ein. Semaphore führt das Playbook zusätzlich jeden Tag um 06:00 aus ([Semaphore](08-semaphore.md)). Änderungen an Apps laufen über einen PR auf `main`, ArgoCD übernimmt sie nach dem Merge ([ArgoCD](05-argocd.md)).
