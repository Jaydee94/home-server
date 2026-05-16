# Headlamp Kubernetes UI — Design Spec

**Date:** 2026-05-16  
**Status:** Approved

## Overview

Add [Headlamp](https://headlamp.dev) as a Kubernetes web UI to the home-server stack, deployed via ArgoCD GitOps following the existing `argocd/apps/*` Helm-chart pattern.

## Goals

- Browser-based Kubernetes dashboard accessible at `headlamp.homeserver`
- Cluster-admin access via a pre-generated ServiceAccount token
- Zero manual ArgoCD configuration — the existing ApplicationSet picks it up automatically

## Architecture

### Approach

Wrapper Helm chart in `argocd/apps/headlamp/` with the official `headlamp-k8s/headlamp` chart as a dependency. ArgoCD runs `helm dependency build` natively; no extra pipeline steps needed.

### Directory Structure

```
argocd/apps/headlamp/
├── Chart.yaml                      # wrapper chart + headlamp dependency
├── values.yaml                     # ingress, SA, resource overrides
└── templates/
    ├── clusterrolebinding.yaml     # headlamp SA → cluster-admin
    └── token-secret.yaml           # long-lived kubernetes.io/service-account-token
```

### Components

| Component | Details |
|---|---|
| Deployment | Official `headlamp-k8s/headlamp` chart, latest stable |
| Namespace | `headlamp` (created automatically by ArgoCD syncOptions) |
| ServiceAccount | `headlamp` (created by upstream chart) |
| ClusterRoleBinding | `headlamp` SA → `cluster-admin` |
| Token Secret | `headlamp-admin-token`, type `kubernetes.io/service-account-token` |
| Ingress | Traefik, host `headlamp.homeserver` |

## Configuration

### Ingress

```yaml
ingress:
  enabled: true
  ingressClassName: traefik
  hosts:
    - host: headlamp.homeserver
      paths:
        - path: /
          pathType: Prefix
```

### Resources

```yaml
resources:
  requests:
    cpu: 50m
    memory: 64Mi
  limits:
    cpu: 200m
    memory: 128Mi
```

## Token Retrieval

After ArgoCD syncs the app, retrieve the admin token once:

```bash
kubectl get secret headlamp-admin-token -n headlamp \
  -o jsonpath='{.data.token}' | base64 -d
```

Paste this token into the Headlamp login screen. The browser caches it for future visits.

## Non-Goals

- OIDC / SSO integration
- Multi-cluster support
- Headlamp plugins
