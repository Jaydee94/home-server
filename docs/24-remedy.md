# Remedy

[Remedy](https://github.com/Jaydee94/remedy) ist ein KI-Operator für dieses Home-Lab. Er liest Alerts aus dem
Alertmanager und Metriken aus VictoriaMetrics, schaut per SSH auf den NAS und schlägt Änderungen vor, die ein Mensch
freigibt. Installiert wird ein Release des OCI-Charts, nicht der Quellcode.

| | |
|---|---|
| URL | http://remedy.homeserver |
| Namespace | `remedy` (PSS `restricted`, zusätzlich `templates/namespace.yaml`) |
| Quelle | [`argocd/apps/remedy/`](../argocd/apps/remedy/) (Wrapper-Chart, Werte unter `remedy:`) |
| Chart | `oci://ghcr.io/jaydee94/charts/remedy` 0.21.0, Images `remedy-server` und `remedy-runner` mit Tag = `appVersion` |
| Datenbank | PostgreSQL vom Chart (StatefulSet `remedy-postgres`, Image-Tag gepinnt auf `16.15`) |
| Runbooks | im Remedy-Repo: `docs/runbook/homelab-deploy.md`, `docs/runbook/postgres.md` |

## Architektur

| Teil | Details |
|---|---|
| Pods | `remedy-server` (Port 8080), `remedy-runner-0` (Claude-CLI, Claim `state-remedy-runner-0`), `remedy-postgres-0` (Claim `data-remedy-postgres-0`) |
| Backup | CronJob `remedy-postgres-backup` schreibt nachts einen Dump auf den Claim `remedy-postgres-backup` (Chart-Default 03:17); das restic-Backup des Hosts um 04:00 nimmt ihn mit ([Backup](26-backup.md)) |
| Cluster-Rechte | nur lesend (`cluster.write.enabled: false`): kein Write-Token, kein CronJob, kein PostSync-Hook |
| Ausgehend | DNS, API-Server `192.168.178.127:6443`, NAS `192.168.178.118:22`, Alertmanager (`monitoring`, 9093), VictoriaMetrics (`monitoring`, 8428), HTTPS |

Der Namespace `monitoring` lässt `remedy` in seiner NetworkPolicy zu
(`argocd/apps/monitoring/templates/networkpolicy.yaml`). Die VictoriaMetrics-Adresse wird auf der Setup-Seite von
Remedy eingetragen, nicht in `values.yaml`. `*.homeserver` löst Pi-hole per Wildcard auf ([Pi-hole](15-pihole.md)).

## Secrets

Beide SealedSecrets werden von Hand erzeugt und als Datei unter `argocd/apps/remedy/templates/` committet.

| SealedSecret | Keys | Datei |
|---|---|---|
| `remedy-secrets` | `admin-password`, `runner-token`, `master-key` | `sealedsecret-remedy.yaml` |
| `remedy-postgres` | `password` (kommt als `PGPASSWORD` in den Server) | `sealedsecret-postgres.yaml` |

Der Master-Key verschlüsselt das GitHub-Token und die SSH-Zugangsdaten aller Hosts. Geht er verloren, müssen diese
Logins neu eingegeben werden. Die Werte entstehen auf dem Server in einer Pipe und berühren keine Platte:

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'printf "admin-password=%s\nrunner-token=%s\nmaster-key=%s\n" "$(openssl rand -hex 12)" "$(openssl rand -hex 24)" "$(openssl rand -base64 32)" \
   | sudo kubectl -n remedy create secret generic remedy-secrets --from-env-file=/dev/stdin --dry-run=client -o yaml \
   | sudo kubeseal --format yaml --controller-name sealed-secrets-controller --controller-namespace sealed-secrets' \
  > argocd/apps/remedy/templates/sealedsecret-remedy.yaml
grep -c 'stringData\|^data:' argocd/apps/remedy/templates/sealedsecret-remedy.yaml   # erwartet: 0
```

Ein neu erzeugtes `remedy-postgres` ändert das Passwort einer bestehenden Datenbank nicht. Dann zusätzlich im Pod
`\password remedy` in `psql` ausführen.

## Ersteinrichtung

1. Admin-Passwort und Master-Key auslesen, den Master-Key in den Passwortmanager legen:

```bash
sudo kubectl -n remedy get secret remedy-secrets -o jsonpath='{.data.admin-password}' | base64 -d; echo
sudo kubectl -n remedy get secret remedy-secrets -o jsonpath='{.data.master-key}' | base64 -d; echo
```

2. Die Claude-CLI im Runner einmal anmelden (`/login`, URL im Browser öffnen, Code einfügen, `/exit`):

```bash
ssh -t -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n remedy exec -it remedy-runner-0 -c runner -- /opt/claude/claude'
```

3. Geheimnisse wie den NAS-Key oder das GitHub-Token nur über einen verschlüsselten Weg eingeben, also Tailscale oder
   `sudo kubectl -n remedy port-forward svc/remedy-server 8080:8080`. Nie über `http://remedy.homeserver` im LAN.

## Update

Die Chart-Version in `Chart.yaml` und den Block `remedy.runner.cli` in `values.yaml` immer im selben PR ändern. Der
CLI-Pin (Version, URL-Template, SHA-256 je Plattform) kommt aus `deploy/cli-pin.yaml` des Release-Tags im
Remedy-Repo; Renovate kennt ihn nicht. Vor dem Bump prüfen, ob der Release existiert:

```bash
helm show chart oci://ghcr.io/jaydee94/charts/remedy --version <X.Y.Z>
helm dependency build argocd/apps/remedy && helm template remedy argocd/apps/remedy --namespace remedy
```

## Betrieb

```bash
sudo kubectl -n argocd get application remedy
sudo kubectl -n remedy get pods,pvc,cronjob,sealedsecret,networkpolicy
```

Zum Abbauen das Verzeichnis per PR löschen. Die Ressourcen bleiben danach stehen
([Gotchas: ArgoCD / GitOps](gotchas.md#argocd--gitops)) und verschwinden erst mit
`sudo kubectl delete namespace remedy`, das auch die Datenbank- und Backup-PVCs löscht. Der Eintrag `remedy` in der
Monitoring-NetworkPolicy darf stehen bleiben.

## Fallstricke

- Den Postgres-Tag nicht auf den Chart-Default anheben. Das Datenverzeichnis stammt von PostgreSQL 16, und
  PostgreSQL 18 verweigert es: Server und Datenbank crashen, die Dumps schlagen fehl. Ein Major-Wechsel geht nur per
  Dump und Restore (Remedy-Runbook `postgres.md`).
- Die NetworkPolicy des Charts für `remedy-postgres` deklariert Egress ohne Regeln, deshalb bekommen neue
  Backup-Pods ein RST. Die zusätzliche Policy `remedy-postgres-backup-egress`
  (`templates/networkpolicy-postgres-egress.yaml`) erlaubt die Antworten auf Port 5432.
- Timeout bei der Alertmanager-Adresse im Setup: Es fehlt entweder die Egress-Regel (`networkPolicy.alertmanager`)
  oder die Freigabe in `monitoring`. Der Alertmanager ist ein headless Service, die Regel selektiert deshalb Pods,
  siehe [Gotchas: NetworkPolicies](gotchas.md#networkpolicies).
- Pods in `ContainerCreating` mit fehlendem Secret: Das SealedSecret muss für diesen Cluster, den Namespace `remedy`
  und genau den Secret-Namen erzeugt sein (`sudo kubectl -n remedy describe sealedsecret remedy-secrets`).
