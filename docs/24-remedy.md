# 24 – Remedy

**[Remedy](https://github.com/Jaydee94/remedy)** ist ein KI-Operator für dieses Home-Lab: Er liest Alerts
(Alertmanager), schaut per SSH auf den NAS und schlägt Änderungen vor, die ein Mensch freigibt. Er wird hier
aus einem **Release** des Remedy-Charts installiert (OCI-Artefakt), nicht aus dem Quellcode.

| | |
|---|---|
| App | `argocd/apps/remedy/` (Wrapper-Chart: eine Dependency auf den Remedy-Chart, Werte unter `remedy:`) |
| Namespace | `remedy` (vom ApplicationSet per `CreateNamespace`, zusätzlich als `Namespace`-Manifest mit PSS `restricted`) |
| Chart | `oci://ghcr.io/jaydee94/charts/remedy`, Version exakt gepinnt in `Chart.yaml` |
| Images | `ghcr.io/jaydee94/remedy-server` und `remedy-runner`, Tag = Chart-`appVersion` |
| URL | <http://remedy.homeserver> (Traefik, HTTP, LAN und Tailscale) |
| Secret | SealedSecret `remedy-secrets` (Admin-Passwort, Runner-Token, Master-Key), **von Hand erzeugt** |
| Datenbank | PostgreSQL 16, vom Remedy-Chart mitinstalliert (StatefulSet `remedy-postgres`, Datenclaim `data-remedy-postgres-0`, nächtlicher Dump auf dem Claim `remedy-postgres-backup`); Passwort im SealedSecret `remedy-postgres` (Schlüssel `password`), **von Hand erzeugt** |
| Cluster | nur Lesezugriff (`cluster.write.enabled: false`): kein Write-Token, kein CronJob, kein PostSync-Hook |
| Ausgehend | nur DNS, API-Server `192.168.178.127:6443`, SSH zum NAS `192.168.178.118:22`, Alertmanager (`monitoring`, Port 9093), VictoriaMetrics (`monitoring`, Port 8428), HTTPS |

Die Betriebsanleitung, der Ablauf der Übung (Drill) und die Fehlersuche stehen im Remedy-Repository:
`docs/runbook/homelab-deploy.md` und `docs/runbook/home-server-drill.md`. Dieses Dokument beschreibt nur, was
in **diesem** Repository und auf dem Server zu tun ist.

> **Stand:** Noch nie auf diesem Cluster synchronisiert. Dass Argo CD einen Wrapper-Chart mit OCI-Dependency
> baut und dass ein `Namespace`-Manifest neben `CreateNamespace` akzeptiert wird, ist **ungeprüft**; der erste
> Sync ist der Beweis.

## 1. Voraussetzungen

- Der Remedy-Release in `Chart.yaml` ist veröffentlicht. `0.9.0` enthält die Chart-Werte
  `networkPolicy.hosts` und `networkPolicy.alertmanager` und war beim Schreiben **noch nicht veröffentlicht**.
  Prüfen: `helm show chart oci://ghcr.io/jaydee94/charts/remedy --version 0.9.0`. Fehlt der Release, schlägt
  `helm dependency build` fehl (auch der CI-Job `helm lint (all charts)`). Dann den Pull Request nicht mergen.
- Die drei Pakete `remedy-server`, `remedy-runner` und `charts/remedy` sind öffentlich (am 2026-10-21 für `0.8.0`
  anonym abgefragt); der Cluster kann keine privaten Pakete ziehen.
- Der CLI-Pin in `values.yaml` (`remedy.runner.cli`) ist der von `deploy/cli-pin.yaml` **des Release-Tags**
  (`https://github.com/Jaydee94/remedy/blob/v0.9.0/deploy/cli-pin.yaml`). Beim Schreiben verglichen mit Version
  2.1.292; bei einem anderen Release vergleichen.
- Pi-hole braucht keinen Eintrag: `address=/homeserver/192.168.178.127` deckt `remedy.homeserver` ab
  (`docs/09-dns-architecture.md`).

## 2. Lokal rendern

Das geht ohne das SealedSecret (die Pods warten später auf das Secret, gerendert wird es nicht):

```bash
helm dependency build argocd/apps/remedy
helm template remedy argocd/apps/remedy --namespace remedy
```

Erwartet: kein `fail`; die NetworkPolicy `remedy-server` hat eine Egress-Regel nach `192.168.178.118/32` Port 22
und eine zum Alertmanager; kein Objekt `remedy-write-token`, keine `remedy-token-refresh*`.

## 3. Das SealedSecret erzeugen (von Hand, auf dem Server)

Drei Werte, einmal erzeugt, nie im Klartext auf einer Platte oder in Git. Der **Master-Key** versiegelt das
GitHub-Token **und die SSH-Zugangsdaten jedes Hosts**; geht er verloren, müssen die Logins neu eingegeben werden
(sonst nichts). `kubeseal` läuft auf dem Server (lokaler kubeconfig zeigt auf kind, siehe `docs/gotchas.md`);
die Werte entstehen dort in der Pipe und das Secret im Klartext berührt keine Datei. Vom Repository-Verzeichnis
aus (die Datei entsteht lokal, nur die versiegelte Ausgabe läuft zurück):

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'printf "admin-password=%s\nrunner-token=%s\nmaster-key=%s\n" "$(openssl rand -hex 12)" "$(openssl rand -hex 24)" "$(openssl rand -base64 32)" \
   | sudo kubectl -n remedy create secret generic remedy-secrets --from-env-file=/dev/stdin --dry-run=client -o yaml \
   | sudo kubeseal --format yaml --controller-name sealed-secrets-controller --controller-namespace sealed-secrets' \
  > argocd/apps/remedy/templates/sealedsecret-remedy.yaml
```

Prüfen, dass die Datei nur Chiffretext enthält und im Namespace `remedy` gilt:

```bash
grep -nE '^(kind|  name|  namespace|  encryptedData|    (admin-password|runner-token|master-key)):' argocd/apps/remedy/templates/sealedsecret-remedy.yaml | cut -c1-60
grep -c 'stringData\|^data:' argocd/apps/remedy/templates/sealedsecret-remedy.yaml   # erwartet: 0
```

Ist `kubeseal` auf dem Server nicht installiert: Zertifikat dort holen (`kubeseal --fetch-cert --controller-name
sealed-secrets-controller --controller-namespace sealed-secrets`) und lokal mit `kubeseal --cert` versiegeln; die
Werte dürfen trotzdem nicht auf eine Platte.

Commit nur die versiegelte Datei. Das SealedSecret ist an Namespace und Name gebunden (`remedy`, `remedy-secrets`).

### Das Datenbank-Passwort (`remedy-postgres`)

Seit Remedy 0.16.0 ist PostgreSQL die einzige Datenbank (kein SQLite mehr), und der Chart installiert sie selbst.
Dafür gibt es ein zweites SealedSecret `remedy-postgres` mit dem Schlüssel `password`
(`argocd/apps/remedy/templates/sealedsecret-postgres.yaml`). Das Passwort entsteht in einer Pipe
(`openssl rand -hex 24 | read` → `printf` → `kubeseal`), landet nie auf einer Platte und nie in einer
Prozessliste; versiegelt wird mit dem Zertifikat des Controllers (`kubeseal --fetch-cert`). Der Server bekommt es als
`PGPASSWORD`, die Datenbank-URL enthält keins. Eine Neuerzeugung ändert das Passwort **nicht** in einer bestehenden
Datenbank: dann `\password remedy` in `psql` im Pod ausführen (Remedy `docs/runbook/postgres.md`).

**Keine Datenmigration.** Der Wechsel von 0.15.x (SQLite) auf 0.16.0 startet mit einer leeren Datenbank
(Entscheidung des Maintainers, 2026-10-22): GitHub-Token, Hosts, Zugangsdaten und Einstellungen müssen in der UI neu
eingegeben werden. Der Runner-Login (eigener Claim `state-remedy-runner-0`) und `remedy-secrets` (Master-Key)
bleiben erhalten. Der alte Claim `remedy-data` wird von Argo CD (`prune`) entfernt; wer `remedy.db` noch braucht,
kopiert sie **vor dem Merge** heraus.

## 4. Pull Request, Merge, erster Sync

1. Pull Request öffnen (Titel `feat: ...`, CI grün), der Maintainer merged, Argo CD legt die Application `remedy`
   an (ca. 3 Minuten oder **Refresh** in der Argo-CD-UI).
2. Beobachten:

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n argocd get application remedy; sudo kubectl -n remedy get pods,svc,ingress,pvc,sealedsecret,secret,networkpolicy'
```

Erwartet: `remedy-postgres-0`, `remedy-server` und `remedy-runner-0` werden `Ready` (der Server startet erst, wenn
die Datenbank antwortet, und kann dabei einmal neu starten); der Init-Container `install-cli` lädt die CLI (HTTPS
ins Internet) und prüft die SHA-256; es gibt den CronJob `remedy-postgres-backup` (nächtlicher Dump), sonst keinen Job.

3. Admin-Passwort und Master-Key aus dem Cluster lesen, **den Master-Key in den Passwortmanager** legen:

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n remedy get secret remedy-secrets -o jsonpath="{.data.admin-password}" | base64 -d; echo'
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n remedy get secret remedy-secrets -o jsonpath="{.data.master-key}" | base64 -d; echo'
```

4. Einmaliger Login der Claude-CLI im Runner (Details: Remedy `homelab-deploy.md`, Abschnitt 7):

```bash
ssh -t -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 'sudo kubectl -n remedy exec -it remedy-runner-0 -c runner -- /opt/claude/claude'
```

   Dort `/login`, URL im Browser öffnen, Code einfügen, `/exit`.

5. UI nur über einen **verschlüsselten Pfad** öffnen, wenn ein Geheimnis eingegeben wird (NAS-Key, GitHub-Token):
   `kubectl -n remedy port-forward svc/remedy-server 8080:8080` und `http://localhost:8080`, oder Tailscale.
   Nie den privaten NAS-Key über `http://remedy.homeserver` im LAN tippen.

## 5. Update

Ein neuer Release: `version` der Dependency in `Chart.yaml` **und** der `remedy.runner.cli`-Block in `values.yaml`
(aus `deploy/cli-pin.yaml` des neuen Tags) in **einem** Pull Request. Renovate kann die Dependency in
`Chart.yaml` erkennen, den kopierten CLI-Pin aber nicht: einen solchen Renovate-PR nicht mergen, bevor der Pin
verglichen wurde (ob Renovate die Dependency tatsächlich beobachtet, ist ungeprüft).

## 6. Abbauen

- Alles stoppen: `kubectl -n remedy scale deployment/remedy-server --replicas=0` (Argo CD stellt es mit `selfHeal`
  zurück: vorher Auto-Sync der Application aus) oder das Verzeichnis `argocd/apps/remedy/` per Pull Request löschen.
  Nichts anderes im Lab hängt von Remedy ab.
- Der Eintrag `remedy` in `argocd/apps/monitoring/templates/networkpolicy.yaml` darf beim Abbau stehen bleiben; er
  öffnet nur den Ingress in `monitoring` für einen Namespace, den es dann nicht mehr gibt.

## 7. Fehlersuche (erwartet, nicht gesehen)

| Symptom | Hinweis |
|---|---|
| Application `remedy` meldet `ComparisonError` / `helm dependency build` schlägt fehl | Der Release in `Chart.yaml` ist nicht veröffentlicht oder `charts/remedy` ist privat. `helm show chart oci://ghcr.io/jaydee94/charts/remedy --version <X.Y.Z>` prüfen. Fallback: den Chart des Release-Tags als lokale Dependency nach `argocd/apps/remedy/charts/remedy/` kopieren (Remedy `homelab-deploy.md`, Abschnitt 6). |
| Sync-Fehler zum Namespace `remedy` (zwei Quellen für dasselbe Objekt) | `templates/namespace.yaml` löschen und von Hand labeln: `kubectl label namespace remedy pod-security.kubernetes.io/enforce=restricted`. |
| Pods bleiben in `ContainerCreating`, Secret fehlt | `kubectl -n remedy describe sealedsecret remedy-secrets`; der Chiffretext muss gegen **diesen** Cluster, den Namespace `remedy` und den Namen `remedy-secrets` erzeugt sein. |
| `remedy-server` wird nie `Ready` (Probes auf 8080) | Mögliche NetworkPolicy-Wirkung von kube-router, ungeprüft: den Knotenbereich unter `remedy.networkPolicy.public.from` ergänzen; letzter Ausweg `networkPolicy.enabled: false` für die Dauer der Prüfung. |
| Alertmanager-Adresse in Setup: Timeout | Egress-Regel (`networkPolicy.alertmanager`) oder die Ingress-Regel in `monitoring` (`monitoring-namespace-isolation`) fehlt; siehe `docs/23-network-policies.md`. |
| Verbindungstest zum NAS: Timeout | `networkPolicy.hosts` (Adresse und Port) und die Erreichbarkeit von `192.168.178.118:22` vom Server aus prüfen. |
