# CLAUDE.md

## What this repo is

A GitOps home server. Ansible provisions the host (Ubuntu 26.04 LTS), k3s runs Kubernetes, ArgoCD syncs everything under `argocd/apps/` (itself included) to the cluster, and Tailscale provides remote access without public ports. Human docs: `README.md` and `docs/`.

## Commands

```bash
make deps / ping / check / install          # Galaxy deps, connectivity, dry-run, full provision
make common / host-dns / tailscale / k3s    # Individual Ansible roles
make argocd / argocd-recover                # ArgoCD bootstrap / forced Helm reinstall from argocd/apps/argocd
make scanner / backup / semaphore           # Scanner, restic backup, Semaphore secret
make semaphore-targets / semaphore-bootstrap / semaphore-bootstrap-local
make nas / nas-check                        # UGREEN NAS deploy / dry-run
make render-bootstrap                       # Regenerate argocd/bootstrap/ from the role templates
make lint / clean
```

## Architecture

```text
Ansible  ansible/site.yml: common → host_dns → tailscale → k3s → argocd → scanner → semaphore_secrets → backup
         ansible/group_vars/all.yml holds all knobs and the inline vault secrets
k3s      single node with Traefik v3, CoreDNS, local-path-provisioner; MetalLB for LAN IPs
ArgoCD   argocd/bootstrap/root-applicationset.yaml turns every argocd/apps/<dir> into an
         Application in namespace <dir>, auto-synced from main
         ArgoCD manages itself via argocd/apps/argocd; the Ansible role only bootstraps
```

**Adding an app:** create `argocd/apps/<name>/` with YAML, Kustomize or a Helm chart, open a PR, merge on green CI; ArgoCD picks it up in about 3 minutes. An ingress hostname also goes into `ingressTls.hosts` in `argocd/apps/cert-manager/values.yaml`. Own charts reuse the Service/Ingress/PVC/NetworkPolicy templates from `argocd/lib/common` (`file://../../lib/common`, see its README).

**Changing ArgoCD:** chart version in `argocd/apps/argocd/Chart.yaml`, Helm values under `argo-cd:` in `argocd/apps/argocd/values.yaml`. Both are read by the Ansible bootstrap too, so keep them static (no Jinja).

## Server access

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 'sudo kubectl ...'
```

## Service URLs

| Service | URL |
|---|---|
| Homepage | http://home.homeserver |
| ArgoCD | http://192.168.178.127:30080 |
| Grafana / ntfy | http://{grafana,ntfy}.homeserver |
| Headlamp / Semaphore / Gotify | http://{headlamp,semaphore,gotify}.homeserver |
| Pi-hole | http://pihole.homeserver/admin/login |
| Jellyfin / Prowlarr / SABnzbd | http://{jellyfin,prowlarr,sabnzbd}.homeserver |
| Sonarr / Radarr / Seerr | http://{sonarr,radarr,seerr}.homeserver |
| Home Assistant / HA-MCP | http://homeassistant.homeserver, http://ha-mcp.homeserver/\<secret\> |
| Remedy / Paperless-AI | http://{remedy,paperless-ai}.homeserver |
| Mosquitto | mqtt://192.168.178.4:1883 |
| Gameserver-UI / 7DTD | http://gameserver.homeserver, 100.x.x.x:26900 (Tailscale) |
| RPS-Arena | http://rps-arena.homeserver, http://192.168.178.127:30808 |
| webtrees | http://webtrees.homeserver |
| Portainer / Paperless / OpenCode (NAS) | http://jays-ugreen:{9000,8000,4096} |

## Secrets

`ansible/group_vars/all.yml` is plaintext with inline vault values: create one with `ansible-vault encrypt_string '<value>' --name '<var>'`. `ansible/host_vars/ugreen-nas/vault.yml` is fully encrypted (`ansible-vault edit`). Cluster secrets are SealedSecrets. Never commit plaintext.

## Lint and CI

`yamllint`, `ansible-lint`, `helm lint`, `actionlint`, kubeconform and a non-blocking Trivy scan. Work on a branch and open a PR; never push to `main`, merge only on green CI.

## Claude skills

| Skill | Invoke |
|---|---|
| cluster-health | `/cluster-health` |
| add-app | `/add-app` |
| forgecrate-advisor / repo-onboarding / repo-health | `/forgecrate-{advisor,repo-onboarding,repo-health}` |
| forgecrate-release / db-migration / handoff | `/forgecrate-{release,db-migration,handoff}` |

## Gotchas

Read [docs/gotchas.md](docs/gotchas.md) before touching a component. Sections: Tooling, host hardening, AppArmor, ArgoCD/GitOps, SealedSecrets, MetalLB, NetworkPolicies, Pi-hole/DNS, Tailscale, TLS, Alerting, Grafana, VictoriaLogs, Disk/SMART, Home Assistant/HA-MCP, KubeVirt/Gameserver, Media-Stack, Scanner, Semaphore, UGREEN NAS/Portainer/Paperless.

## Networking

No public ports; remote access only through Tailscale. Traefik on 80/443, ArgoCD UI on NodePorts 30080/30443, Pi-hole on MetalLB `192.168.178.2`.
