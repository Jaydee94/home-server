# Paperless-AI

[Paperless-AI](https://github.com/clusterzx/paperless-ai) läuft im Cluster und analysiert, betitelt und taggt Dokumente in Paperless-NGX auf der UGREEN NAS über dessen REST-API. Der eingebaute RAG-Dienst ergänzt eine semantische Suche und einen Chat über alle Dokumente.

| | |
|---|---|
| URL | http://paperless-ai.homeserver |
| Namespace | `paperless-ai` |
| Quelle | [`argocd/apps/paperless-ai/`](../argocd/apps/paperless-ai/) |
| Chart | eigener Chart auf Basis von [`argocd/lib/common`](../argocd/lib/common/), Image `clusterzx/paperless-ai` |
| Paperless-NGX | `http://192.168.178.118:8000` ([Rolle `paperless`](../ansible/roles/paperless/README.md)) |

## Architektur

Ein Deployment mit Web-UI auf Port 3000 und internem RAG-Dienst auf `localhost:8000`, Service (Port 80), Traefik-Ingress und ein 5-Gi-PVC (`local-path`, `/app/data`). Das PVC enthält Konfiguration, SQLite-Datenbank und RAG-Embeddings.

In Git liegen keine Secrets. API-URL, Paperless-Token und KI-Provider trägst du beim ersten Start im Setup-Assistenten ein; Paperless-AI speichert sie im PVC. Env-Variablen ignoriert Paperless-AI nach dem Setup ([Upstream-Issue #358](https://github.com/clusterzx/paperless-ai/issues/358)).

Die NetworkPolicy lässt Ingress nur aus dem eigenen Namespace und von Traefik zu. Egress ist offen, damit der Pod die NAS und den KI-Provider erreicht.

## Einrichtung bei Neuinstallation

1. http://paperless-ai.homeserver öffnen.
2. Paperless-Verbindung: API-URL `http://192.168.178.118:8000/api`, API-Token aus dem Paperless-Benutzerprofil, Paperless-Benutzername.
3. KI-Provider wählen (OpenAI, Ollama oder ein OpenAI-kompatibler Dienst) und Basis-URL, Key und Modell eintragen.
4. Speichern. Paperless-AI prüft die Verbindung und fragt Paperless danach im Intervall `SCAN_INTERVAL` ab.

## Konfiguration

| Key in `values.yaml` | Wert | Zweck |
|---|---|---|
| `image.tag` | siehe Datei | Version, Update per Push |
| `env.RAG_SERVICE_ENABLED` | `"true"` | RAG-Suche und Chat. `"false"` lässt nur Klassifizierung und Tagging laufen |
| `resources.requests.memory` / `resources.limits.memory` | `512Mi` / `2Gi` | Die Embeddings brauchen viel RAM. Bei `OOMKilled` das Limit erhöhen |
| `env.PUID` / `env.PGID`, `podSecurityContext.fsGroup` | `1000` | Dateirechte auf dem PVC |

## Betrieb

```bash
sudo kubectl -n paperless-ai get pods,pvc
sudo kubectl -n paperless-ai logs deploy/paperless-ai --tail=100

# Erreicht der Pod Paperless auf der NAS?
sudo kubectl -n paperless-ai exec deploy/paperless-ai -- wget -qO- http://192.168.178.118:8000/api/
```

## Fallstricke

- Schreibfehler auf `/app/data` trotz `fsGroup: 1000`: Das `drop: [ALL]` im `securityContext` kann das `chown` beim Start des Images verhindern. Dann die Capabilities in `values.yaml` lockern.
- Erscheint der Setup-Assistent erneut, wurde das PVC neu angelegt. Die Konfiguration liegt nur dort; den Assistenten erneut durchlaufen.
