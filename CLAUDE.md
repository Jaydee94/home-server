# CLAUDE.md

## What this repo is

A fully automated, GitOps-driven home server. Ansible provisions the host (Ubuntu 26.04 LTS); k3s runs Kubernetes; ArgoCD continuously syncs everything under `argocd/apps/` to the cluster; Tailscale provides VPN access with no public ports exposed.

## Commands

```bash
make deps / ping / check / install          # Galaxy deps, connectivity, dry-run, full provision
make common / tailscale / k3s / argocd      # Individual Ansible roles
make host-dns / scanner / semaphore         # DNS, scanner, Semaphore secret
make semaphore-targets / semaphore-bootstrap / semaphore-bootstrap-local
make nas / nas-check                        # UGREEN NAS deploy / dry-run
make lint / vault-edit / clean              # Lint, edit vault vars, cleanup
```

## Architecture

```
Ansible → ansible/site.yml (common → host_dns → tailscale → k3s → argocd → scanner → semaphore_secrets)
          ansible/group_vars/all.yml  ← ALL config knobs + vault secrets
k3s     → single-node; bundles Traefik v2, CoreDNS, local-path-provisioner
ArgoCD  → argocd/bootstrap/root-applicationset.yaml
           discovers every dir under argocd/apps/* → auto-syncs on push to main
```

**Adding an app:** `mkdir -p argocd/apps/my-app` + add YAML/Helm → commit+push → ArgoCD picks up in ~3 min.

## Server Access

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 'sudo kubectl ...'
```

## Service URLs

| Service | URL |
|---|---|
| Grafana | http://grafana.homeserver |
| ArgoCD | http://\<server-ip\>:30080 |
| Headlamp / Semaphore / Gotify | http://{headlamp,semaphore,gotify}.homeserver |
| Argo Workflows / MinIO | http://{argo-workflows,minio}.homeserver |
| Homepage / Pi-hole | http://home.homeserver · http://pihole.homeserver/admin/login |
| Jellyfin / Prowlarr / SABnzbd | http://{jellyfin,prowlarr,sabnzbd}.homeserver |
| Sonarr / Radarr / Seerr | http://{sonarr,radarr,seerr}.homeserver |
| Home Assistant / HA-MCP | http://homeassistant.homeserver · http://ha-mcp.homeserver/\<secret\> |
| Mosquitto | mqtt://192.168.178.4:1883 |
| Gameserver-UI / 7DTD | http://gameserver.homeserver · 100.x.x.x:26900 (Tailscale) |
| Paperless / OpenCode / DayPilot | http://jays-ugreen:{8000,4096,3003} |

## Secrets

`ansible/group_vars/all.yml` via Ansible Vault. `make vault-edit` to open. Never commit plaintext.

## Lint & CI

`yamllint` + `ansible-lint` + `helm lint` + `actionlint` · Trivy security scan (soft, non-blocking) · PRs only — never push directly to `main`; merge only on green CI.

## Claude Skills

| Skill | Invoke |
|---|---|
| cluster-health | `/cluster-health` |
| add-app | `/add-app` |
| forgecrate-advisor / repo-onboarding / repo-health | `/forgecrate-{advisor,repo-onboarding,repo-health}` |
| forgecrate-release / db-migration / handoff | `/forgecrate-{release,db-migration,handoff}` |

## Gotchas

→ **[docs/gotchas.md](docs/gotchas.md)** — MetalLB, Pi-hole, KubeVirt, Scanner, Semaphore, Media-Stack, HA-MCP, Tooling

## Networking

No public ports. All remote access via Tailscale. Traefik on 80/443. ArgoCD UI on 30080/30443.
