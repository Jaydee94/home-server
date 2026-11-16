# webtrees

Stammbaum-Software im Browser mit GEDCOM-Import und -Export. Daten lebender Personen zeigt webtrees nur angemeldeten Nutzern.

| | |
|---|---|
| URL | http://webtrees.homeserver |
| Namespace | `webtrees` |
| Quelle | [`argocd/apps/webtrees/`](../argocd/apps/webtrees/) (lokales Chart mit [`argocd/lib/common`](../argocd/lib/common/README.md)) |
| Image | `ghcr.io/nathanvaughn/webtrees` ([Community-Image](https://github.com/NathanVaughn/webtrees-docker), ein offizielles gibt es nicht), `docker.io/library/mariadb` 11.8 LTS |

## Architektur

```text
Browser ──→ Traefik (Ingress webtrees.homeserver) ──→ webtrees :80 (Apache + PHP)
                                                        │  PVC webtrees-data 5Gi
                                                        ▼
                                                      webtrees-mariadb :3306
                                                        │  PVC webtrees-mariadb-data 5Gi
CronJob webtrees-mariadb-dump (03:30) ──────────────────┘  → PVC webtrees-mariadb-backup 2Gi
```

webtrees empfiehlt MySQL/MariaDB, SQLite und PostgreSQL gelten upstream als nicht empfohlen. Beim ersten Start füllt der Entrypoint des Images den Setup-Assistenten selbst aus: er wartet auf MariaDB, legt die Tabellen an und erstellt den Admin `admin`. Danach liest er `WT_*` nicht mehr.

## Zugangsdaten

Das SealedSecret `webtrees` enthält `db-password`, `db-root-password` und `wt-password`. Die Pods lesen sie als Datei (`*_FILE`), deshalb erscheinen sie nicht unter „Server-Informationen“ in der Verwaltung. Das Admin-Passwort steht im Klartext nur im Passwortmanager. Auslesen aus dem Cluster:

```bash
sudo kubectl -n webtrees get secret webtrees -o jsonpath='{.data.wt-password}' | base64 -d; echo
```

Neu versiegeln (Zertifikat vorher per `kubeseal --fetch-cert` holen):

```bash
printf '%s' '<wert>' | kubeseal --raw --cert sealed-secrets.pem \
  --namespace webtrees --name webtrees --from-file=/dev/stdin
```

Das Ergebnis kommt unter `sealedSecret.encryptedData` in `values.yaml`. Ein neues `wt-password` ändert das bestehende Admin-Konto nicht, das geht nur in webtrees selbst. Ein neues `db-password` muss zusätzlich per `ALTER USER` in MariaDB gesetzt werden.

## Konfiguration

| Key in `values.yaml` | Wert | Zweck |
|---|---|---|
| `image.tag`, `mariadb.image.tag` | siehe Datei | Versionen, Updates per Renovate |
| `env.LANG` | `de` | Sprache der Oberfläche und des Setups |
| `env.BASE_URL` | `http://webtrees.homeserver` | Basis aller erzeugten Links |
| `env.PRETTY_URLS` | `"1"` | Pfade ohne `index.php?route=` |
| `env.PHP_*` | 1024M, 300 s, 100M | Speicher, Laufzeit und Upload-Größe für große GEDCOM-Dateien |
| `backup.schedule` / `backup.keepDays` | `30 3 * * *` / `14` | Zeitpunkt und Aufbewahrung des Dumps |

## Betrieb

```bash
sudo kubectl -n webtrees get pods,pvc,cronjob
sudo kubectl -n webtrees logs deploy/webtrees --tail=100
sudo kubectl -n webtrees logs deploy/webtrees-mariadb --tail=50

# Dump sofort anstoßen und vorhandene Dumps ansehen
sudo kubectl -n webtrees create job --from=cronjob/webtrees-mariadb-dump dump-manual
sudo kubectl -n webtrees logs job/dump-manual
```

Restore aus einem Dump:

```bash
sudo kubectl -n webtrees scale deploy/webtrees --replicas=0
sudo kubectl -n webtrees exec -i deploy/webtrees-mariadb -- sh -c \
  'zcat | MYSQL_PWD="$(cat /run/secrets/webtrees/db-root-password)" mariadb -uroot webtrees' \
  < webtrees-YYYYMMDD-HHMMSS.sql.gz
sudo kubectl -n webtrees scale deploy/webtrees --replicas=1
```

Die Dumps liegen unter `/var/lib/rancher/k3s/storage/` im Verzeichnis des PVC `webtrees-mariadb-backup` und gehen mit dem nächtlichen [restic-Backup](26-backup.md) auf die NAS. Zusätzlich lohnt ab und zu ein GEDCOM-Export über „Verwaltung → Stammbäume → Exportieren“.

## Fallstricke

- Fehlt nur das PVC `webtrees-data`, fehlt auch `config.ini.php`: der Entrypoint startet den Setup-Assistenten erneut und trifft auf bestehende Tabellen. Entweder beide PVCs zusammen zurücksetzen oder `config.ini.php` aus dem Backup zurückholen.
- Der `BadBotBlocker` von webtrees weist Anfragen ohne Cookie und Browser-User-Agent ab. Startup- und Readiness-Probe nutzen deshalb `/docker-healthcheck.sh` aus dem Image statt `httpGet`.
- Beide Entrypoints starten als root, ändern Besitzrechte und wechseln dann auf `www-data` bzw. `mysql`. Die Capabilities in `values.yaml` und `templates/mariadb.yaml` sind das Minimum dafür.
- Der Image-Maintainer baut neue Tags automatisch aus jedem webtrees-Release, ohne sie einzeln zu prüfen. Vor einem Update den letzten Dump kontrollieren.
