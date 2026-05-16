# Troubleshooting Guide

This document covers common issues and their solutions for each component.

---

## k3s Fails to Start

### Symptoms

- `sudo systemctl status k3s` shows `failed` or `activating` state
- `kubectl get nodes` returns `connection refused` or times out
- Playbook fails at "Wait for k3s to be ready"

### Diagnostic Steps

```bash
# Check service status
sudo systemctl status k3s

# View recent logs
sudo journalctl -u k3s --since "10 minutes ago" -n 100

# Check full logs without truncation
sudo journalctl -u k3s | tail -200

# Check kernel requirements
sudo k3s check-config

# Verify the binary is present
ls -la /usr/local/bin/k3s
k3s --version
```

### Common Causes and Fixes

**Port 6443 already in use:**

```bash
sudo ss -tlnp | grep 6443
# If something else is listening on 6443, stop it or reconfigure k3s
```

**Swap still enabled:**

```bash
swapon --show
# If swap is shown, disable it:
sudo swapoff -a
# And remove from /etc/fstab permanently
sudo sed -i '/ swap / s/^/#/' /etc/fstab
```

**br_netfilter module not loaded:**

```bash
lsmod | grep br_netfilter
# If not present:
sudo modprobe br_netfilter
echo "br_netfilter" | sudo tee /etc/modules-load.d/k3s.conf
```

**ip_forward not enabled:**

```bash
cat /proc/sys/net/ipv4/ip_forward
# Should be 1. If 0:
sudo sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward = 1" | sudo tee /etc/sysctl.d/99-k3s.conf
sudo sysctl --system
```

**Config file syntax error:**

```bash
cat /etc/rancher/k3s/config.yaml
# Validate YAML syntax:
python3 -c "import yaml; yaml.safe_load(open('/etc/rancher/k3s/config.yaml'))"
```

**Reinstall k3s:**

```bash
# Uninstall
sudo /usr/local/bin/k3s-uninstall.sh

# Reinstall via Ansible
ansible-playbook -i ansible/inventory/hosts.yml ansible/site.yml --tags k3s --ask-vault-pass
```

---

## ArgoCD Not Syncing

### Symptoms

- Applications show `OutOfSync` but don't auto-sync
- Applications show `Unknown` health
- ApplicationSet not creating Applications
- Sync fails with error messages in the UI

### Diagnostic Steps

```bash
# Check ArgoCD pods
kubectl get pods -n argocd

# Check ArgoCD server logs
kubectl logs -n argocd deployment/argocd-server --tail=100

# Check application controller logs
kubectl logs -n argocd deployment/argocd-application-controller --tail=100

# Check repo server logs
kubectl logs -n argocd deployment/argocd-repo-server --tail=100

# Check applicationset controller logs
kubectl logs -n argocd deployment/argocd-applicationset-controller --tail=100

# List applications and their status
kubectl get applications -n argocd
kubectl describe application example-whoami -n argocd

# Check ApplicationSet
kubectl get applicationsets -n argocd
kubectl describe applicationset home-server-apps -n argocd
```

### Common Causes and Fixes

**Repository not accessible:**

```bash
# Check if ArgoCD can reach the repository
# Via the UI: Settings → Repositories → Connection status

# Via kubectl
kubectl get secrets -n argocd -l argocd.argoproj.io/secret-type=repository

# Test connectivity from argocd-repo-server pod
kubectl exec -n argocd deployment/argocd-repo-server -- \
  git ls-remote https://github.com/YOUR_USER/home-server.git
```

**Private repository missing credentials:**

