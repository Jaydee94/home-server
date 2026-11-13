# Backup & Restore

Nächtliches [restic](https://restic.net)-Backup aller Daten des Home-Servers,
die **nicht** aus Git wiederherstellbar sind. Ziel ist ein verschlüsseltes
restic-Repository auf einem SMB-Share der UGREEN NAS.

| | |
|---|---|
| Rolle | `ansible/roles/backup` (`make backup`) |
| Zeitplan | täglich 04:00 (`homeserver-backup.timer`) |
| Ziel | `//192.168.178.118/personal_folder/backups/homeserver/restic` |
| Aufbewahrung | 7 tägliche, 4 wöchentliche, 6 monatliche Snapshots |
| Integritätsprüfung | sonntags `restic check` |

## Was gesichert wird

| Inhalt | Quelle | Warum |
|---|---|---|
| k3s-Datastore | SQLite-Online-Backup von `server/db/state.db` | kompletter Cluster-Zustand |
| k3s-Token, TLS, Credentials | `/var/lib/rancher/k3s/server/{token,tls,cred}` | nötig, um den Datastore wieder zu starten |
| Sealed-Secrets-Keys | `kubectl get secret -l sealedsecrets.bitnami.com/sealed-secrets-key` | **ohne sie ist jedes SealedSecret im Repo wertlos** |
| Alle local-path-Volumes | `/var/lib/rancher/k3s/storage` | Home Assistant, Pi-hole, *arr-Configs, Grafana, … |
| Semaphore-Secrets | `/etc/semaphore-secrets` | Admin-Passwort, SSH-Key, Encryption-Key |

Nicht gesichert (Default `backup_excludes`): die OS-Disk der 7DTD-VM und das
SABnzbd-Incomplete-Volume — beides groß und neu erzeugbar.

> Der Sealed-Secrets-Controller rotiert seinen Schlüssel alle 30 Tage und
> behält alle alten. Ein einmaliger Export veraltet deshalb; das nächtliche
> Backup enthält immer alle Schlüssel.

### Grenzen

- Die Volumes werden im laufenden Betrieb auf Dateiebene gesichert. SQLite-
  Datenbanken der Apps (Home Assistant, *arr, Grafana, Pi-hole) sind dadurch
  „crash-konsistent“, nicht garantiert sauber. Für Remedy wird der
  Postgres-Dump aus dem `remedy-postgres-backup`-Volume mitgesichert.
- NAS und Server stehen im selben Haus — das Backup schützt vor Disk-Defekt
  und Fehlbedienung, nicht vor Brand oder Diebstahl.
- Daten auf dem NAS selbst (Medien, Paperless) sind nicht Teil dieses Backups.

## Einrichtung

1. Repository-Passwort erzeugen, **außerhalb des Servers** ablegen
   (Passwortmanager) und vault-verschlüsseln:

   ```bash
   ansible-vault encrypt_string "$(openssl rand -base64 32)" \
     --name 'backup_restic_password'
   ```

   Den `!vault |`-Block in `ansible/group_vars/all.yml` eintragen. Solange die
   Variable fehlt, überspringt die Rolle alles und meldet das im Lauf.

2. Optional `backup_ntfy_url` setzen (volle Topic-URL), damit Fehler als Push
   ankommen.

3. Ausrollen und einmal von Hand starten:

   ```bash
   make backup
   ssh jaydee@192.168.178.127 'sudo systemctl start homeserver-backup && sudo journalctl -u homeserver-backup -n 30'
   ```

Der SMB-Zugang nutzt standardmäßig die Zugangsdaten der Scanner-Rolle
(`scanner_smb_username` / `scanner_smb_password`).

## Status prüfen

```bash
systemctl list-timers homeserver-backup.timer
sudo journalctl -u homeserver-backup --since -2d
sudo cat /var/lib/homeserver-backup/last-success

# Snapshots auflisten
sudo RESTIC_REPOSITORY=/mnt/nas-backup/backups/homeserver/restic \
     RESTIC_PASSWORD_FILE=/etc/homeserver-backup/restic-password \
     restic snapshots
```

## Restore

Für alle Befehle:

```bash
export RESTIC_REPOSITORY=/mnt/nas-backup/backups/homeserver/restic
export RESTIC_PASSWORD_FILE=/etc/homeserver-backup/restic-password
```

### Einzelnes Volume (App kaputt, Server läuft)

```bash
# App stoppen, damit nichts ins Volume schreibt
sudo kubectl -n home-assistant scale sts home-assistant --replicas=0

# Pfad des Volumes im Snapshot finden und zurückspielen
sudo -E restic ls latest /var/lib/rancher/k3s/storage | grep home-assistant
sudo -E restic restore latest --target / \
  --include '/var/lib/rancher/k3s/storage/pvc-<id>_home-assistant_<name>'

sudo kubectl -n home-assistant scale sts home-assistant --replicas=1
```

ArgoCD (`selfHeal`) skaliert die App von selbst wieder hoch — den Restore
zügig durchführen oder Auto-Sync der App vorher pausieren.

### Kompletter Neuaufbau (Disk defekt)

1. Ubuntu installieren (`docs/00-ubuntu-server-install.md`).
2. `restic` und `cifs-utils` installieren, NAS-Share nach `/mnt/nas-backup`
   mounten, Passwort aus dem Passwortmanager in eine Datei schreiben.
3. Zustand **vor** dem ersten k3s-Start zurückspielen:

   ```bash
   sudo -E restic restore latest --target /
   sudo mkdir -p /var/lib/rancher/k3s/server/db
   sudo cp /var/lib/homeserver-backup/staging/k3s-state.db \
           /var/lib/rancher/k3s/server/db/state.db
   ```

4. `make install` — k3s startet mit dem alten Datastore, alle PVCs zeigen auf
   die zurückgespielten Verzeichnisse, die Sealed-Secrets-Keys sind Teil des
   Datastores.

Falls der Datastore nicht brauchbar ist: Cluster leer aufsetzen und **vor**
dem ersten ArgoCD-Sync nur die Schlüssel einspielen, dann den Controller neu
starten:

```bash
sudo kubectl apply -f /var/lib/homeserver-backup/staging/sealed-secrets-keys.yaml
sudo kubectl -n sealed-secrets rollout restart deploy
```

> Der Komplett-Restore ist bisher nicht praktisch erprobt. Einmal im Jahr
> lohnt ein Test: `restic restore latest --target /tmp/restore-test` und
> prüfen, ob `k3s-state.db` und `sealed-secrets-keys.yaml` enthalten sind.
