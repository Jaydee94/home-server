# Scanner und Paperless-Ingestion

Der Fujitsu-USB-Scanner hängt direkt am Home-Server. Ein Druck auf die Scan-Taste erzeugt ein PDF, das per REST-API in Paperless-NGX auf der UGREEN NAS landet. Jeder Scan meldet Erfolg oder Fehler per [Gotify](11-gotify.md).

| | |
|---|---|
| Rolle | [`ansible/roles/scanner/`](../ansible/roles/scanner/) |
| Make | `make scanner` |
| Konfiguration | [`ansible/group_vars/all.yml`](../ansible/group_vars/all.yml), Abschnitt „Scanner / Paperless Ingestion" |
| Ziel | Paperless-NGX `http://192.168.178.118:8000` ([Rolle `paperless`](../ansible/roles/paperless/README.md)) |

## Ablauf

```text
Scan-Taste ─> scanbd ─> scan_button.sh ─> touch /var/tmp/scanner/scan-pending
scanner-trigger.path ─> scanner-trigger.service ─> scan-trigger.sh
    stoppt scanbd (gibt USB frei), startet scan_to_pdf.sh als saned, startet scanbd neu
scan_to_pdf.sh: scanimage (ADF Duplex, TIFF) ─> mogrify/convert ─> PDF
    ├─ scanner_paperless_api_enabled: true  ─> POST /api/documents/post_document/
    ├─ sonst                                ─> cp nach /mnt/paperless-consume (CIFS auf der NAS)
    └─ Gotify-Push (Erfolg/Fehler)
```

scanbd hält das USB-Interface exklusiv. Deshalb setzt `scan_button.sh` nur ein Flag, und der eigentliche Scan läuft außerhalb von scanbd in `scanner-trigger.service`.

Die Rolle installiert SANE, scanbd, ImageMagick und `cifs-utils`. Sie legt die Gruppe `scanner` an (mit `saned` als Mitglied) und vergibt das USB-Gerät per udev-Regel an diese Gruppe (`MODE=0660`). scanbd läuft als `saned:scanner` in einer gehärteten systemd-Unit (`ProtectSystem=strict`, `MemoryDenyWriteExecute=true` u. a.). Außerdem gibt die Rolle in `/etc/ImageMagick-7/policy.xml` das Schreiben von PDF und TIFF frei. Ein Fehler im Skript schreibt einen Marker `scan-FAILED-<ts>.failed` ins Consume-Verzeichnis.

Der CIFS-Mount (`_netdev,nofail,x-systemd.automount`) blockiert den Boot nicht, wenn die NAS offline ist. `scanner-healthcheck.timer` prüft stündlich Mount und USB-Gerät und startet bei fehlendem Mount die Automount-Unit neu.

## Konfiguration

Werte aus `group_vars/all.yml`, sonst Default aus [`defaults/main.yml`](../ansible/roles/scanner/defaults/main.yml):

| Variable | Wert | Zweck |
|---|---|---|
| `scanner_usb_vendor_id` / `scanner_usb_product_id` | `04c5` / `132b` | USB-IDs aus `lsusb \| grep -i fujitsu`. Leere Product-ID bricht die Rolle ab |
| `scanner_paperless_api_enabled` | `true` | Upload per Paperless-API statt Kopie auf den CIFS-Share |
| `scanner_paperless_api_url` | `http://192.168.178.118:8000` | Paperless-NGX auf der NAS |
| `scanner_paperless_api_token` | Vault | API-Token aus dem Paperless-Benutzerprofil |
| `scanner_smb_share` | `//192.168.178.118/personal_folder/paperless/consume` | CIFS-Ziel, gemountet unter `/mnt/paperless-consume` |
| `scanner_smb_username` / `scanner_smb_password` | `jaydee` / Vault | Zugang zum Share |
| `scanner_gotify_enabled` / `scanner_gotify_url` / `scanner_gotify_token` | `true` / `http://gotify.homeserver` / Vault | Push-Benachrichtigungen, siehe [Gotify](11-gotify.md) |
| `scanner_resolution_dpi` / `scanner_mode` / `scanner_paper_source` | `300` / `Color` / `ADF Duplex` | Scan-Parameter |
| `scanner_duplex_rotate_back_pages` / `scanner_duplex_back_first` | `true` / `true` | Rückseiten um 180° drehen. Liefert der ADF die Rückseite zuerst, tauscht das Skript zusätzlich die Seitenpaare |
| `scanner_healthcheck_oncalendar` | `hourly` | Intervall des Healthchecks |

Secrets werden mit Vault verschlüsselt und in `group_vars/all.yml` eingefügt:

```bash
ansible-vault encrypt_string '<wert>' --name 'scanner_paperless_api_token'
```

## Betrieb

```bash
make scanner

# Scan-Log live verfolgen (Taste drücken)
sudo journalctl -t scanbd-scan -t scanner-trigger -f

sudo systemctl status scanbd scanner-trigger.path --no-pager
sudo systemctl list-timers scanner-healthcheck.timer
sudo journalctl -t scanner-healthcheck --since today

# Mount sofort prüfen und reparieren, ohne auf den Timer zu warten
sudo systemctl start scanner-healthcheck.service
df -h /mnt/paperless-consume

# Scanner am USB sichtbar? (scanimage -L meldet bei laufendem scanbd BUSY)
lsusb -d 04c5:132b
```

## Fallstricke

- Der Pre-flight verlangt `scanner_smb_password` auch bei aktivem API-Upload, weil die Rolle den CIFS-Mount immer einrichtet.
- Lehnt ImageMagick die PDF-Erzeugung ab, fehlt der von Ansible verwaltete Block in `/etc/ImageMagick-7/policy.xml`. `make scanner` erneut ausführen.
- USB-Sperre durch scanbd und `SANE_CONFIG_DIR` beim Lauf als `saned`: siehe [gotchas.md](gotchas.md#scanner--sane).

## Siehe auch

- [Gotify](11-gotify.md)
- [Rolle `paperless`](../ansible/roles/paperless/README.md)
