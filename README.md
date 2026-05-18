<p align="center">
  <img src="docs/assets/banner.svg" alt="home-server — GitOps Home Lab on k3s, ArgoCD, Tailscale" width="100%" />
</p>

<p align="center">
  <a href="https://ubuntu.com/server"><img alt="Ubuntu" src="https://img.shields.io/badge/Ubuntu-24.04_LTS-E95420?style=for-the-badge&logo=ubuntu&logoColor=white"></a>
  <a href="https://k3s.io"><img alt="k3s" src="https://img.shields.io/badge/k3s-v1.29-FFC61C?style=for-the-badge&logo=k3s&logoColor=black"></a>
  <a href="https://argo-cd.readthedocs.io"><img alt="ArgoCD" src="https://img.shields.io/badge/ArgoCD-GitOps-EF7B4D?style=for-the-badge&logo=argo&logoColor=white"></a>
  <a href="https://tailscale.com"><img alt="Tailscale" src="https://img.shields.io/badge/Tailscale-VPN-246FDB?style=for-the-badge&logo=tailscale&logoColor=white"></a>
  <a href="https://www.ansible.com"><img alt="Ansible" src="https://img.shields.io/badge/Ansible-IaC-EE0000?style=for-the-badge&logo=ansible&logoColor=white"></a>
</p>

<p align="center">
  <b>A fully automated, GitOps-driven home server on a single machine.</b><br/>
  One Ansible run gives you a hardened Ubuntu host, a lightweight Kubernetes cluster (<a href="https://k3s.io">k3s</a>), continuous delivery from Git (<a href="https://argo-cd.readthedocs.io">ArgoCD</a>), and zero-config remote access (<a href="https://tailscale.com">Tailscale</a>).
</p>

---

## TL;DR

```bash
# 1) Clone
git clone https://github.com/Jaydee94/home-server.git && cd home-server

# 2) Fill in your details (server IP, repo URL, Tailscale key)
$EDITOR ansible/inventory/hosts.yml
$EDITOR ansible/group_vars/all.yml

# 3) Install collections, then run it
make install   # or: ansible-galaxy collection install -r ansible/requirements.yml \
               #     && ansible-playbook -i ansible/inventory/hosts.yml ansible/site.yml --ask-vault-pass
```

When the playbook finishes you'll see the ArgoCD URL and admin password. That's it.

---

## What you get

| Layer            | Component                              | Notes                                                      |
|------------------|----------------------------------------|------------------------------------------------------------|
| Operating System | **Ubuntu Server 24.04 LTS**            | Hardened, UFW firewall, NTP-synced, swap off               |
| Kubernetes       | **k3s** (latest stable channel)        | Single-node, bundles Traefik, CoreDNS, local-path, metrics |
| GitOps           | **ArgoCD** + ApplicationSets           | Drop a folder under `argocd/apps/`, push, it deploys       |
| Web Ansible      | **Semaphore UI**                       | One-click `git pull && ansible-playbook` against your LAN  |
| Monitoring       | **VictoriaMetrics + Grafana**          | Single-node TSDB, vmagent, vmalert, Alertmanager, dashboards |
| Remote access    | **Tailscale**                          | WireGuard mesh VPN — no port forwarding, no public IP      |
| Ingress          | **Traefik v2** (bundled with k3s)      | HTTP/HTTPS routing into the cluster                        |
| Provisioning     | **Ansible** (≥ 2.14)                   | Fully idempotent, role-per-concern, vault for secrets      |

Hardware target: a small box with ≥ 4 GB RAM and ≥ 20 GB disk. Reference build: Intel i5, 32 GB RAM, 512 GB NVMe.

### Always up to date

`auto_upgrade: true` (default) makes every playbook run keep the entire stack current:

- **APT packages** — `apt dist-upgrade` on every run, plus `unattended-upgrades` configured for daily background security patches.
- **Tailscale** — `state: latest` for the `tailscale` package.
- **k3s** — follows `k3s_channel` (default `stable`), so the upstream installer pulls the latest release on every run. Pin by setting `k3s_version`.
- **Helm** — re-runs the official installer; replaces the binary when a newer Helm 3 release exists.
- **ArgoCD** — `helm upgrade --install` with no `--version` flag pulls the latest chart. Pin by setting `argocd_version`.
- **Reboot-if-required** — if APT marks `/var/run/reboot-required`, the playbook reboots the host and waits for it to come back (toggle with `auto_reboot_if_required`).

Set `auto_upgrade: false` in `ansible/group_vars/all.yml` to freeze everything at the pinned versions for reproducibility.

---

## Quick Start (5 steps)

> First time on the machine? Start with **[Ubuntu Server Install](docs/00-ubuntu-server-install.md)**.
> Full prerequisites are in **[docs/02-prerequisites.md](docs/02-prerequisites.md)**.

**1. Clone the repo**

```bash
git clone https://github.com/Jaydee94/home-server.git
cd home-server
```

**2. Point the inventory at your server**

```bash
$EDITOR ansible/inventory/hosts.yml
# Change ansible_host (server IP) and ansible_ssh_private_key_file if needed.
```

**3. Set your variables**

```bash
$EDITOR ansible/group_vars/all.yml
# Required: argocd_repo_url, local_subnet, timezone.
# Tailscale key must be vault-encrypted (next step).
```

**4. Encrypt the Tailscale auth key**

```bash
ansible-vault encrypt_string 'tskey-auth-YOUR_KEY_HERE' --name 'tailscale_auth_key'
# Paste the !vault block over the existing tailscale_auth_key value in all.yml.
```

**5. Run it**

```bash
make install
# or, without make:
ansible-galaxy collection install -r ansible/requirements.yml
ansible-playbook -i ansible/inventory/hosts.yml ansible/site.yml --ask-vault-pass
```

