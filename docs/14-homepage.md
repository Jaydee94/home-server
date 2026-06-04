# 14 — Homepage Dashboard

[gethomepage/homepage](https://gethomepage.dev) ist das zentrale Startpage-Dashboard
des Home Servers.

## URL

`http://home.homeserver` (LAN + Tailnet via dnsmasq-Wildcard `*.homeserver`)

## Konfiguration ändern

Alle Einstellungen leben in `argocd/apps/homepage/values.yaml` (GitOps):

| Key | Inhalt |
|---|---|
| `homepage.config.services` | Dienste, Links, Widget-Konfiguration |
| `homepage.config.widgets` | Header-Widgets (Kubernetes, Uhrzeit, Suche) |
| `homepage.config.settings` | Theme, Layout, Titel |

Änderungen committen + auf `main` mergen → ArgoCD synct automatisch.

## Widget-Credentials rotieren

Grafana-Passwort und ArgoCD-API-Token sind als SealedSecret `homepage-credentials`
im Namespace `homepage` gespeichert. Homepage liest sie als Env-Vars mit Prefix
`HOMEPAGE_VAR_` und substituiert sie in der Konfiguration via `{{HOMEPAGE_VAR_<NAME>}}`.

### Grafana-Passwort neu versiegeln

```bash
GRAFANA_PW=$(ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n monitoring get secret monitoring-grafana \
   -o jsonpath="{.data.admin-password}" | base64 -d')

echo -n "$GRAFANA_PW" | kubeseal --raw \
  --namespace homepage --name homepage-credentials --from-file=/dev/stdin
```

Encrypted-String in `argocd/apps/homepage/templates/sealedsecret-credentials.yaml`
unter `HOMEPAGE_VAR_GRAFANA_PASSWORD` ersetzen, committen + auf `main` mergen.

### ArgoCD-Token erneuern

1. ArgoCD-UI → Settings → Accounts → `readonly` → Generate Token
2. Token versiegeln:
   ```bash
   echo -n "<token>" | kubeseal --raw \
     --namespace homepage --name homepage-credentials --from-file=/dev/stdin
   ```
3. `HOMEPAGE_VAR_ARGOCD_TOKEN` in der SealedSecret-Datei ersetzen, committen + mergen.

## ArgoCD readonly-User

Konfiguriert in `ansible/roles/argocd/templates/argocd-values.yaml.j2`.
Nach Änderungen: `make argocd` ausführen.

## Gotchas

- **Cross-namespace Secrets:** Kubernetes erlaubt kein `envFrom` über Namespace-Grenzen.
  Grafana-PW und ArgoCD-Token müssen als eigenes SealedSecret im Namespace `homepage`
  existieren — nicht aus `monitoring` oder `argocd` referenzierbar.
- **HOMEPAGE_ALLOWED_HOSTS:** Ohne diese Env-Var schlägt der Kubernetes-Liveness-Probe fehl.
  Gesetzt in `values.yaml` unter `env:`.
- **Grafana intern:** Widget-URL ist `http://monitoring-grafana.monitoring.svc.cluster.local`
  — kein Umweg über den Ingress, kein Passwort-Prompt.
- **ArgoCD intern:** Widget-URL ist `http://argocd-server.argocd.svc.cluster.local`.
- **Icons:** selfh.st/icons — Icon-Dateinamen ohne Pfad angeben (z.B. `grafana.svg`).
  Bei 404: auf der Site suchen und Dateinamen korrigieren.
- **dnsmasq:** Kein manueller DNS-Eintrag nötig — Wildcard `address=/homeserver/<ip>`
  deckt `home.homeserver` automatisch ab.
- **Feature-Branch:** ArgoCD synct nur `main`. Homepage erscheint erst nach dem Merge des PRs.
