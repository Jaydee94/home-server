# Troubleshooting

Bei einer Störung von unten nach oben prüfen: Host, k3s, Pods, ArgoCD, DNS, Tailscale. Fallstricke einzelner Dienste stehen in [Gotchas](gotchas.md).

## Diagnose-Einstieg

Der Skill `/cluster-health` erledigt die Schritte 2 bis 4 in einem Durchgang.

| Schritt | Prüfung | Weiter bei Fehler |
|---|---|---|
| 1. Host | `ssh jaydee@192.168.178.127`, `free -h`, `df -h /` | [Ansible und SSH](#ansible-und-ssh), [Platte voll](#platte-voll) |
| 2. k3s | `sudo systemctl status k3s`, `sudo kubectl get nodes` | [k3s startet nicht](#k3s-startet-nicht) |
| 3. Pods | `sudo kubectl get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded` | [Pod hängt in Pending](#pod-hängt-in-pending) |
| 4. ArgoCD | `sudo kubectl -n argocd get applications` | [App bleibt OutOfSync oder Degraded](#app-bleibt-outofsync-oder-degraded) |
| 5. DNS | `dig @192.168.178.2 grafana.homeserver +short` | [`*.homeserver` löst nicht auf](#homeserver-löst-nicht-auf) |
| 6. Tailscale | `tailscale status` | [Tailscale nach dem Playbook getrennt](#tailscale-nach-dem-playbook-getrennt) |

Aktive Alarme und die Logs auch von bereits gelöschten Pods findest du in Grafana ([Monitoring](13-monitoring.md)). Für die Events eines Namespaces:

```bash
sudo kubectl get events -n <namespace> --sort-by=.lastTimestamp | tail -20
sudo kubectl logs -n <namespace> <pod> --previous
```

## k3s startet nicht

Zuerst das Log lesen:

```bash
sudo journalctl -u k3s --since "10 minutes ago" -n 100
```

Swap, `br_netfilter`, `overlay` und IP-Forwarding setzt die `common`-Rolle, `/etc/rancher/k3s/config.yaml` schreibt die `k3s`-Rolle. Hat jemand am Host etwas davon geändert, stellt `make common` und danach `make k3s` den Sollzustand wieder her. Hängt das Playbook bei „Wait for the k3s API server to report ready“, läuft k3s zwar, die API kommt aber nicht hoch: auch dann steht der Grund im Journal.

## App bleibt OutOfSync oder Degraded

```bash
sudo kubectl -n argocd describe application <name> | sed -n '/Conditions/,$p'
sudo kubectl -n argocd logs deploy/argocd-repo-server --tail=100 | grep -i error
```

Render-Fehler (Helm, Kustomize) stehen im Log des repo-servers. Nach fünf Fehlversuchen gibt ArgoCD den automatischen Retry auf. Ist die Ursache behoben, startet ein Hard-Refresh den Sync neu:

```bash
sudo kubectl -n argocd annotate application <name> argocd.argoproj.io/refresh=hard --overwrite
```

Meldet die App „pruning skipped“, schützt eine Annotation eine PVC vor dem Löschen. Das ist Absicht, siehe [Gotchas: ArgoCD / GitOps](gotchas.md#argocd--gitops). Dort steht auch, warum ein Feld unter `ignoreDifferences` nie angewendet wird.

## Pod hängt in Pending

```bash
sudo kubectl describe pod <pod> -n <namespace> | sed -n '/Events/,$p'
sudo kubectl get pvc -n <namespace>
```

`local-path`-PVCs bleiben `Pending`, bis ein Pod sie nutzt (`WaitForFirstConsumer`), das allein ist kein Fehler. Meldet der Scheduler `Insufficient memory`, sind die Requests aller Pods größer als das Allocatable des Nodes (`sudo kubectl describe node homeserver`). Das Allocatable ist um `k3s_kubelet_system_reserved` kleiner als der RAM ([k3s](04-k3s.md#konfiguration)).

## `*.homeserver` löst nicht auf

Pi-hole auf `192.168.178.2` ist der einzige Resolver für die Zone.

```bash
dig @192.168.178.2 grafana.homeserver +short     # erwartet 192.168.178.127
sudo kubectl -n pihole get svc | grep dns        # EXTERNAL-IP 192.168.178.2
resolvectl status | grep "Current DNS"           # Host fragt 192.168.178.2
```

Zeigt der DNS-Service keine EXTERNAL-IP, liegt es meist an MetalLB ([Gotchas: MetalLB](gotchas.md#metallb--networking)). Über Tailscale braucht der Client Split DNS und eine aktive Subnet-Route ([Tailscale](06-tailscale.md#einrichtung-im-tailnet)). Schlägt die Auflösung nur in Pods fehl, siehe [Gotchas: Pi-hole / DNS](gotchas.md#pi-hole--dns). Mehr in [Pi-hole](15-pihole.md).

## Tailscale nach dem Playbook getrennt

Das Playbook bleibt grün, auch wenn der Tailscale-Login fehlschlägt. Im Log steht dann „WARNING: Tailscale is not connected“. Fast immer ist der Auth-Key abgelaufen: neuen Key erzeugen und verschlüsselt als `tailscale_auth_key` hinterlegen ([Tailscale](06-tailscale.md#einrichtung-im-tailnet)) oder einmal von Hand einloggen ([Tailscale: Betrieb](06-tailscale.md#betrieb)).

## Ansible und SSH

Die UFW lässt SSH nur aus dem LAN, dem Tailnet und dem Pod-CIDR zu, und nur über IPv4. Ein `ssh` über eine IPv6-Adresse oder aus einem fremden Netz läuft deshalb in einen Timeout ([Gotchas: Host](gotchas.md#host-hardening-common-rolle)).

```bash
make ping                                       # Ansible-Verbindung
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 'echo ok'
```

„Decryption failed“ heißt falsches Vault-Passwort. Fehlende Collections installiert `make deps`.

## Platte voll

Unbenutzte Images räumt die Image-GC ab 75 % Belegung auf, das Journal ist auf 500 MB begrenzt (`journald_system_max_use`). Wächst die Platte trotzdem, liegt es meist an einem Volume unter `/var/lib/rancher/k3s/storage/`, denn `local-path` kennt keine Quota:

```bash
sudo du -sh /var/lib/rancher/k3s/storage/* | sort -h | tail
```
