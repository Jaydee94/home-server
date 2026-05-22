# Troubleshooting

Diese Datei sammelt typische Probleme und ihre Lösungen pro Komponente.

---

## k3s startet nicht

### Symptome

- `sudo systemctl status k3s` zeigt `failed` oder `activating`.
- `kubectl get nodes` antwortet mit `connection refused` oder Timeout.
- Playbook bleibt bei „Wait for k3s to be ready" hängen.

### Diagnose

```bash
# Service-Status
sudo systemctl status k3s

# Aktuelle Logs
sudo journalctl -u k3s --since "10 minutes ago" -n 100

# Vollständige Logs
sudo journalctl -u k3s | tail -200

# Kernel-Anforderungen prüfen
sudo k3s check-config

# Binary prüfen
ls -la /usr/local/bin/k3s
k3s --version
```

### Häufige Ursachen & Fixes

**Port 6443 belegt:**

```bash
sudo ss -tlnp | grep 6443
# Belegt von anderem Prozess → stoppen oder k3s umkonfigurieren
```

**Swap aktiv:**

```bash
swapon --show
# Falls aktiv:
sudo swapoff -a
sudo sed -i '/ swap / s/^/#/' /etc/fstab
```

**`br_netfilter`-Modul fehlt:**

```bash
lsmod | grep br_netfilter
# Falls leer:
sudo modprobe br_netfilter
echo "br_netfilter" | sudo tee /etc/modules-load.d/k3s.conf
```

**`ip_forward` deaktiviert:**

```bash
cat /proc/sys/net/ipv4/ip_forward
# Sollte 1 sein. Falls 0:
sudo sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward = 1" | sudo tee /etc/sysctl.d/99-k3s.conf
sudo sysctl --system
```

**YAML-Syntaxfehler in der Config:**

```bash
cat /etc/rancher/k3s/config.yaml
python3 -c "import yaml; yaml.safe_load(open('/etc/rancher/k3s/config.yaml'))"
```

**k3s neu installieren:**

```bash
# Deinstallieren
sudo /usr/local/bin/k3s-uninstall.sh

# Re-Install via Ansible
ansible-playbook -i ansible/inventory/hosts.yml ansible/site.yml --tags k3s --ask-vault-pass
```

---

## ArgoCD synct nicht

### Symptome

- Applications stehen auf `OutOfSync`, ohne sich zu syncen.
- Apps zeigen `Unknown` Health.
- ApplicationSet erzeugt keine Applications.
- Sync schlägt mit Fehlermeldungen in der UI fehl.

### Diagnose

```bash
# ArgoCD-Pods
kubectl get pods -n argocd

# Server-Logs
kubectl logs -n argocd deployment/argocd-server --tail=100

# Application-Controller-Logs
kubectl logs -n argocd deployment/argocd-application-controller --tail=100

# Repo-Server-Logs
kubectl logs -n argocd deployment/argocd-repo-server --tail=100

# ApplicationSet-Controller-Logs
kubectl logs -n argocd deployment/argocd-applicationset-controller --tail=100

# Apps und Status
kubectl get applications -n argocd
kubectl describe application example-whoami -n argocd

# ApplicationSet
kubectl get applicationsets -n argocd
kubectl describe applicationset home-server-apps -n argocd
```

### Häufige Ursachen & Fixes

**Repository nicht erreichbar:**

```bash
# Im UI: Settings → Repositories → Connection-Status prüfen

# Per kubectl
kubectl get secrets -n argocd -l argocd.argoproj.io/secret-type=repository

# Verbindung aus dem argocd-repo-server-Pod testen
kubectl exec -n argocd deployment/argocd-repo-server -- \
  git ls-remote https://github.com/YOUR_USER/home-server.git
```

**Privates Repo ohne Credentials:**