After completion the playbook prints:

```
ArgoCD UI:  http://<server-ip>:30080
Username:   admin
Password:   <auto-generated>
```

---

## Repository Layout

```
home-server/
├── README.md
├── Makefile                          # Convenience targets: install, lint, ping, check
├── docs/
│   ├── 00-ubuntu-server-install.md   # Bare-metal Ubuntu install
│   ├── 01-overview.md                # Architecture diagrams
│   ├── 02-prerequisites.md           # Requirements & pre-flight checks
│   ├── 03-installation.md            # Step-by-step setup
│   ├── 04-k3s.md                     # k3s + kubectl reference
│   ├── 05-argocd.md                  # GitOps usage
│   ├── 06-tailscale.md               # VPN setup
│   ├── 07-troubleshooting.md         # Common issues
│   └── assets/banner.svg
├── ansible/
│   ├── site.yml                      # Entry point
│   ├── requirements.yml              # Galaxy collections
│   ├── ansible.cfg                   # Sensible defaults
│   ├── inventory/hosts.yml           # Your server
│   ├── group_vars/all.yml            # All knobs
│   └── roles/{common,tailscale,k3s,argocd}/
└── argocd/
    ├── bootstrap/root-applicationset.yaml  # Reference manifest
    └── apps/example-whoami/                # Example Helm chart
```

---

## Monitoring

A lightweight VictoriaMetrics + Grafana stack lives under
`argocd/apps/monitoring/` and is rolled out by ArgoCD automatically.

- **TSDB:** VMSingle (15 d retention, 10 Gi `local-path` PVC).
- **Scrapers:** VMAgent picks up every `VMServiceScrape`/`VMPodScrape` and
  any Prometheus `ServiceMonitor` (auto-converted by the operator).
- **Host metrics:** `prometheus-node-exporter` DaemonSet covers the Ubuntu host.
- **Cluster metrics:** kubelet/cAdvisor, kube-apiserver, kube-state-metrics, CoreDNS.
  Scheduler / controller-manager / etcd scrapes are disabled — k3s bakes
  them into a single process.
- **Alerts:** Default kube-prometheus rule set, routed to a `blackhole`
  receiver until you wire up Discord/Slack/Gotify in `values.yaml`.
- **Dashboards:** Node Exporter Full, VictoriaMetrics, plus the Kubernetes
  "Views / Global, Namespaces, Nodes, Pods" set from grafana.com.

Open Grafana at **http://grafana.homeserver** (LAN + Tailnet via dnsmasq).
Username `admin`, password from the auto-generated secret:

```bash
kubectl -n monitoring get secret monitoring-grafana \
  -o jsonpath='{.data.admin-password}' | base64 -d; echo
```

---

## Adding an Application (the GitOps way)

```bash
mkdir -p argocd/apps/my-app
# Drop plain Kubernetes YAML, kustomization.yaml, or a Helm chart inside.
git add argocd/apps/my-app && git commit -m "feat(apps): add my-app" && git push
```

Within ~3 minutes ArgoCD picks up the new directory, creates an `Application` named `my-app` in a `my-app` namespace, and syncs it. See **[docs/05-argocd.md](docs/05-argocd.md)** for details.

---

## Networking & Security

- **No public ports.** Internet-facing access is via Tailscale only.
- **UFW** allows just what the stack needs: SSH, HTTP/HTTPS, k3s API, ArgoCD NodePort, kubelet, Flannel VXLAN, Tailscale UDP, plus full trust for LAN, Tailnet, pod and service CIDRs.
- **Ansible Vault** encrypts the Tailscale auth key at rest.
- **ArgoCD** uses read-only access to the Git repository.

| Port  | Proto | Scope             | Purpose                  |
|-------|-------|-------------------|--------------------------|
| 22    | TCP   | LAN + Tailnet     | SSH                      |
| 80    | TCP   | LAN + Tailnet     | Traefik HTTP             |
| 443   | TCP   | LAN + Tailnet     | Traefik HTTPS            |
| 6443  | TCP   | LAN + Tailnet     | k3s API                  |
| 30080 | TCP   | LAN + Tailnet     | ArgoCD UI (HTTP)         |
| 30443 | TCP   | LAN + Tailnet     | ArgoCD UI (HTTPS)        |
| 41641 | UDP   | Internet          | Tailscale WireGuard      |

Full architecture in **[docs/01-overview.md](docs/01-overview.md)**.

---

## Documentation

| Doc                                                             | What it covers                              |
|-----------------------------------------------------------------|---------------------------------------------|
| [Ubuntu Server Install](docs/00-ubuntu-server-install.md)       | ISO, USB stick, install wizard, first boot  |
| [Architecture Overview](docs/01-overview.md)                    | Components and how traffic flows            |
| [Prerequisites](docs/02-prerequisites.md)                       | What you need before running Ansible        |
| [Installation Guide](docs/03-installation.md)                   | Full step-by-step walkthrough               |
| [k3s Reference](docs/04-k3s.md)                                 | Config, kubectl cheat-sheet, upgrades       |
| [ArgoCD GitOps](docs/05-argocd.md)                              | App workflow, CLI, sync policies            |
| [Tailscale VPN](docs/06-tailscale.md)                           | Auth keys, MagicDNS, subnet routes          |
| [Troubleshooting](docs/07-troubleshooting.md)                   | Diagnostic playbook for common failures     |
| [Semaphore UI](docs/08-semaphore.md)                            | Web UI to run playbooks against Raspi/NAS   |
| [DNS Architecture](docs/09-dns-architecture.md)                 | Why the home-server is NOT your LAN DNS     |

---

## License

MIT — see [LICENSE](LICENSE).