Add credentials as described in [05-argocd.md](05-argocd.md#repository-configuration).

**Wrong repository URL in ApplicationSet:**

```bash
kubectl get applicationset home-server-apps -n argocd -o yaml | grep repoURL
# Verify the URL matches your actual repository
```

**YAML syntax error in app manifests:**

```bash
# Check the ArgoCD repo server for parsing errors
kubectl logs -n argocd deployment/argocd-repo-server | grep -i "error\|ERR"

# Validate YAML locally
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

**ArgoCD server pod not ready:**

```bash
kubectl rollout status deployment/argocd-server -n argocd
kubectl describe pod -n argocd -l app.kubernetes.io/name=argocd-server
```

**Force a manual sync:**

```bash
# Via CLI
argocd app sync example-whoami --force

# Via kubectl (add annotation to trigger sync)
kubectl patch application example-whoami -n argocd \
  --type merge \
  -p '{"metadata": {"annotations": {"argocd.argoproj.io/refresh": "hard"}}}'
```

---

## Tailscale Not Connecting

### Symptoms

- `tailscale status` shows `stopped` or `connecting`
- Server not appearing in Tailscale admin panel
- Cannot reach server via Tailscale IP from other devices

### Diagnostic Steps

```bash
# Check tailscaled service
sudo systemctl status tailscaled

# Check logs
sudo journalctl -u tailscaled --since "10 minutes ago" -n 100

# Network diagnostics
tailscale netcheck

# Current status
tailscale status

# Check if auth key was valid
sudo journalctl -u tailscaled | grep -i "auth\|error\|fail"
```

### Common Causes and Fixes

**Invalid or expired auth key:**

```bash
# Reconnect with a new auth key
sudo tailscale up --authkey=tskey-auth-YOUR_NEW_KEY --reset
```

**tailscaled service not running:**

```bash
sudo systemctl enable --now tailscaled
sudo systemctl restart tailscaled
```

**Firewall blocking Tailscale UDP:**

```bash
# Check UFW rules
sudo ufw status verbose | grep -i "41641\|tailscale"

# Allow Tailscale
sudo ufw allow 41641/udp comment "Tailscale WireGuard"
```

**DERP relay fallback (no direct connection):**

If `tailscale netcheck` shows no direct paths, Tailscale will use DERP relay servers. This still works but has higher latency. Usually resolves itself.

```bash
tailscale netcheck
# Look for: "No direct connection to X" warnings
# This is usually not a problem — DERP relay works fine
```

**Re-authenticate:**

```bash
sudo tailscale up --force-reauth
# Follow the URL shown to authenticate
```

**Already connected but shows wrong IP:**

```bash
tailscale ip -4
# Verify this matches what the admin panel shows
```

---

## Pod Stuck in Pending

### Symptoms

- `kubectl get pods -A` shows pods in `Pending` state
- Pods never start

### Diagnostic Steps

```bash
# Describe the pod to see events
kubectl describe pod <pod-name> -n <namespace>
# Look at the "Events" section at the bottom

# Check node resources
kubectl describe node homeserver
# Look at "Allocated resources" section
kubectl top nodes
```

### Common Causes and Fixes

**Insufficient resources:**

```bash
# Check node capacity vs requests
kubectl describe node homeserver | grep -A10 "Allocatable:"
kubectl describe node homeserver | grep -A10 "Allocated resources:"

# If resources are tight, check what's using them
kubectl top pods -A --sort-by=memory
kubectl top pods -A --sort-by=cpu
```

**PersistentVolumeClaim not bound:**

```bash
kubectl get pvc -A
# If STATUS is "Pending":
kubectl describe pvc <pvc-name> -n <namespace>

# Check local-path provisioner
kubectl logs -n kube-system -l app=local-path-provisioner
```

**Toleration/affinity/node selector mismatch:**

```bash
kubectl describe pod <pod-name> -n <namespace> | grep -A10 "Node-Selectors\|Tolerations\|Events"
```

**Image pull failure (ImagePullBackOff or ErrImagePull):**

```bash
kubectl describe pod <pod-name> -n <namespace> | grep -A5 "Events"
# If image not found or registry unreachable:
# - Verify image name/tag is correct
# - Check internet connectivity from node
# - For private registries, check imagePullSecrets
```

---

## Storage Issues

### Symptoms

- PVC stays in `Pending` state
- Pods fail with `volume mount` errors
- Data lost between pod restarts

### Diagnostic Steps

```bash
# Check PVCs and PVs
kubectl get pvc -A
kubectl get pv
kubectl describe pvc <name> -n <namespace>
kubectl describe pv <name>

# Check local-path provisioner
kubectl get pods -n kube-system -l app=local-path-provisioner
kubectl logs -n kube-system -l app=local-path-provisioner

# Check storage directory on host
sudo ls -la /var/lib/rancher/k3s/storage/
sudo df -h /var/lib/rancher/k3s/storage/
```

### Common Causes and Fixes

**Disk full:**

```bash
df -h /
# If full:
# - Remove unused Docker images, logs, etc.
sudo journalctl --vacuum-size=1G
sudo docker system prune  # if docker is installed
```

**local-path provisioner not running:**

```bash
kubectl rollout restart deployment/local-path-provisioner -n kube-system
```

**Wrong storage class name:**

```bash
kubectl get storageclass
# Default is "local-path" — verify PVC uses this name
# spec.storageClassName: local-path
```

**PV bound to wrong namespace:**

By default, `local-path` PVs are not namespace-scoped but the PVC binding is. Verify:

```bash
kubectl get pvc <name> -n <namespace> -o yaml | grep volumeName
kubectl get pv <pv-name> -o yaml | grep claimRef
```

---

## Network Connectivity Issues

### Symptoms

- Pods can't reach each other
- Services not reachable
- Ingress not working
- DNS not resolving

### Diagnostic Steps

```bash
# Check Flannel pods
kubectl get pods -n kube-system -l app=flannel
kubectl logs -n kube-system -l app=flannel

# Check CoreDNS
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns

# Test DNS resolution from a pod
kubectl run dns-test --image=busybox:1.28 --rm -it --restart=Never -- nslookup kubernetes.default

# Test pod-to-pod connectivity
kubectl run ping-test --image=busybox:1.28 --rm -it --restart=Never -- ping -c3 <pod-ip>

# Check services
kubectl get svc -A
kubectl describe svc <name> -n <namespace>

# Check endpoints
kubectl get endpoints <svc-name> -n <namespace>
```

### Common Causes and Fixes

**Flannel VXLAN blocked by firewall:**

```bash
# UDP 8472 must be allowed for Flannel VXLAN
sudo ufw allow 8472/udp comment "Flannel VXLAN"
```

**br_netfilter not loaded:**

```bash
lsmod | grep br_netfilter
# If missing:
sudo modprobe br_netfilter
```

**Traefik not routing:**

```bash
# Check Traefik pods
kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik
kubectl logs -n kube-system -l app.kubernetes.io/name=traefik

# Check Traefik service
kubectl get svc -n kube-system traefik

# Describe ingress
kubectl describe ingress <name> -n <namespace>

# Check Ingress has correct ingressClassName
kubectl get ingress <name> -n <namespace> -o yaml | grep ingressClassName
```

**Service has no endpoints:**

```bash
kubectl get endpoints <svc-name> -n <namespace>
# If no endpoints, check if pods are running and labels match selector
kubectl get pods -n <namespace> -l <selector-key>=<selector-value>
```

---

## Ansible Playbook Failures

### Common Issues

**SSH connection refused:**

```bash
# Verify SSH access
ssh -i ~/.ssh/id_rsa ubuntu@192.168.1.100 "echo connected"

# Check ansible inventory
ansible -i ansible/inventory/hosts.yml homeserver -m ping
```

**Sudo password required:**

```bash
# Add NOPASSWD to sudoers on the server
ssh ubuntu@192.168.1.100
echo "ubuntu ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/ubuntu-nopasswd
```

**Ansible collection not installed:**

```bash
ansible-galaxy collection install -r ansible/requirements.yml --force
```

**Vault password wrong:**

```bash
# If you get "Decryption failed" errors, you used the wrong vault password
# Re-encrypt the secret if you forgot the password:
ansible-vault encrypt_string 'tskey-auth-YOUR_KEY' --name 'tailscale_auth_key'
```

---

## Useful Debug Commands

### System-wide Status

```bash
# All failing pods
kubectl get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded

# Recent cluster events sorted by time
kubectl get events -A --sort-by='.lastTimestamp' | tail -30

# Node conditions
kubectl describe node homeserver | grep -A20 "Conditions:"

# System resources
free -h && df -h && uptime

# journald errors
sudo journalctl -p err --since "1 hour ago"
```

### Quick Health Check Script

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
kubectl get applications -n argocd 2>/dev/null || echo "ArgoCD not installed"

echo ""
echo "=== Disk Usage ==="
df -h /

echo ""
echo "=== Memory Usage ==="
free -h
```

Save this as `/home/ubuntu/healthcheck.sh` and run with `bash /home/ubuntu/healthcheck.sh`.
