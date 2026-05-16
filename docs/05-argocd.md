# ArgoCD GitOps Guide

This document covers ArgoCD access, configuration, and day-to-day GitOps operations.

---

## Access

### Web UI

ArgoCD is exposed as a NodePort service on ports **30080** (HTTP) and **30443** (HTTPS).

```
http://<server-ip>:30080
http://homeserver:30080          (via Tailscale MagicDNS)
http://100.x.x.x:30080          (via Tailscale IP)
```

### Initial Credentials

After installation, ArgoCD generates a random initial password stored in a Kubernetes secret.

Retrieve it:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d; echo
```

- **Username:** `admin`
- **Password:** output of the above command

---

## First Login and Password Change

1. Navigate to `http://<server-ip>:30080`
2. Log in with `admin` / `<initial-password>`
3. Click the **user icon** in the top-left corner
4. Click **User Info**
5. Click **Update Password**
6. Enter and confirm a strong new password
7. Click **Save**

After changing the password, you can optionally delete the initial secret:

```bash
kubectl -n argocd delete secret argocd-initial-admin-secret
```

---

## Repository Configuration

The bootstrap ApplicationSet is configured to pull from your Git repository. If your repository is **public**, no additional configuration is needed.

### Private Repository Setup

If your repository is private, add credentials via the ArgoCD UI or CLI:

**Via UI:**
1. Go to **Settings** → **Repositories**
2. Click **Connect Repo**
3. Choose **HTTPS** or **SSH**
4. Enter repository URL and credentials

**Via CLI:**

```bash
# HTTPS with username/password or token
argocd repo add https://github.com/YOUR_USER/home-server.git \
  --username YOUR_USER \
  --password YOUR_TOKEN

# SSH with key
argocd repo add git@github.com:YOUR_USER/home-server.git \
  --ssh-private-key-path ~/.ssh/id_rsa

# Check connected repos
argocd repo list
```

**Via Kubernetes Secret:**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: home-server-repo
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
type: Opaque
stringData:
  type: git
  url: https://github.com/YOUR_USER/home-server.git
  password: ghp_YOUR_GITHUB_TOKEN
  username: YOUR_USER
```

```bash
kubectl apply -f repo-secret.yaml
```

---

## ApplicationSet Structure

The bootstrap **ApplicationSet** (`argocd/bootstrap/root-applicationset.yaml`) uses the Git directory generator to automatically create ArgoCD Applications from subdirectories.

```yaml
generators:
  - git:
      repoURL: https://github.com/YOUR_USER/home-server.git
      revision: HEAD
      directories:
        - path: "argocd/apps/*"
```

**How it works:**
- ArgoCD scans `argocd/apps/` in the Git repository
- Each subdirectory becomes an ArgoCD **Application**
- The Application name = directory name
- The target namespace = directory name
- ArgoCD syncs the directory contents to the cluster

**Example directory structure:**

```
argocd/apps/
├── example-whoami/          → Application "example-whoami" → namespace "example-whoami"
├── monitoring/              → Application "monitoring"     → namespace "monitoring"
├── homer-dashboard/         → Application "homer-dashboard"→ namespace "homer-dashboard"
└── nextcloud/               → Application "nextcloud"      → namespace "nextcloud"
```

---

## Adding a New Application

The GitOps workflow for adding apps is:

1. Create a directory under `argocd/apps/<app-name>/`
2. Add your Kubernetes manifests or Helm chart
3. Commit and push to Git
4. ArgoCD detects the new directory within ~3 minutes
5. ArgoCD creates an Application and syncs it

**Example: Adding a plain manifest app**

```bash
mkdir -p argocd/apps/my-app
cat > argocd/apps/my-app/deployment.yaml << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: my-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: my-app
          image: nginx:alpine
          ports:
            - containerPort: 80
EOF

git add argocd/apps/my-app/
git commit -m "feat: add my-app"
git push
```

**Example: Adding a Helm chart app**

```bash
mkdir -p argocd/apps/my-helm-app/templates

