# Installationsleitfaden

Schritt-für-Schritt-Anleitung, um den Home-Server von Null aus zu provisionieren.

---

## Überblick

Die komplette Installation wird durch einen einzigen Ansible-Playbook-Run
erledigt. Dieser Leitfaden begleitet jeden Schritt — vom Repo-Clone bis zur
Verifikation eines lauffähigen Clusters mit ArgoCD und Tailscale.

**Dauer:** ca. 15–25 Minuten (mehrheitlich Downloads).

---

## Schritt 1 — Repository klonen

```bash
git clone https://github.com/Jaydee94/home-server.git
cd home-server
```

Bei einem Fork stattdessen die URL des Forks verwenden.

---

## Schritt 2 — Inventory konfigurieren (Server-IP setzen)

Inventory-Datei öffnen und die Platzhalter-IP durch die tatsächliche IP des Servers ersetzen:

```bash
$EDITOR ansible/inventory/hosts.yml
```

`192.168.1.100` durch die eigene Server-IP ersetzen:

```yaml
homeserver:
  hosts:
    homeserver:
      ansible_host: 192.168.1.100        # <-- ANPASSEN
      ansible_user: ubuntu
      ansible_ssh_private_key_file: ~/.ssh/id_ed25519
```

Falls der SSH-User nicht `ubuntu` ist, `ansible_user` ebenfalls anpassen.
Liegt der Private Key woanders, `ansible_ssh_private_key_file` setzen.

Verbindung testen:

```bash
ansible -i ansible/inventory/hosts.yml homeserver -m ping
# Erwartet: homeserver | SUCCESS => { "ping": "pong" }
```

---

## Schritt 3 — Variablen setzen

Variablendatei öffnen und alle Werte durchgehen:

```bash
$EDITOR ansible/group_vars/all.yml
```

**Pflicht-Änderungen:**

| Variable             | Wert                                                        |
|----------------------|-------------------------------------------------------------|
| `timezone`           | Eigene Zeitzone (z. B. `Europe/Berlin`, `America/New_York`) |
| `argocd_repo_url`    | URL des eigenen GitHub-Repos                                |
| `local_subnet`       | Heim-LAN-Subnetz (z. B. `192.168.178.0/24`)                 |
| `tailscale_auth_key` | Via Ansible-Vault setzen (Schritt 4)                        |

**Optional:**

| Variable                    | Default       | Hinweis                                                                |
|-----------------------------|---------------|------------------------------------------------------------------------|
| `auto_upgrade`              | `true`        | OS + alle Komponenten bei jedem Run auf neuesten Stable halten         |
| `auto_reboot_if_required`   | `true`        | Auto-Reboot, wenn APT `/var/run/reboot-required` setzt                 |
| `k3s_version`               | `""` (leer)   | Leer ⇒ `k3s_channel` folgen. Pin auf z. B. `v1.30.2+k3s1`              |
| `k3s_channel`               | `stable`      | Wird genutzt, wenn `k3s_version` leer ist                              |
| `helm_version`              | `""` (leer)   | Leer ⇒ neuestes Helm 3                                                 |
| `argocd_version`            | `""` (leer)   | Leer ⇒ neuestes Argo-Helm-Chart                                        |
| `hostname`                  | `homeserver`  | Hostname des Servers                                                   |
| `dnsmasq_hosts`             | App-Liste     | Hostnamen, die von `dnsmasq` unter `*.homeserver` aufgelöst werden     |
| `semaphore_vault_password`  | Vault-Block   | Ansible-Vault-Passwort, das Semaphore zur Laufzeit zum Decrypten nutzt |
| `scanner_usb_vendor_id` / `scanner_usb_product_id` | leer | USB-IDs aus `lsusb` — Pflicht, wenn die Scanner-Rolle aktiv ist     |
| `scanner_smb_share` / `scanner_smb_username` / `scanner_smb_password` | — | NAS-Share + Creds für das Paperless-`consume`-Verzeichnis    |
| `scanner_gotify_enabled`    | `false`       | Gotify-Push-Notifications aus der Scan-Pipeline ein/aus                |
| `scanner_gotify_url` / `scanner_gotify_token` | — | Gotify-Endpoint + (vault-verschlüsselter) App-Token                  |
| `gotify_admin_password`     | Vault-Block   | Optional: Gotify-Admin-Passwort als Vault-Eintrag aufbewahren          |

