# ArgoCD

ArgoCD synct alles unter `argocd/apps/` aus dem Branch `main` in den Cluster, auch sich selbst: Die App `argocd` kommt aus [`argocd/apps/argocd/`](../argocd/apps/argocd/). Ansible installiert ArgoCD nur auf einem frischen Cluster und legt die Bootstrap-Ressourcen an.

| | |
|---|---|
| URL | http://\<server-ip\>:30080 (HTTPS: 30443), über Tailscale `http://homeserver:30080` |
| Namespace | `argocd` |
| Rolle | [`ansible/roles/argocd/`](../ansible/roles/argocd/) |
| Quelle | [`argocd/apps/argocd/`](../argocd/apps/argocd/) (Chart-Version in `Chart.yaml`, Helm-Values unter `argo-cd:` in `values.yaml`) |
| Make | `make argocd`, `make argocd-recover`, `make render-bootstrap` |
| Chart | `argo/argo-cd` |
| Bootstrap | [`argocd/bootstrap/`](../argocd/bootstrap/) |

## Konfiguration

| Variable | Wert | Zweck |
|---|---|---|
| `argocd_repo_url` | `https://github.com/Jaydee94/home-server.git` | Repo für ApplicationSet und Bootstrap-App. Öffentlich, daher keine Repo-Credentials. |
| `argocd_repo_revision` | `main` | Branch, Tag oder SHA, dem ArgoCD folgt |

Die Helm-Values in [`argocd/apps/argocd/values.yaml`](../argocd/apps/argocd/values.yaml) setzen NodePort 30080/30443, HTTP ohne TLS im Server (`insecure: true`), je ein Replica ohne Redis-HA, einen Account `readonly` (nur API-Key, Rolle `role:readonly`) und globale `ignoreDifferences` in `argocd-cm` für StatefulSets, KubeVirt-VMs und CRDs. Die drei ArgoCD-CRDs tragen `Prune=false,Delete=false`, damit kein Sync die `Application`-CRD und damit alle Apps löschen kann.

Das Initial-Passwort gibt die Rolle nicht aus. Auslesen mit:

```bash
sudo kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d; echo
```

Login ist `admin`. Alternativ zeigt `-e argocd_show_initial_password=true` das Passwort im Playbook-Log.

## Bootstrap

Die Rolle `argocd` liest Chart-Version und Values aus `argocd/apps/argocd/` und führt `helm upgrade --install` nur aus, wenn noch kein `argocd-server` läuft. Auf einem bestehenden Cluster lässt sie ArgoCD in Ruhe. Danach wendet sie zwei Ressourcen an:

| Datei | Ressource | Aufgabe |
|---|---|---|
| [`bootstrap-app.yaml`](../argocd/bootstrap/bootstrap-app.yaml) | Application `bootstrap` | Synct `argocd/bootstrap/` aus Git, sich selbst per `directory.exclude` ausgenommen |
| [`root-applicationset.yaml`](../argocd/bootstrap/root-applicationset.yaml) | ApplicationSet `home-server-apps` | Macht aus jedem Verzeichnis unter `argocd/apps/*` eine Application |

Änderungen am ApplicationSet wirken nach dem Push, ohne `make argocd`. Beide Dateien sind aus den Templates in `ansible/roles/argocd/templates/` generiert. Template ändern, dann `make render-bootstrap` und beides committen. Die generierten Dateien nicht von Hand bearbeiten.

Jede generierte Application heißt wie ihr Verzeichnis und deployt in den gleichnamigen Namespace. Das ApplicationSet setzt:

| Einstellung | Wirkung |
|---|---|
| `automated: prune, selfHeal` | Synct jeden Push, löscht aus Git entfernte Ressourcen, dreht manuelle Änderungen zurück |
| `retry` (5×, 10 s bis 5 min) | Fängt Reihenfolgeprobleme beim ersten Sync ab, etwa CRD und CR im selben Sync |
| `CreateNamespace`, `ServerSideApply`, `SkipDryRunOnMissingResource` | Namespace anlegen, SSA, kein Dry-Run gegen noch fehlende CRDs |
| `RespectIgnoreDifferences` | Ignorierte Felder werden auch nicht angewendet |
| `preserveResourcesOnDeletion: true` | Verschwindet ein App-Verzeichnis, bleiben dessen Ressourcen und PVCs stehen |

Was `ignoreDifferences`, Prune und das Löschen von Apps im Detail bedeuten, steht in [Gotchas: ArgoCD / GitOps](gotchas.md#argocd--gitops).

## App hinzufügen

Der Skill `/add-app` legt das Gerüst an. Von Hand:

1. `argocd/apps/<name>/` anlegen, mit Plain-Manifests, `kustomization.yaml` oder einem Helm-Chart (`Chart.yaml` plus `values.yaml`).
2. Bei eigenem Chart Service, Ingress, PVC und NetworkPolicy aus der Library [`argocd/lib/common`](../argocd/lib/common/README.md) einbinden (`repository: file://../../lib/common`).
3. Bei einem Ingress den Hostnamen in [`argocd/apps/cert-manager/values.yaml`](../argocd/apps/cert-manager/values.yaml) unter `ingressTls.hosts` eintragen.
4. Eigene `local-path`-PVCs mit `argocd.argoproj.io/sync-options: Delete=false,Prune=false` annotieren (macht `common.pvc` automatisch).
5. PR öffnen, nach grüner CI mergen. ArgoCD pollt das Repo und legt die App nach etwa 3 Minuten an.

Ruft die neue App in einen isolierten Namespace hinein, muss dessen NetworkPolicy den Aufrufer erlauben ([Gotchas: NetworkPolicies](gotchas.md#networkpolicies)).

## Upgrades

Renovate erkennt das `argo-cd`-Chart über die Dependency in `argocd/apps/argocd/Chart.yaml` und öffnet PRs, die nie automatisch gemergt werden. Nach dem Merge rollt ArgoCD die neue Version innerhalb weniger Minuten selbst aus; der Application-Controller startet dabei neu und setzt den Sync danach fort.

Zerschießt ein Upgrade ArgoCD so, dass es sich nicht mehr selbst reparieren kann, den Fix (oder die alte Version) in `argocd/apps/argocd/` mergen und `make argocd-recover` ausführen. Das spielt den Git-Stand per Helm ein (`-e argocd_force_helm=true`). Das Helm-Release-Secret aus dem Bootstrap bleibt liegen, `helm list -n argocd` zeigt deshalb nicht die laufende Version; maßgeblich ist `sudo kubectl -n argocd get application argocd`.

Für Charts und Images unter `argocd/apps/` mergt Renovate Patch-Updates automatisch. Minor und Major bleiben manuell, ebenso jedes Update der Kernkomponenten (ArgoCD, KubeVirt, Monitoring, MetalLB, cert-manager, Pi-hole, Sealed Secrets, kubeseal-webgui, Home Assistant, Postgres). Die Regeln stehen in [`renovate.json`](../renovate.json).

## Betrieb

```bash
# Alle Apps mit Sync- und Health-Status
sudo kubectl -n argocd get applications

# Fehler des ApplicationSets (z. B. kaputtes Template)
sudo kubectl -n argocd describe applicationset home-server-apps

# Sofort neu aus Git lesen statt auf den Poll zu warten
sudo kubectl -n argocd annotate application <name> argocd.argoproj.io/refresh=hard --overwrite

# Render- und Sync-Fehler
sudo kubectl -n argocd logs deploy/argocd-repo-server --tail=100
sudo kubectl -n argocd logs statefulset/argocd-application-controller --tail=100
```
