<!-- GENERATED:BEGIN -->
# Agent-Konfiguration

Gilt für alle Agenten (Codex, Claude Code, etc.) die in diesem Repo arbeiten.

## Pflichten

- Vor jeder Code-Änderung den relevanten Kontext vollständig lesen
- Tests schreiben bevor Implementierung
- Commits nach jeder abgeschlossenen Aufgabe
- Keine globalen Konfigurationen verändern
<!-- GENERATED:END -->

<!-- CUSTOM:BEGIN -->
## Projekt-Kontext

Die vollständige Agenten-Anleitung steht in [`CLAUDE.md`](CLAUDE.md), die Projektdoku in [`README.md`](README.md) und [`docs/`](docs/). Hier nur das Nötigste für Agenten, die `CLAUDE.md` nicht laden.

Das Repo beschreibt einen GitOps-Home-Server: Ansible provisioniert den Host (Ubuntu 26.04 LTS), k3s liefert Kubernetes, ArgoCD synchronisiert jedes Verzeichnis unter `argocd/apps/` als eigene Application in einen gleichnamigen Namespace, und Tailscale ermöglicht Fernzugriff ohne öffentliche Ports.

```bash
make deps | ping | check | install    # Collections, Erreichbarkeit, Dry-Run, Provisionierung
make lint                             # yamllint, ansible-lint, helm lint
make nas | nas-check                  # UGREEN NAS (ansible/ugreen-nas.yml)
```

Rollen in `ansible/site.yml`: `common → host_dns → tailscale → k3s → argocd → scanner → semaphore_secrets → backup`, danach eigene Plays für `semaphore_targets` und `semaphore_bootstrap`.

## Pflicht-Skills

| Situation | Skill |
|---|---|
| Neues Feature oder Bugfix | `superpowers:brainstorming` vor dem Code |
| Implementierung | `superpowers:test-driven-development` vor dem Code |
| Debugging | `superpowers:systematic-debugging` vor dem Fix, danach Regressionstest |
| Vor Commit oder PR | `superpowers:verification-before-completion` |

## Verhalten

- Antworte auf Deutsch.
- Änderungen immer über Branch und PR, nie direkt auf `main`.
- YAGNI: keine ungefragten Features, keine unnötigen Code-Kommentare.
- Secrets nur vault-verschlüsselt committen.
<!-- CUSTOM:END -->
