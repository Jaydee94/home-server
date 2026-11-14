# common (Helm-Library-Chart)

Gemeinsame Templates für die lokalen Charts unter `argocd/apps/`. Als Library-Chart (`type: library`) rendert es allein nichts. Es liegt in `argocd/lib/` statt in `argocd/apps/`, weil das ApplicationSet jedes Verzeichnis unter `argocd/apps/*` zu einer Application macht.

Nutzer:

| Chart | Verwendet |
|---|---|
| `paperless-ai` | alle Templates |
| `ha-mcp` | Namen und Labels, Service, Ingress, ServiceAccount |
| `media` | nur die NetworkPolicy; die Servarr-Deployments nutzen den lokalen Helper `media.servarr` in `argocd/apps/media/templates/_helpers.tpl` |

## Templates

| Template | Rendert | Liest aus dem App-Chart |
|---|---|---|
| `common.name` / `fullname` / `chart` / `labels` / `selectorLabels` / `serviceAccountName` | Namen und Labels (auch im Deployment verwenden) | `.Chart`, `.Release`, `nameOverride`, `fullnameOverride`, `serviceAccount.*` |
| `common.service` | ClusterIP- oder NodePort-Service, Target-Port `http` | `service.type`, `service.port` |
| `common.ingress` | Ingress (leer, wenn deaktiviert) | `ingress.enabled/className/annotations/tls/hosts` |
| `common.serviceaccount` | ServiceAccount (leer bei `create: false`) | `serviceAccount.create/name/annotations` |
| `common.pvc` | PVC `<fullname>-data` mit `Delete=false,Prune=false` | `persistence.enabled/accessMode/size/storageClassName` |
| `common.networkpolicy.isolation` | `<name>-namespace-isolation`: Ingress aus dem eigenen Namespace, von Traefik (`kube-system`) und aus `namespaces` | `dict "root" $ "name" "<app>" "namespaces" (list ...)` |

Alle Templates außer der NetworkPolicy bekommen den Root-Kontext: `{{ include "common.service" . }}`. Zum Muster der NetworkPolicy siehe [NetworkPolicies](../../../docs/23-network-policies.md).

## In einem neuen Chart verwenden

1. In `Chart.yaml`:

   ```yaml
   dependencies:
     - name: common
       version: 0.1.0
       repository: file://../../lib/common
   ```

2. Eine Zeile je Template-Datei, z. B. `templates/service.yaml`: `{{ include "common.service" . }}`. Im Deployment `common.fullname`, `common.labels`, `common.selectorLabels` und `common.serviceAccountName` verwenden.
3. `helm dependency build argocd/apps/<app>` ausführen. Das legt `charts/` und `Chart.lock` an, beide sind in `.gitignore` und werden nicht committet.
4. Beim Umbau eines bestehenden Charts `helm template` vorher und nachher rendern und die geparsten Objekte vergleichen. Selektoren, PVC-Specs und `volumeClaimTemplates` müssen byte-identisch bleiben.

## Regeln

- Eine Änderung hier ändert jedes Chart, das die Library nutzt. CI (`ct list-changed`) lintet aber nur Charts unter `argocd/apps/`, deren Dateien sich geändert haben. Nach einer Änderung an der Library deshalb für alle Nutzer (Tabelle oben) `helm dependency build` und `helm template` ausführen und gegen `main` vergleichen.
- Was `common.selectorLabels` oder `common.pvc` für ein deploytes Chart rendert, nie ändern: Selektoren sind unveränderlich, und die Daten liegen im PVC.
- `version` in `Chart.yaml` und in allen `dependencies:`-Einträgen nur bei einer inkompatiblen Änderung gemeinsam erhöhen.
- Der ArgoCD-Repo-Server kennt keine `file://`-Repositories. `helm template` scheitert deshalb zuerst mit „missing in charts/ directory“, danach führt ArgoCD im App-Verzeichnis `helm dependency build` aus (`runHelmBuild`) und löst `../../lib/common` im selben Checkout auf.
