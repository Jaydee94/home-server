# Argo Workflows (private CI/CD)

[Argo Workflows](https://argo-workflows.readthedocs.io) runs as an
ArgoCD-managed app (`argocd/apps/argo-workflows/`) and is the home-server's
private CI engine. It pairs with a small MinIO instance
(`argocd/apps/minio/`) that serves as the S3-compatible artifact repository
and log archive.

Split of concerns:

```
Argo Workflows  =  CI   (clone, test, lint, build images)
ArgoCD          =  CD   (deploy argocd/apps/* to the cluster)
```

- **Triggers:** manual via the UI or `argo submit`, plus `CronWorkflow`
  schedules. There is no public ingress, so git webhooks are out of scope.
- **Auth:** server auth-mode — no login, open on LAN/Tailnet (same trust model
  as Grafana/Headlamp/Semaphore). Reachable only through the Tailnet/LAN.
- **Image builds:** Kaniko builds and pushes to GHCR (`ghcr.io/jaydee94/...`)
  using a sealed docker-config secret. No in-cluster registry.

| Service        | URL                              | Notes                       |
|----------------|----------------------------------|-----------------------------|
| Argo Workflows | http://argo-workflows.homeserver | UI + API (server auth-mode) |
| MinIO console  | http://minio.homeserver          | Object browser              |

## 1. One-time secrets (kubeseal)

The two apps ship `SealedSecret` manifests with placeholder values
(`REPLACE_ME_SEALED_*`). They must be sealed against the cluster's
sealed-secrets controller before the apps become healthy. Run `kubeseal` from a
machine with the cluster reachable (e.g. via SSH on the server), pointing at the
controller `sealed-secrets-controller` in namespace `sealed-secrets`.

A reusable helper:

```bash
seal() {  # seal <namespace> <secret-name> <value-on-stdin>
  kubeseal --raw --namespace "$1" --name "$2" \
    --controller-name sealed-secrets-controller \
    --controller-namespace sealed-secrets \
    --from-file=/dev/stdin
}
```

### 1.1 MinIO root credentials (namespace `minio`)

Pick a user/password, seal both, paste into `argocd/apps/minio/values.yaml`
(`rootCreds.encryptedRootUser` / `encryptedRootPassword`):

```bash
printf 'argo'                | seal minio minio-root   # -> encryptedRootUser
printf 'CHANGE-ME-strong-pw' | seal minio minio-root   # -> encryptedRootPassword
```

### 1.2 Argo artifact S3 access (namespace `argo-workflows`)

**Same values** as the MinIO root creds — paste into
`argocd/apps/argo-workflows/values.yaml`
(`artifactSecret.encryptedAccessKey` / `encryptedSecretKey`):

```bash
printf 'argo'                | seal argo-workflows argo-artifacts-s3  # -> encryptedAccessKey
printf 'CHANGE-ME-strong-pw' | seal argo-workflows argo-artifacts-s3  # -> encryptedSecretKey
```

### 1.3 GHCR push credentials (namespace `argo-workflows`)

Create a GitHub PAT with `write:packages`, build a docker-config JSON, then seal
it under the `.dockerconfigjson` key. Paste into
`ghcrSecret.encryptedDockerConfigJson`:

```bash
GHCR_USER=jaydee94
GHCR_PAT=ghp_xxx           # PAT with write:packages
AUTH=$(printf '%s:%s' "$GHCR_USER" "$GHCR_PAT" | base64 -w0)
printf '{"auths":{"ghcr.io":{"auth":"%s"}}}' "$AUTH" \
  | seal argo-workflows ghcr-push
```

If you do not need image builds yet, set `ghcrSecret.enabled: false` instead.

After pasting all values, commit + push. ArgoCD syncs within ~3 minutes;
the sealed-secrets controller decrypts the SealedSecrets into real Secrets and
the MinIO + Argo pods start.

## 2. Verify

```bash
SSH="ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127"
$SSH 'sudo kubectl -n argocd get application minio argo-workflows'
$SSH 'sudo kubectl -n minio get pods'
$SSH 'sudo kubectl -n argo-workflows get pods'
```

Open `http://argo-workflows.homeserver` — the Workflows UI should load and list
the `git-ci` and `kaniko-build-push` WorkflowTemplates.

## 3. Run pipelines

The `argo` CLI talks to the server; run it on the host or any Tailnet machine
with `ARGO_SERVER=argo-workflows.homeserver:80` and `ARGO_HTTP1=true`, or just
submit through the UI.

### 3.1 Test / lint job (`git-ci`)

```bash
argo submit -n argo-workflows --from workflowtemplate/git-ci \
  -p repo=https://github.com/Jaydee94/home-server.git \
  -p revision=main \
  -p image=alpine:3.20 \
  -p cmd="ls -la && cat README.md | head"
```

The git repo is checked out as an input artifact at `/work`; step logs are
archived to MinIO (`argo-artifacts` bucket). A `Succeeded` status with visible
archived logs confirms the artifact repository is wired correctly.

### 3.2 Image build (`kaniko-build-push`)

```bash
argo submit -n argo-workflows --from workflowtemplate/kaniko-build-push \
  -p repo=https://github.com/Jaydee94/<repo-with-Dockerfile>.git \
  -p revision=main \
  -p context=. \
  -p dockerfile=Dockerfile \
  -p image=ghcr.io/jaydee94/<image>:latest
```

The image appears under `ghcr.io/jaydee94/...`. ArgoCD can then deploy it as
usual (CD stays with ArgoCD).

### 3.3 Scheduled runs (`CronWorkflow`)

`nightly-home-server-lint` ships **suspended**. Adjust the `cmd` to a real lint
command in `argocd/apps/argo-workflows/templates/cronworkflow.yaml`, then resume:

```bash
argo cron resume -n argo-workflows nightly-home-server-lint
```

## 4. Troubleshooting

- **App stuck `Progressing` / pods `CreateContainerConfigError`** — the
  SealedSecrets are still placeholders or the controller could not decrypt them.
  Re-check §1, confirm `kubectl -n <ns> get secret <name>` exists.
- **`git-ci` succeeds but logs are not archived** — the `argo-artifacts-s3`
  Secret values do not match the MinIO root creds, or MinIO is not up. Check
  `kubectl -n minio logs deploy/minio` and the `argo-artifacts` bucket exists.
- **Kaniko `UNAUTHORIZED` pushing to GHCR** — the PAT lacks `write:packages` or
  the `ghcr-push` secret is malformed. Verify the dockerconfigjson auth string.
- **CRDs not found on first sync** — the WorkflowTemplate/CronWorkflow CRs and
  the Argo CRDs land in the same sync. The ApplicationSet already sets
  `SkipDryRunOnMissingResource=true` + retry, so it converges on the next
  reconcile; no manual action needed.
- **GHCR unreachable from the cluster** — depends on the egress policy. If
  outbound to `ghcr.io` is blocked, image builds need a local registry instead
  (separate change: a `registry:2` app + containerd mirror config in the `k3s`
  role).
