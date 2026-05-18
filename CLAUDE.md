# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A fully automated, GitOps-driven home server. Ansible provisions the host (Ubuntu 26.04 LTS); k3s runs Kubernetes; ArgoCD continuously syncs everything under `argocd/apps/` to the cluster; Tailscale provides VPN access with no public ports exposed.

## Commands

```bash
make deps           # Install required Ansible Galaxy collections
make ping           # Verify Ansible can reach the server
make check          # Dry-run the full playbook (no changes applied)
make install        # Provision the home server end-to-end

# Run individual roles only
make common         # Base OS, firewall, packages
make tailscale      # VPN role
make k3s            # Kubernetes + Helm role
make argocd         # GitOps controller role
make semaphore      # Bootstrap Semaphore Secret on the home-server
make semaphore-targets  # Push Semaphore SSH key to all managed targets

make lint           # yamllint + ansible-lint + helm lint
make vault-edit     # Edit vault-encrypted vars (ansible/group_vars/all.yml)
make clean          # Remove cached Ansible collections and temp artifacts
```

## Architecture

```
Ansible (provisioning)
  └── ansible/site.yml          ← entry point; roles run in this order:
        common → dnsmasq → tailscale → k3s → argocd → semaphore_secrets
  └── ansible/group_vars/all.yml ← ALL configuration knobs; vault-encrypted secrets live here
  └── ansible/inventory/hosts.yml ← server address

k3s (Kubernetes, single-node)
  └── bundles Traefik v2 (ingress), CoreDNS, local-path-provisioner, metrics-server

ArgoCD (GitOps)
  └── argocd/bootstrap/root-applicationset.yaml
        ← discovers every directory under argocd/apps/* automatically
        ← each directory becomes an ArgoCD Application named after the folder,
           deployed into a namespace of the same name
        ← auto-syncs with prune + selfHeal on every push to main
  └── argocd/apps/<name>/      ← plain Kubernetes YAML, kustomize, OR a Helm chart
```

### Adding an application

```bash
mkdir -p argocd/apps/my-app
# Add Kubernetes YAML, kustomization.yaml, or a Helm chart (Chart.yaml + values.yaml)
git add argocd/apps/my-app && git commit -m "feat(apps): add my-app" && git push
# ArgoCD picks it up within ~3 minutes; namespace "my-app" is created automatically
```

## Server Access

```bash
# SSH into the server
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127

# kubectl (local context may point elsewhere — always go via SSH)
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 'sudo kubectl ...'
```

## Service URLs

| Service   | URL                         | Notes                   |
|-----------|-----------------------------|-------------------------|
| Grafana   | http://grafana.homeserver   | user: `admin`           |
| ArgoCD    | http://\<server-ip\>:30080  | HTTPS on 30443          |
| Headlamp  | http://headlamp.homeserver  | Kubernetes dashboard    |
| Semaphore | http://semaphore.homeserver | Ansible UI              |

```bash
# Retrieve Grafana admin password:
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n monitoring get secret monitoring-grafana \
   -o jsonpath="{.data.admin-password}" | base64 -d; echo'
```

## Secrets

All secrets are stored in `ansible/group_vars/all.yml` using Ansible Vault. To add or rotate a secret:

```bash
ansible-vault encrypt_string 'the-secret-value' --name 'variable_name'
# paste the resulting `!vault |` block into group_vars/all.yml
make vault-edit  # to open the file directly in your editor
```

The Tailscale auth key (`tailscale_auth_key`) must always be vault-encrypted. Never commit plaintext secrets.

## Lint rules

- `yamllint` config: `.yamllint` — applied to `ansible/` and `argocd/`
- `ansible-lint` config: `.ansible-lint`
- Helm charts are linted with `helm lint`
- `charts/`, `Chart.lock`, and `*.tgz` are git-ignored (vendored chart tarballs are the exception when checked in deliberately, e.g. `headlamp`)

## Key configuration variables (ansible/group_vars/all.yml)

| Variable | Purpose |
|---|---|
| `hostname` | Server hostname |
| `auto_upgrade` | Keep OS + components on latest (default: true) |
| `k3s_channel` / `k3s_version` | Pin or float k3s version |
| `argocd_repo_url` | Git repo ArgoCD syncs from |
| `tailscale_auth_key` | Vault-encrypted WireGuard auth key |

## Monitoring

`argocd/apps/monitoring/` — deployed automatically by ArgoCD.

- **VMSingle** — TSDB (15-day retention, 10 Gi `local-path` PVC)
- **VMAgent** — scrapes `VMServiceScrape`/`VMPodScrape` and auto-converts Prometheus `ServiceMonitor` CRDs
- **Host metrics** — `prometheus-node-exporter` DaemonSet
- **Cluster metrics** — kubelet/cAdvisor, kube-apiserver, kube-state-metrics, CoreDNS; scheduler/controller-manager/etcd scrapes are disabled (k3s runs them in a single process)
- **Alerts** — default kube-prometheus rule set; routed to a `blackhole` receiver until Discord/Slack/Gotify is wired in `values.yaml`
- **Grafana** — available at `http://grafana.homeserver` (LAN + Tailnet via dnsmasq); ships Node Exporter Full, VictoriaMetrics, and Kubernetes Views dashboards

## Gotchas

- **kubectl context**: Your local kubeconfig may point to a different cluster (e.g. `kind`). Always run `kubectl` via SSH or explicitly set `--kubeconfig`.
- **Helm OCI charts**: Some apps (e.g. `kubeseal-webgui`) use OCI registries (`oci://ghcr.io/...`). The `repository:` field must use the `oci://` prefix — HTTP Helm repo URLs will 404 even if the chart exists at the OCI registry.
- **Grafana sidecar + dashboards conflict**: Setting both `grafana.sidecar.dashboards.enabled: true` and `grafana.dashboards:` in the same values file causes a Helm template error. Use the sidecar only; default dashboards are shipped via labeled ConfigMaps.
- **Grafana fresh DB**: If Grafana crashes with `no such column: is_service_account`, delete the corrupt `grafana.db` directly from the PVC on the host and restart the deployment. The PVC path is `/var/lib/rancher/k3s/storage/<pvc-name>_monitoring_monitoring-grafana/`.

## Networking

No public ports. All remote access is via Tailscale. Traefik handles HTTP/HTTPS ingress within the LAN/Tailnet on ports 80/443. ArgoCD UI is available on NodePorts 30080/30443.
