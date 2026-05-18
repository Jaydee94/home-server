---
name: add-app
description: Scaffold a new ArgoCD application under argocd/apps/<name>/. Creates Chart.yaml and values.yaml following the home-server conventions, then reminds the user to commit and push so ArgoCD auto-discovers it.
---

The user will provide an app name and ideally: upstream chart name, repository URL, chart version, and any key values (ingress hostname, resource limits, etc.). Ask for missing details before scaffolding.

## Conventions (follow exactly)

- Folder: `argocd/apps/<name>/` — this becomes the ArgoCD Application name AND the Kubernetes namespace
- `Chart.yaml`: `apiVersion: v2`, `type: application`, `version: 0.1.0`, `maintainers: [{name: home-server-admin}]`
- The dependency `name:` in `Chart.yaml` must exactly match the top-level key in `values.yaml`
- `values.yaml`: all values nested under the dependency name key (e.g. `sealed-secrets:`, `kubeseal-webgui:`)
- Ingress: `ingressClassName: traefik`, hostname pattern `<name>.homeserver`, TLS disabled by default
- Storage: `storageClassName: local-path` for any PVCs
- Always include a `resources:` block with conservative requests (cpu: 20-50m, memory: 64-256Mi) and limits

## Registry rules

- Chart on **GitHub Container Registry** → `repository: oci://ghcr.io/<org>/<repo>/charts`
- Chart on **Artifact Hub / traditional Helm repo** → `repository: https://...` (the HTTP index URL, not the chart page URL)
- Never use an HTTP URL for a chart that lives at an OCI registry — it will 404

## File templates

### Chart.yaml
```yaml
---
apiVersion: v2
name: <app-name>
description: <one-line description> deployed via ArgoCD.
type: application
version: 0.1.0
appVersion: "<upstream-app-version>"
keywords:
  - <app-name>
  - kubernetes
home: <upstream-project-url>
sources:
  - <upstream-project-url>
maintainers:
  - name: home-server-admin
dependencies:
  - name: <chart-name>
    repository: <oci://... or https://...>
    version: "<chart-version>"
```

### values.yaml
```yaml
---
# Values passed through to the <chart-name> sub-chart.
# All keys live under `<chart-name>:` because that is the dependency name.
<chart-name>:
  # --- paste user-provided values here ---

  resources:
    limits:
      cpu: <limit>
      memory: <limit>
    requests:
      cpu: <request>
      memory: <request>
```

## After scaffolding

Remind the user to run:
```bash
git add argocd/apps/<name>
git commit -m "feat(apps): add <name>"
git push
# ArgoCD auto-discovers the new folder within ~3 minutes.
# Namespace "<name>" is created automatically.
```

If the chart uses an OCI registry, also remind them that `helm dep update` is not needed — ArgoCD handles OCI dependencies natively.
