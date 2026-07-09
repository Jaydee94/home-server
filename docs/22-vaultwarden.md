# 22 — Vaultwarden (Bitwarden-kompatibler Passwort-Manager)

[Vaultwarden](https://github.com/dani-garcia/vaultwarden) ist eine
Rust-Reimplementierung der Bitwarden-Server-API — ein einzelner Container +
SQLite, zu 100 % kompatibel zu allen offiziellen Bitwarden-Clients
(Web-Vault, Browser-Extension, Mobile-Apps, CLI, Desktop). Läuft als
ArgoCD-Applikation `argocd/apps/vaultwarden/` (lokales Helm-Chart, Namespace
`vaultwarden`), analog zu `argocd/apps/gotify/`.

**Wichtige Abweichung vom sonstigen `*.homeserver`-Muster:** Der Bitwarden
Web-Vault und die Browser-Extension verlangen zwingend einen Secure Context
(gültiges HTTPS-Zertifikat) — selbstsignierte Zertifikate scheitern
insbesondere bei Mobile-Apps zuverlässig. Da dieses Repo bewusst **keine
öffentlichen Ports** exponiert (kein Let's-Encrypt-HTTP01 möglich), zieht die
Ansible-Rolle `vaultwarden_tls` per `tailscale cert` ein echtes
Let's-Encrypt-Zertifikat für den **Tailnet-Hostnamen** des Home-Servers —
komplett ohne offenen Port. Vaultwarden ist deshalb unter diesem
Tailnet-FQDN erreichbar (z. B. `https://homeserver.tailXXXXX.ts.net`), nicht
unter `vaultwarden.homeserver`. Client-Geräte brauchen aktives Tailscale —
das ist im Repo für jeglichen Remote-Zugriff ohnehin Voraussetzung.

```
Client (Tailscale) ──HTTPS──▶ Traefik (tailnet-host, vaultwarden-tls Secret)
                                    │
                                    ▼
                              vaultwarden Pod ── PVC "data" (local-path SSD)
                                                   db.sqlite3, rsa_key*.pem,
                                                   attachments/, sends/
CronJob "vaultwarden-backup" (täglich 03:00) ──▶ PVC "vaultwarden-backup"
                                                   (SMB, //jays-ugreen/backups/vaultwarden)

Ansible-Timer "vaultwarden-cert-renew" (monatlich)
  tailscale cert → kubectl apply Secret "vaultwarden-tls"
```

## 1. Voraussetzungen

### 1.1 Tailscale HTTPS-Zertifikate aktivieren (einmalig)

In der [Tailscale Admin-Console](https://login.tailscale.com/admin/dns)
„HTTPS Certificates" für den Tailnet aktivieren. Danach den Tailnet-FQDN
dieses Hosts ermitteln:

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 'tailscale status'
# eigener Eintrag, z.B. "homeserver.tailXXXXX.ts.net"
```

### 1.2 NAS-Freigabe für Backups anlegen

Auf der UGREEN NAS `//jays-ugreen/backups/vaultwarden` anlegen (gleicher
SMB-Account wie media-stack/jellyfin funktioniert, sofern er Schreibrechte
auf `backups/` hat).

## 2. Konfiguration eintragen

### 2.1 Tailnet-Hostname

`ansible/group_vars/all.yml`:

```yaml
vaultwarden_tailnet_hostname: "homeserver.tailXXXXX.ts.net"   # aus 1.1
```

`argocd/apps/vaultwarden/values.yaml`:

```yaml
ingress:
  tailnetHost: "homeserver.tailXXXXX.ts.net"   # identisch zu oben
env:
  domain: "https://homeserver.tailXXXXX.ts.net"
```

### 2.2 TLS-Zertifikat ausrollen

```bash
make vaultwarden-cert
```

Das erzeugt/synct einmalig den Secret `vaultwarden-tls` im Namespace
`vaultwarden` und richtet den monatlichen Renewal-Timer ein
(`systemctl status vaultwarden-cert-renew.timer` auf dem Host).

### 2.3 SMB-Credentials für das Backup sealen

kubeseal ist namespace-gebunden:

```sh
echo -n "<smb-username>" | kubeseal --raw \
  --namespace vaultwarden --name vaultwarden-backup-smbcreds \
  --controller-name sealed-secrets-controller \
  --controller-namespace sealed-secrets --from-file=/dev/stdin

echo -n "<smb-password>" | kubeseal --raw \
  --namespace vaultwarden --name vaultwarden-backup-smbcreds \
  --controller-name sealed-secrets-controller \
  --controller-namespace sealed-secrets --from-file=/dev/stdin
```

Beide Ausgaben in `argocd/apps/vaultwarden/values.yaml` unter
`backupSmb.encryptedUsername` / `backupSmb.encryptedPassword` eintragen.
Solange leer, wird das SealedSecret übersprungen und die Backup-PV mountet
nicht — die Vaultwarden-App selbst läuft davon unbeeinflusst weiter.

## 3. Deployen

```sh
git add argocd/apps/vaultwarden docs/22-vaultwarden.md ansible/ Makefile && \
  git commit -m "feat(apps): add vaultwarden" && git push
```

ArgoCD legt den Namespace `vaultwarden` an und synct (~3 min).

## 4. Erstinbetriebnahme

1. `https://<tailnet-host>` aufrufen (Tailscale-Client aktiv), Owner-Account
   anlegen (E-Mail + Master-Passwort).
2. Signups sperren — `argocd/apps/vaultwarden/values.yaml`:
   ```yaml
   env:
     signupsAllowed: false
   ```
   Committen + pushen, ArgoCD synct.
3. Admin-Token (Argon2-Hash, **kein** Klartext) erzeugen:
   ```sh
   docker run --rm vaultwarden/server:1.36.0 hash
   ```
   Ausgabe (`$argon2id$...`) sealen:
   ```sh
   echo -n '$argon2id$...' | kubeseal --raw \
     --namespace vaultwarden --name vaultwarden-admin \
     --controller-name sealed-secrets-controller \
     --controller-namespace sealed-secrets --from-file=/dev/stdin
   ```
   Ausgabe in `values.yaml` unter `adminToken.encryptedToken` eintragen,
   committen + pushen. Admin-Panel danach unter `/admin` erreichbar.
4. Browser-Extension / Mobile-App: Self-hosted-Server-URL auf
   `https://<tailnet-host>` setzen (Tailscale muss auf dem Gerät aktiv sein).

## 5. Backup & Restore

### Was wird gesichert

- `db.sqlite3` — per SQLite Online-Backup-API (`sqlite3 .backup`), sicher bei
  laufender DB.
- `rsa_key.pem` / `rsa_key.pub.pem` (JWT-Signaturschlüssel).
- `config.json` (Admin-UI-Konfiguration, falls vorhanden).
- `attachments/`, `sends/`.
- **Bewusst ausgeschlossen**: `icon_cache/` — neu herunterladbar, spart Platz.

### Wohin

`CronJob vaultwarden-backup` (täglich 03:00, `values.yaml → backup.schedule`)
packt alles in ein Archiv `vaultwarden-<timestamp>.tar.gz` auf der SMB-PV
`vaultwarden-backup` → NAS-Pfad `//jays-ugreen/backups/vaultwarden`. Zweites
physisches Gerät, schützt vor Node-/SSD-Ausfall.

### Retention

14 Tage (`values.yaml → backup.retentionDays`), Archive älter werden beim
nächsten Lauf gelöscht.

### Manuell anstoßen / prüfen

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n vaultwarden create job --from=cronjob/vaultwarden-backup vaultwarden-backup-test'
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n vaultwarden logs job/vaultwarden-backup-test'
```

### Restore

1. Deployment stoppen:
   ```bash
   sudo kubectl -n vaultwarden scale deployment vaultwarden --replicas=0
   ```
2. Gewünschtes Archiv über einen temporären Debug-Pod (mountet dieselbe
   Daten-PVC) entpacken:
   ```bash
   sudo kubectl -n vaultwarden run restore --rm -it --restart=Never \
     --image=alpine:3.20 \
     --overrides='{"spec":{"containers":[{"name":"restore","image":"alpine:3.20","command":["sh"],"stdin":true,"tty":true,"volumeMounts":[{"name":"data","mountPath":"/data"},{"name":"backup","mountPath":"/backup"}]}],"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"vaultwarden-data"}},{"name":"backup","persistentVolumeClaim":{"claimName":"vaultwarden-backup"}}]}}' \
     -- sh
   # im Pod:
   #   tar xzf /backup/vaultwarden-<timestamp>.tar.gz -C /data
   ```
3. Deployment wieder hochskalieren:
   ```bash
   sudo kubectl -n vaultwarden scale deployment vaultwarden --replicas=1
   ```

### Bekannte Grenze

Die NAS steht im selben LAN wie der Cluster — das schützt vor Node-/
Disk-Ausfall, aber **nicht** vor Feuer/Diebstahl am Standort. Echtes Offsite
(z. B. `rclone` zu Cloud-Storage) ist eine mögliche künftige Erweiterung,
aber bewusst nicht Teil dieser Umsetzung (YAGNI).

## 6. Troubleshooting

| Symptom | Hinweis |
|---|---|
| Browser-Extension meldet „This browser requires https" | `tailnetHost`/`DOMAIN` zeigen nicht auf ein gültiges Zertifikat — `make vaultwarden-cert` gelaufen? `sudo kubectl -n vaultwarden get secret vaultwarden-tls` prüfen |
| Zertifikat abgelaufen | `systemctl status vaultwarden-cert-renew.timer` auf dem Host — Renewal läuft monatlich; manuell: `make vaultwarden-cert` |
| Pod `Pending`/`ContainerCreating` wegen PVC | `local-path`-PVC bindet nur auf dem einzigen Node — `sudo kubectl -n vaultwarden get pvc` |
| Backup-Job schlägt fehl | `sudo kubectl -n vaultwarden logs job/<job-name>` — meist fehlende SMB-Credentials (Schritt 2.3) oder NAS-Freigabe fehlt (Schritt 1.2) |
| `/admin` liefert 404/401 | `adminToken.encryptedToken` noch leer oder Argon2-Hash falsch generiert (Schritt 4.3) |
| Mobile-App verbindet nicht | Tailscale auf dem Gerät aktiv? Server-URL muss exakt der Tailnet-FQDN mit `https://` sein |