> **Tipp.** `auto_upgrade: false` setzen, wenn Reproduzierbarkeit wichtig ist
> (CI, Lab-Snapshots) — Ansible installiert dann nur fehlende Pakete und respektiert alle Pins.

---

## Schritt 4 — Tailscale-Auth-Key mit Ansible-Vault verschlüsseln

**Niemals den Auth-Key im Klartext committen.** Stattdessen mit Ansible-Vault verschlüsseln.

1. Auth-Key im [Tailscale-Admin-Panel](https://login.tailscale.com/admin/settings/keys) erstellen:
   - **Generate auth key**
   - **Reusable** deaktivieren (Single-Use ist sicherer)
   - **Ephemeral** deaktivieren (der Server soll persistent bleiben)
   - Key kopieren (beginnt mit `tskey-auth-…`)

2. Mit Ansible-Vault verschlüsseln:

```bash
ansible-vault encrypt_string 'tskey-auth-DEIN_AUTH_KEY' --name 'tailscale_auth_key'
```

Beim ersten Mal wird ein Vault-Passwort vergeben. **Dieses Passwort merken** —
es wird bei jedem Playbook-Run abgefragt.

3. Das Kommando liefert etwas wie:

```yaml
tailscale_auth_key: !vault |
          $ANSIBLE_VAULT;1.1;AES256
          39393965316162623733326665376234386665643530...
          ...
Encryption successful
```

4. Den kompletten Block in `ansible/group_vars/all.yml` als Wert für
   `tailscale_auth_key` einsetzen (von `tailscale_auth_key:` bis zur letzten Zeile).

5. Verifizieren:

```bash
grep -A5 "tailscale_auth_key:" ansible/group_vars/all.yml
# Korrekt: tailscale_auth_key: !vault |
# Falsch:  tailscale_auth_key: "tskey-auth-..."
```

---

## Schritt 5 — Ansible-Requirements installieren

Galaxy-Collections auf der Control-Machine installieren:

```bash
ansible-galaxy collection install -r ansible/requirements.yml
```

Installiert:

- `ansible.posix` — POSIX-System-Module
- `community.general` — erweiterte Community-Module
- `kubernetes.core` — Kubernetes-/Helm-Module

Verifizieren:

```bash
ansible-galaxy collection list | grep -E "ansible.posix|community.general|kubernetes.core"
```

---

## Schritt 6 — Playbook ausführen

Einfachster Weg — Makefile:

```bash
make install            # ruft `ansible-galaxy install` + das Playbook auf
```

Oder Ansible direkt:

```bash
ansible-playbook \
  -i ansible/inventory/hosts.yml \
  ansible/site.yml \
  --ask-vault-pass
```

Vault-Passwort eingeben, wenn abgefragt.

**Was das Playbook tut (in Reihenfolge):**

1. **common** (~3 min) — APT-Updates, UFW-Firewall, Kernel-Parameter, Swap-off, chrony NTP.
2. **dnsmasq** (~30 s) — Installiert und konfiguriert `dnsmasq` für die Zone `*.homeserver` auf LAN-Interface und `tailscale0`.
3. **tailscale** (~1 min) — Installiert Tailscale, joint das Tailnet mit dem vault-verschlüsselten Auth-Key.
4. **k3s** (~5 min) — Installiert k3s, schreibt die kubeconfig, installiert Helm.
5. **argocd** (~10 min) — Deployt ArgoCD per Helm-Chart und appliziert das Root-`ApplicationSet`.
6. **scanner** (~2 min) — Installiert `sane` + `scanbd`, mountet die NAS per CIFS, verdrahtet den Fujitsu-USB-Scanner (braucht `scanner_usb_vendor_id`/`scanner_usb_product_id`).
7. **semaphore_secrets** (~30 s) — Rendert das Bootstrap-Secret, das der in-Cluster-Semaphore-Pod liest.

Im Anschluss an die host-zentrischen Rollen laufen zwei zusätzliche Plays:

8. **semaphore_targets** (~30 s pro Target-Host) — Pusht den Semaphore-SSH-Public-Key in jeden Host der Inventory-Gruppe `semaphore_targets`.
9. **semaphore_bootstrap** (~1 min) — Spricht die Semaphore-REST-API auf dem Home-Server an und legt Projects, Keys, Repositories, Inventories und Templates idempotent an.

Am Ende druckt das Playbook eine Summary mit den URLs.

**Nur bestimmte Rollen ausführen** (via Tags, siehe Tag pro Rolle in `ansible/site.yml`):

```bash
# Nur common
make common
# oder:
ansible-playbook -i ansible/inventory/hosts.yml ansible/site.yml --tags common --ask-vault-pass

# Nur k3s + argocd
ansible-playbook -i ansible/inventory/hosts.yml ansible/site.yml --tags k3s,argocd --ask-vault-pass

# Nur die Split-DNS-Schicht (nach Änderung von dnsmasq_hosts)
make dnsmasq

# Tailscale komplett überspringen
ansible-playbook -i ansible/inventory/hosts.yml ansible/site.yml --skip-tags tailscale --ask-vault-pass
```

Alle Convenience-Targets siehst du mit `make help`.

**Das Playbook ist vollständig idempotent** — mehrfaches Ausführen ist sicher und führt zu keinen unnötigen Änderungen.

---

## Schritt 7 — Installation verifizieren

Per SSH auf den Server und folgende Kommandos laufen lassen:

### k3s-Node-Status

```bash
ssh ubuntu@192.168.1.100
kubectl get nodes
```

Erwartet:

```
NAME         STATUS   ROLES                  AGE   VERSION
homeserver   Ready    control-plane,master   5m    v1.29.3+k3s1
```

### Alle System-Pods

```bash
kubectl get pods -A
```

Alle sollten `Running` oder `Completed` sein. Besonders prüfen:

- `kube-system`: Traefik, CoreDNS, metrics-server, local-path-provisioner
- `argocd`: argocd-server, argocd-repo-server, argocd-application-controller, …

### ArgoCD-Application-Status

```bash
kubectl get applications -n argocd
# oder
kubectl get applicationsets -n argocd
```

### Tailscale-Verbindung

```bash
tailscale status
```

Erwartet: dein Server verbunden mit einer `100.x.x.x`-IP, Status `Connected`.

```bash
tailscale ip -4
# Liefert die Tailscale-IP, z. B.: 100.101.102.103
```

### Initial-Passwort von ArgoCD

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d; echo
```

---

## Schritt 8 — Services nutzen

### ArgoCD-Web-UI

Im Browser öffnen:

```
http://<server-ip>:30080
```

Oder via Tailscale-MagicDNS (sofern aktiviert):

```
http://homeserver:30080
```

Login:

- **Username:** `admin`
- **Passwort:** Output aus Schritt 7

**Wichtig:** Passwort nach dem ersten Login ändern:

1. User-Icon (links oben)
2. **User Info**
3. **Update Password**

### ArgoCD-CLI

CLI lokal installieren:

```bash
# Linux
curl -sSL -o argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
chmod +x argocd
sudo mv argocd /usr/local/bin/

# macOS
brew install argocd
```

Login:

```bash
argocd login <server-ip>:30080 --username admin --password <initial-passwort> --insecure
```

### kubectl von der Control-Machine

Kubeconfig vom Server holen:

```bash
# Lokal
scp ubuntu@192.168.1.100:~/.kube/config ~/.kube/home-server-config

# Nutzen
KUBECONFIG=~/.kube/home-server-config kubectl get nodes

# Oder in den Default-Kubeconfig mergen
KUBECONFIG=~/.kube/config:~/.kube/home-server-config kubectl config view --merge --flatten > ~/.kube/merged-config
mv ~/.kube/merged-config ~/.kube/config
kubectl config get-contexts
kubectl config use-context default   # oder den angezeigten Context-Namen
```

Hinweis: Die kubeconfig auf dem Server zeigt auf `127.0.0.1:6443`. Für
Remote-Zugriff entweder:

- SSH-Tunnel: `ssh -L 6443:localhost:6443 ubuntu@192.168.1.100`
- Oder die Server-Adresse in der kubeconfig auf die Tailscale-IP umschreiben, bevor sie kopiert wird.

---

## Setup aktualisieren

Um Konfigurationsänderungen nach dem ersten Setup anzuwenden, einfach das
Playbook erneut laufen lassen:

```bash
ansible-playbook -i ansible/inventory/hosts.yml ansible/site.yml --ask-vault-pass
```

Für Application-Changes, die ArgoCD verwaltet: commit + push ins Git-Repo —
ArgoCD erkennt und appliziert die Änderung automatisch.
