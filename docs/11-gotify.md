# Gotify

Gotify ist der Push-Server im Cluster. Die [Scanner-Pipeline](10-scanner.md) meldet darüber jeden Scan, die Gotify-App auf dem Handy zeigt die Nachricht an.

| | |
|---|---|
| URL | http://gotify.homeserver |
| Namespace | `gotify` |
| Quelle | [`argocd/apps/gotify/`](../argocd/apps/gotify/) |
| Chart | eigener Chart, Image `gotify/server` (Tag in [`values.yaml`](../argocd/apps/gotify/values.yaml)) |

## Architektur

Ein Deployment (UID 1000, Port 8080) mit 1-Gi-PVC (`local-path`, `/app/data`), dahinter Service (Port 80) und Traefik-Ingress. Das Admin-Passwort kommt aus dem SealedSecret `gotify-admin` (Key `password`) und geht als `GOTIFY_DEFAULTUSER_PASS` in den Container.

Die NetworkPolicy `gotify-namespace-isolation` erlaubt Ingress aus dem eigenen Namespace, aus `kube-system` (Traefik) und aus `monitoring`. Der Blackbox-Exporter prüft `http://gotify.homeserver/health`.

Der Scanner liest URL und App-Token zur Laufzeit aus `/etc/scanner/gotify.env` (`0640 root:scanner`, von Ansible gerendert). Der Token steht dadurch weder im Skript noch im Journal oder in Git.

## Einrichtung bei Neuinstallation

1. Nur bei neuem Sealed-Secrets-Schlüssel: Admin-Passwort für Namespace `gotify`, Secret `gotify-admin`, Key `password` versiegeln (http://kubeseal-webgui.homeserver oder `kubeseal` auf dem Server, siehe [gotchas.md](gotchas.md#secrets--sealedsecrets-admin-passwörter)) und als `adminSecret.encryptedPassword` in `values.yaml` eintragen. Den Klartext kannst du optional als `gotify_admin_password` im Vault ablegen (auskommentierter Stub in `group_vars/all.yml`); Ansible liest ihn nicht.
2. In der Gotify-UI unter „Apps" eine Application `Scanner` anlegen und den Token kopieren.
3. Token verschlüsseln, als `scanner_gotify_token` in `ansible/group_vars/all.yml` eintragen und ausrollen:

   ```bash
   ansible-vault encrypt_string '<app-token>' --name 'scanner_gotify_token'
   make scanner
   ```

## Betrieb

```bash
sudo kubectl -n gotify get pods,pvc,sealedsecret,secret
curl -sS http://gotify.homeserver/health        # {"health":"green",...}

# Test-Push mit dem Scanner-Token, auf dem Home-Server
sudo bash -c 'curl -fsS -X POST http://gotify.homeserver/message \
  -H "X-Gotify-Key: $(grep ^GOTIFY_TOKEN= /etc/scanner/gotify.env | cut -d= -f2-)" \
  -F title=test -F message=hallo -F priority=5'
```

Der Scanner sendet „Scan erfolgreich" mit Dateiname und Seitenzahl (Priorität `scanner_gotify_priority_success`, Default 5) oder „Scan fehlgeschlagen" mit dem Fehlergrund, etwa „Keine Seiten gescannt" bei leerem ADF (Priorität `scanner_gotify_priority_error`, Default 8).

## Fallstricke

- `GOTIFY_DEFAULTUSER_PASS` wirkt nur, solange die Datenbank noch nicht existiert. Ein neu versiegeltes Passwort ändert das bestehende Admin-Konto nicht; das Passwort änderst du in der Web-UI.
- App-Token rotieren: alten Token in der UI löschen, neuen anlegen, Schritt 3 wiederholen. `/etc/scanner/gotify.env` nie von Hand bearbeiten, Ansible überschreibt die Datei.
- Keine Pushes trotz erfolgreichem Scan: `sudo cat /etc/scanner/gotify.env` muss `GOTIFY_ENABLED=1` zeigen. Fehlgeschlagene Sendeversuche findest du mit `journalctl -t scanbd-scan -g "gotify notify failed"`.
- Der Home-Server löst `gotify.homeserver` über Pi-hole auf (Rolle `host_dns`). Löst der Name nicht auf, siehe [Pi-hole](15-pihole.md).
