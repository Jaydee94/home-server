# common (Helm library chart)

Shared templates for the local charts under `argocd/apps/`. Library chart
(`type: library`): renders nothing on its own. It lives in `argocd/lib/`, not
in `argocd/apps/`, because the ApplicationSet turns every directory under
`argocd/apps/*` into an Application.

Used by: `paperless-ai` (everything), `ha-mcp` (names, Service, Ingress,
ServiceAccount), `media` (NetworkPolicy only; the Servarr Deployments use the
local helper `media.servarr` in `argocd/apps/media/templates/_helpers.tpl`).

## Templates

| Template | Renders | Reads from the app chart |
|---|---|---|
| `common.name` / `fullname` / `chart` / `labels` / `selectorLabels` / `serviceAccountName` | names and labels (use in the Deployment too) | `.Chart`, `.Release`, `nameOverride`, `fullnameOverride`, `serviceAccount.*` |
| `common.service` | ClusterIP/NodePort Service, target port `http` | `service.type`, `service.port` |
| `common.ingress` | Ingress (empty if disabled) | `ingress.enabled/className/annotations/tls/hosts` |
| `common.serviceaccount` | ServiceAccount (empty if `create: false`) | `serviceAccount.create/name/annotations` |
| `common.pvc` | `<fullname>-data` PVC with `Delete=false,Prune=false` | `persistence.enabled/accessMode/size/storageClassName` |
| `common.networkpolicy.isolation` | `<name>-namespace-isolation`: ingress from the own namespace, Traefik (`kube-system`) and `namespaces` | `dict "root" $ "name" "<app>" "namespaces" (list ...)` |

Everything except the NetworkPolicy takes the root context: `{{ include "common.service" . }}`.

## Use it in a new chart

1. `Chart.yaml`:

   ```yaml
   dependencies:
     - name: common
       version: 0.1.0
       repository: file://../../lib/common
   ```

2. One line per template file, e.g. `templates/service.yaml`:
   `{{ include "common.service" . }}`. In the Deployment use
   `common.fullname`, `common.labels`, `common.selectorLabels`,
   `common.serviceAccountName`.
3. `helm dependency build argocd/apps/<app>` (creates the ignored `charts/`
   and `Chart.lock`; neither is committed).
4. Proof that nothing moved when converting an existing chart: `helm template`
   before and after, compare the parsed objects (see the PR that introduced
   this chart). Selectors, PVC specs and `volumeClaimTemplates` must stay
   byte-identical.

## Rules

- A change here changes every chart that uses it, but CI (`ct list-changed`)
  only lints charts under `argocd/apps/` whose files changed. After editing
  the library, run `helm dependency build` + `helm template` for all users
  (list above) and diff against `main`.
- Never change what `common.selectorLabels` or `common.pvc` render for a
  deployed chart (immutable selectors, data lives in the PVC).
- Bump `version` in `Chart.yaml` and in every `dependencies:` entry together
  only for a breaking change.
- ArgoCD: the repo-server does not know `file://` repositories, so `helm
  template` first fails with "missing in charts/ directory", then it runs
  `helm dependency build` in the app directory (`runHelmBuild`), which
  resolves `../../lib/common` inside the same checkout.
