# Homepage

[gethomepage/homepage](https://gethomepage.dev) ist die Startseite des Home-Servers mit Links und Status-Widgets für alle Dienste.

| | |
|---|---|
| URL | http://home.homeserver, ohne Hostname auch http://192.168.178.127 |
| Namespace | `homepage` |
| Quelle | [`argocd/apps/homepage/`](../argocd/apps/homepage/) |
| Chart | `jameswynn/homepage` (Version in [`Chart.yaml`](../argocd/apps/homepage/Chart.yaml)) |

## Konfiguration

Alle Einstellungen stehen in [`values.yaml`](../argocd/apps/homepage/values.yaml) unter `homepage.config`:

| Key | Inhalt |
|---|---|
| `services` | Gruppen `Cluster`, `Media`, `NAS`, `Tools` mit Links und Widgets |
| `widgets` | Kopfzeile: Kubernetes, Host-Ressourcen, Datum, Google-Suche |
| `settings` | Dark-Theme `teal`, `useEqualHeights: true`, Spalten je Gruppe unter `layout` |

Das Custom-CSS liegt in der ConfigMap `homepage-custom-css` ([`configmap-custom-css.yaml`](../argocd/apps/homepage/templates/configmap-custom-css.yaml)) und wird nach `/app/config/custom.css` gemountet. Stabile Selektoren sind `body`, `#information-widgets` und `.service-card`. Die Hintergrundfarbe sitzt auf `body`, weil der Inhalts-Wrapper transparent ist.

Die IngressRoute `homepage-catchall` (Priorität 1) leitet Aufrufe ohne passenden Host-Header auf die Homepage, damit Traefik dort keinen 404 liefert.

Widgets sprechen die Dienste cluster-intern an, etwa `http://argocd-server.argocd.svc.cluster.local` oder `http://sonarr.media.svc.cluster.local:8989`. Portainer und Paperless liegen auf der NAS (`jays-ugreen`).

## Widget-Credentials

Alle Widget-Keys liegen im SealedSecret `homepage-credentials` ([`sealedsecret-credentials.yaml`](../argocd/apps/homepage/templates/sealedsecret-credentials.yaml)). Homepage lädt sie per `envFrom` als `HOMEPAGE_VAR_*` und ersetzt `{{HOMEPAGE_VAR_<NAME>}}` in der Konfiguration.

| Key | Quelle |
|---|---|
| `HOMEPAGE_VAR_ARGOCD_TOKEN` | ArgoCD-Account `readonly` |
| `HOMEPAGE_VAR_GRAFANA_PASSWORD` | Secret `grafana-admin` im Namespace `monitoring` |
| `HOMEPAGE_VAR_PORTAINER_TOKEN` | Portainer auf der NAS |
| `HOMEPAGE_VAR_SONARR_KEY`, `_RADARR_KEY`, `_PROWLARR_KEY`, `_SABNZBD_KEY`, `_SEERR_KEY` | API-Keys aus der jeweiligen App |

Einen Wert erneuern: neu versiegeln, den String in `sealedsecret-credentials.yaml` ersetzen, PR mergen. `kubeseal` läuft auf dem Server, weil der lokale kubeconfig auf einen anderen Cluster zeigt:

```bash
echo -n '<wert>' | ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubeseal --raw --namespace homepage --name homepage-credentials \
     --controller-name sealed-secrets-controller --controller-namespace sealed-secrets \
     --from-file=/dev/stdin'

# Grafana-Passwort auslesen
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n monitoring get secret grafana-admin -o jsonpath="{.data.admin-password}" | base64 -d'
```

Den ArgoCD-Token erzeugst du in der ArgoCD-UI unter Settings, Accounts, `readonly`, „Generate Token". Den Account definiert [`argocd/apps/argocd/values.yaml`](../argocd/apps/argocd/values.yaml) (`accounts.readonly: apiKey`); ArgoCD übernimmt Änderungen dort nach dem Merge selbst.

### Portainer-Token erneuern

Das Admin-Passwort steht im Vault als `vault_portainer_admin_password`. Der neue Token wird auf dem Server erzeugt und direkt versiegelt, damit der Klartext nie lokal erscheint:

```bash
# 1. JWT holen
JWT=$(curl -s -X POST http://192.168.178.118:9000/api/auth \
  -H "Content-Type: application/json" \
  -d '{"Username":"admin","Password":"<PASSWORT>"}' | \
  python3 -c "import json,sys; print(json.load(sys.stdin)['jwt'])")

# 2. Token erzeugen und versiegeln
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  "curl -s -X POST http://192.168.178.118:9000/api/users/1/tokens \
    -H 'Authorization: Bearer $JWT' \
    -H 'Content-Type: application/json' \
    -d '{\"description\":\"homepage-widget\",\"password\":\"<PASSWORT>\"}' | \
    python3 -c \"import json,sys; print(json.load(sys.stdin)['rawAPIKey'])\" | \
    tr -d '\n' | \
    sudo kubeseal --raw --namespace homepage --name homepage-credentials \
      --controller-name sealed-secrets-controller \
      --controller-namespace sealed-secrets \
      --from-file=/dev/stdin"
```

Ergebnis als `HOMEPAGE_VAR_PORTAINER_TOKEN` eintragen.

## Betrieb

```bash
sudo kubectl -n homepage get pods
# nach CSS-Änderungen, falls die ConfigMap keinen Neustart auslöst
sudo kubectl -n homepage rollout restart deploy
```

## Fallstricke

- Ohne `HOMEPAGE_ALLOWED_HOSTS` (in `values.yaml` unter `env`) schlägt die Liveness-Probe fehl. Neue Hostnamen oder IPs dort ergänzen.
- `envFrom` funktioniert nicht über Namespace-Grenzen. Deshalb braucht Homepage ein eigenes SealedSecret und kann die Secrets aus `monitoring` oder `argocd` nicht direkt referenzieren.
- Neue Widgets in einen Namespace mit NetworkPolicy (z. B. `media`, `monitoring`) brauchen dort eine Freigabe für `homepage`, sonst läuft der Aufruf ins Timeout. Siehe [gotchas.md](gotchas.md#networkpolicies).
- Icons: eingebaute Namen ohne Pfad (`grafana.svg`), sonst `mdi-<name>`. CDN-URLs von walkxcode/dashboard-icons und selfhst/icons liefern oft 403.
- Greift neues CSS nicht, muss Homepage die statische Seite neu erzeugen: Pod neu starten oder das Refresh-Icon unten rechts nutzen.
