# Paperless-AI

[Paperless-AI](https://github.com/clusterzx/paperless-ai) runs as an
ArgoCD-managed app in the k3s cluster (`argocd/apps/paperless-ai/`). It
connects to the existing **Paperless-NGX** instance on the UGREEN NAS
(`192.168.178.118`) over its REST API and automatically analyses, classifies
and tags documents. The optional RAG service adds semantic search and a chat
UI over your document corpus.

```
[Paperless-NGX @ NAS] <──REST API──> [paperless-ai @ k3s] ──> tags / titles / RAG chat
```

Unlike most apps in this repo, **no secrets are stored in Git**. All
configuration (Paperless API URL, API token, AI provider, model) is entered
through the in-app setup wizard on first start and persisted in the PVC. This
is the recommended path because paperless-ai ignores env-var changes after the
initial setup (upstream issue
[#358](https://github.com/clusterzx/paperless-ai/issues/358)).

## Deployment

The app is plain GitOps — ArgoCD discovers `argocd/apps/paperless-ai/` via the
root ApplicationSet, creates the `paperless-ai` namespace and syncs:

- `Deployment` — `clusterzx/paperless-ai:3.0.9`, web UI on port 3000, internal
  RAG service on 8000 (localhost only)
- `Service` (ClusterIP) + `Ingress` → `http://paperless-ai.homeserver`
- `PersistentVolumeClaim` — 5 Gi `local-path` mounted at `/app/data`

To bump the version, edit `image.tag` in
`argocd/apps/paperless-ai/values.yaml` and push.

## First-run setup wizard

1. Open <http://paperless-ai.homeserver> (resolves via dnsmasq on LAN + Tailnet).
2. **Paperless connection:**
   - **API URL:** `http://192.168.178.118:8000/api`
   - **API token:** generate one in Paperless-NGX → top-right user menu →
     *My Profile* → *API Auth Token* (regenerate/copy)
   - **Username:** your Paperless user
3. **AI provider:** pick OpenAI, Ollama, or any OpenAI-compatible service
   (DeepSeek, Azure, Groq, LiteLLM, …) and enter the base URL / key / model.
4. Save — paperless-ai validates the connection and starts polling Paperless on
   the configured `SCAN_INTERVAL`.

## RAG (semantic search + chat)

Enabled by default (`RAG_SERVICE_ENABLED=true`). The Python RAG service builds
embeddings of your documents, so the pod is memory-hungry — the chart requests
512 Mi and limits to 2 Gi. If the pod gets `OOMKilled`, raise
`resources.limits.memory` in `values.yaml`. To run lean (classification/tagging
only), set `RAG_SERVICE_ENABLED` to `"false"`.

## Troubleshooting

- **Pod CrashLoops with a permission error on `/app/data`:** the image manages
  ownership via `PUID`/`PGID` (1000) and the chart sets `fsGroup: 1000`. If
  writes still fail, the `cap_drop: [ALL]` in `securityContext` may be too
  strict for the image's startup chown — relax it in `values.yaml`.
- **"Cannot reach Paperless":** the k3s pod network reaches the NAS directly on
  the LAN (`192.168.178.0/24`); confirm the URL/port and that the API token is
  valid. Test from inside the pod:
  `kubectl -n paperless-ai exec deploy/paperless-ai -- wget -qO- http://192.168.178.118:8000/api/`
- **Wizard reappears / config lost:** the PVC was recreated. Config lives only
  in `/app/data`; re-run the wizard.