# Chart.yaml, values.yaml, templates/ — standard Helm chart structure
# ArgoCD detects Chart.yaml and treats the directory as a Helm chart
```

---

## Sync Policies

The bootstrap ApplicationSet configures apps with full automation:

```yaml
syncPolicy:
  automated:
    prune: true      # Delete resources removed from Git
    selfHeal: true   # Auto-fix manual changes (drift correction)
  syncOptions:
    - CreateNamespace=true    # Auto-create target namespace
    - ServerSideApply=true    # Use server-side apply for better conflict handling
```

**What these mean:**

| Policy           | Effect                                                              |
|------------------|---------------------------------------------------------------------|
| `automated`      | ArgoCD syncs automatically on Git changes (no manual sync needed)  |
| `prune: true`    | Resources deleted from Git are removed from the cluster            |
| `selfHeal: true` | Manual `kubectl` changes are reverted to match Git                 |
| `CreateNamespace`| Target namespace is created if it doesn't exist                    |
| `ServerSideApply`| Uses `kubectl apply --server-side` for better field management     |

**Disabling automated sync for a specific app:**

If you want manual control over one app, add a custom `Application` manifest that overrides the sync policy:

```yaml
# argocd/apps/my-careful-app/argocd-application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-careful-app
  namespace: argocd
  annotations:
    argocd.argoproj.io/skip-reconcile: "true"  # exclude from ApplicationSet
spec:
  syncPolicy: {}  # manual sync only
```

---

## CLI Usage

Install the ArgoCD CLI:

```bash
# Linux
curl -sSL -o argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
chmod +x argocd && sudo mv argocd /usr/local/bin/

# macOS
brew install argocd
```

### Common CLI Commands

**Authentication:**

```bash
# Login
argocd login 192.168.1.100:30080 --username admin --password <password> --insecure

# Via Tailscale
argocd login homeserver:30080 --username admin --password <password> --insecure

# Show current context
argocd context
```

**Application Management:**

```bash
# List all applications
argocd app list

# Get application details
argocd app get example-whoami

# Manually trigger sync
argocd app sync example-whoami

# Sync with pruning (remove extra resources)
argocd app sync example-whoami --prune

# Sync specific resources
argocd app sync example-whoami --resource apps:Deployment:whoami

# Wait for sync to complete
argocd app wait example-whoami --sync

# Get application logs
argocd app logs example-whoami

# Diff: show what would change
argocd app diff example-whoami

# Rollback to previous version
argocd app rollback example-whoami 1   # revision number from history

# History
argocd app history example-whoami

# Delete application (does NOT delete cluster resources by default)
argocd app delete example-whoami

# Delete application AND cluster resources
argocd app delete example-whoami --cascade
```

**Repository Management:**

```bash
# List repositories
argocd repo list

# Add repository
argocd repo add https://github.com/YOUR_USER/home-server.git

# Remove repository
argocd repo rm https://github.com/YOUR_USER/home-server.git
```

**Account Management:**

```bash
# List accounts
argocd account list

# Update password
argocd account update-password

# Generate API token
argocd account generate-token --account admin
```

---

## ArgoCD Health Status

ArgoCD reports two statuses for each Application:

**Sync Status:**
- `Synced` — cluster matches Git
- `OutOfSync` — differences exist between Git and cluster
- `Unknown` — status cannot be determined

**Health Status:**
- `Healthy` — all resources are healthy
- `Progressing` — resources are deploying/updating
- `Degraded` — resources are failing
- `Missing` — resources don't exist yet
- `Suspended` — resources are suspended (e.g., CronJob)
- `Unknown` — health cannot be determined

Check in the UI under **Applications** or via CLI:

```bash
argocd app list
# Shows: NAME   CLUSTER   NAMESPACE   PROJECT   STATUS   HEALTH   ...
```

---

## Notifications and Webhooks

### GitHub Webhook (Faster Sync)

By default, ArgoCD polls the Git repository every 3 minutes. Configure a GitHub webhook for instant sync on push:

1. Go to your GitHub repository → **Settings** → **Webhooks**
2. Click **Add webhook**
3. Set Payload URL: `http://<tailscale-ip>:30080/api/webhook`
4. Content type: `application/json`
5. Select: **Just the push event**
6. Click **Add webhook**

Note: The server must be accessible from GitHub's servers. Via Tailscale, this requires either making the server a [Tailscale exit node](06-tailscale.md) or configuring subnet routing.

Alternatively, ArgoCD's 3-minute polling interval is usually fast enough for a home server.