Credentials hinterlegen wie in [05-argocd.md](05-argocd.md#privates-repository) beschrieben.

**Falsche Repo-URL im ApplicationSet:**

```bash
kubectl get applicationset home-server-apps -n argocd -o yaml | grep repoURL
# URL muss zum echten Repo passen
```

**YAML-Syntaxfehler in App-Manifests:**

```bash
# Parser-Fehler im Repo-Server
kubectl logs -n argocd deployment/argocd-repo-server | grep -i "error\|ERR"

# Lokal validieren
find argocd/apps/ -name "*.yaml" -exec python3 -c "
import yaml, sys
for f in sys.argv[1:]:
    try:
        yaml.safe_load_all(open(f))
        print(f'OK: {f}')
    except yaml.YAMLError as e:
        print(f'ERROR: {f}: {e}')
" {} +
```

**ArgoCD-Server-Pod nicht ready:**

```bash
kubectl rollout status deployment/argocd-server -n argocd
kubectl describe pod -n argocd -l app.kubernetes.io/name=argocd-server
```

**Manuellen Sync erzwingen:**

```bash
# Per CLI
argocd app sync example-whoami --force

# Per kubectl (Annotation triggert Refresh)
kubectl patch application example-whoami -n argocd \
  --type merge \
  -p '{"metadata": {"annotations": {"argocd.argoproj.io/refresh": "hard"}}}'
```

---

## Tailscale verbindet nicht

### Symptome

- `tailscale status` zeigt `stopped` oder `connecting`.
- Server taucht im Tailscale-Admin-Panel nicht auf.
- Server nicht über Tailscale-IP erreichbar.

### Diagnose

```bash
# tailscaled-Service
sudo systemctl status tailscaled

# Logs
sudo journalctl -u tailscaled --since "10 minutes ago" -n 100

# Netz-Diagnostik
tailscale netcheck

# Status
tailscale status

# Auth-Probleme
sudo journalctl -u tailscaled | grep -i "auth\|error\|fail"
```

### Häufige Ursachen & Fixes

**Ungültiger oder abgelaufener Auth-Key:**

```bash
# Mit neuem Key reconnecten
sudo tailscale up --authkey=tskey-auth-NEUER_KEY --reset
```

**tailscaled-Service läuft nicht:**

```bash
sudo systemctl enable --now tailscaled
sudo systemctl restart tailscaled
```

**Firewall blockt Tailscale-UDP:**

```bash
# UFW-Regeln
sudo ufw status verbose | grep -i "41641\|tailscale"

# Tailscale freigeben
sudo ufw allow 41641/udp comment "Tailscale WireGuard"
```

**Nur DERP-Relay (keine Direktverbindung):**

Wenn `tailscale netcheck` keine direkten Pfade meldet, nutzt Tailscale DERP-Relays.
Funktioniert, hat aber höhere Latenz. Löst sich meist von selbst.

```bash
tailscale netcheck
# Achten auf "No direct connection to X"
```

**Re-Authentifizieren:**

```bash
sudo tailscale up --force-reauth
# Der angezeigten URL folgen
```

**Falsche IP angezeigt:**

```bash
tailscale ip -4
# Muss zur Anzeige im Admin-Panel passen
```

---

## Pod hängt in `Pending`

### Symptome

- `kubectl get pods -A` zeigt Pods im Status `Pending`.
- Pods starten nicht.

### Diagnose

```bash
# Pod-Details, Events am Ende beachten
kubectl describe pod <pod-name> -n <namespace>

# Node-Resources
kubectl describe node homeserver
kubectl top nodes
```

### Häufige Ursachen & Fixes

**Zu wenig Ressourcen:**

```bash
# Allocatable vs. Requests
kubectl describe node homeserver | grep -A10 "Allocatable:"
kubectl describe node homeserver | grep -A10 "Allocated resources:"

# Was zieht Speicher/CPU?
kubectl top pods -A --sort-by=memory
kubectl top pods -A --sort-by=cpu
```

**PVC nicht gebunden:**

```bash
kubectl get pvc -A
# Falls STATUS "Pending":
kubectl describe pvc <pvc-name> -n <namespace>

# local-path-Provisioner
kubectl logs -n kube-system -l app=local-path-provisioner
```

**Tolerations/Affinity/NodeSelector greifen nicht:**

```bash
kubectl describe pod <pod-name> -n <namespace> | grep -A10 "Node-Selectors\|Tolerations\|Events"
```

**Image-Pull-Fehler (`ImagePullBackOff` / `ErrImagePull`):**

```bash
kubectl describe pod <pod-name> -n <namespace> | grep -A5 "Events"
# Bei „image not found" oder „registry unreachable":
# - Image-Name/-Tag prüfen
# - Internet vom Node prüfen
# - Private Registry → imagePullSecrets prüfen
```

---

## Storage-Probleme

### Symptome

- PVC bleibt `Pending`.
- Pods schlagen mit `volume mount`-Fehlern fehl.
- Daten zwischen Pod-Restarts verloren.

### Diagnose

```bash
# PVCs und PVs
kubectl get pvc -A
kubectl get pv
kubectl describe pvc <name> -n <namespace>
kubectl describe pv <name>

# local-path-Provisioner
kubectl get pods -n kube-system -l app=local-path-provisioner
kubectl logs -n kube-system -l app=local-path-provisioner

# Storage-Verzeichnis am Host
sudo ls -la /var/lib/rancher/k3s/storage/
sudo df -h /var/lib/rancher/k3s/storage/
```

### Häufige Ursachen & Fixes

**Disk voll:**

```bash
df -h /
# Aufräumen:
sudo journalctl --vacuum-size=1G
sudo docker system prune  # falls Docker installiert
```

**local-path-Provisioner läuft nicht:**

```bash
kubectl rollout restart deployment/local-path-provisioner -n kube-system
```

**Falsche StorageClass im PVC:**

```bash
kubectl get storageclass
# Default ist "local-path" — PVC sollte das nutzen:
# spec.storageClassName: local-path
```

**PV an falsche Claim gebunden:**

```bash
kubectl get pvc <name> -n <namespace> -o yaml | grep volumeName
kubectl get pv <pv-name> -o yaml | grep claimRef
```

---

## Netzwerk-Probleme

### Symptome

- Pods erreichen sich gegenseitig nicht.
- Services nicht erreichbar.
- Ingress liefert keinen Inhalt.
- DNS löst nicht auf.

### Diagnose

```bash
# Flannel
kubectl get pods -n kube-system -l app=flannel
kubectl logs -n kube-system -l app=flannel

# CoreDNS
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns

# DNS-Auflösung aus einem Pod
kubectl run dns-test --image=busybox:1.28 --rm -it --restart=Never -- nslookup kubernetes.default

# Pod-zu-Pod
kubectl run ping-test --image=busybox:1.28 --rm -it --restart=Never -- ping -c3 <pod-ip>

# Services
kubectl get svc -A
kubectl describe svc <name> -n <namespace>

# Endpoints
kubectl get endpoints <svc-name> -n <namespace>
```

### Häufige Ursachen & Fixes

**Flannel-VXLAN blockiert (Firewall):**

```bash
# UDP 8472 muss offen sein
sudo ufw allow 8472/udp comment "Flannel VXLAN"
```

**`br_netfilter` nicht geladen:**

```bash
lsmod | grep br_netfilter
# Falls leer:
sudo modprobe br_netfilter
```

**Traefik routet nicht:**

```bash
kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik
kubectl logs -n kube-system -l app.kubernetes.io/name=traefik
kubectl get svc -n kube-system traefik

# Ingress-Details
kubectl describe ingress <name> -n <namespace>
kubectl get ingress <name> -n <namespace> -o yaml | grep ingressClassName
```

**Service ohne Endpoints:**

```bash
kubectl get endpoints <svc-name> -n <namespace>
# Falls leer: laufen die Pods und matchen die Labels?
kubectl get pods -n <namespace> -l <selector-key>=<selector-value>
```

---

## Ansible-Playbook-Fehler

### Häufige Ursachen

**SSH-Verbindung verweigert:**

```bash
# SSH testen
ssh -i ~/.ssh/id_rsa ubuntu@192.168.1.100 "echo connected"

# Inventory
ansible -i ansible/inventory/hosts.yml homeserver -m ping
```

**sudo verlangt Passwort:**

```bash
# Auf dem Server NOPASSWD-sudo eintragen
ssh ubuntu@192.168.1.100
echo "ubuntu ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/ubuntu-nopasswd
```

**Galaxy-Collection fehlt:**

```bash
ansible-galaxy collection install -r ansible/requirements.yml --force
```

**Falsches Vault-Passwort:**

```bash
# Bei "Decryption failed" wurde das falsche Passwort eingegeben.
# Falls das Passwort komplett verloren ist, Secret neu verschlüsseln:
ansible-vault encrypt_string 'tskey-auth-DEIN_KEY' --name 'tailscale_auth_key'
```

---

## Nützliche Debug-Kommandos

### System-weiter Status

```bash
# Alle nicht-laufenden Pods
kubectl get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded

# Aktuelle Cluster-Events
kubectl get events -A --sort-by='.lastTimestamp' | tail -30

# Node-Conditions
kubectl describe node homeserver | grep -A20 "Conditions:"

# System-Ressourcen
free -h && df -h && uptime

# journald-Errors
sudo journalctl -p err --since "1 hour ago"
```

### Quick-Health-Check-Skript

```bash
#!/bin/bash
echo "=== Node Status ==="
kubectl get nodes

echo ""
echo "=== Pod Status ==="
kubectl get pods -A

echo ""
echo "=== Tailscale Status ==="
tailscale status

echo ""
echo "=== ArgoCD Apps ==="
kubectl get applications -n argocd 2>/dev/null || echo "ArgoCD nicht installiert"

echo ""
echo "=== Disk-Verbrauch ==="
df -h /

echo ""
echo "=== Memory ==="
free -h
```

Speichern als `/home/ubuntu/healthcheck.sh`, ausführen mit `bash /home/ubuntu/healthcheck.sh`.
