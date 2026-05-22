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

Vollständige Projektdokumentation: [`CLAUDE.md`](CLAUDE.md). Diese Datei
spiegelt nur die wichtigsten Punkte für Agenten, die kein
`CLAUDE.md`-Loading unterstützen.

### Was dieses Repo ist

Ein vollständig automatisierter, GitOps-getriebener Home Server. Ansible
provisioniert den Host (Ubuntu 26.04 LTS); k3s liefert Kubernetes; ArgoCD
synchronisiert alles unter `argocd/apps/` kontinuierlich gegen den Cluster;
Tailscale liefert VPN-Zugang ohne öffentliche Ports.

### Wichtigste Kommandos

```bash
make deps           # Galaxy-Collections installieren
make ping           # Erreichbarkeit prüfen
make check          # Dry-run der gesamten Playbook-Run
make install        # End-to-End provisionieren
make lint           # yamllint + ansible-lint + helm lint
make vault-edit     # Vault-verschlüsselte Vars editieren

# Einzelne Rollen
make common | dnsmasq | tailscale | k3s | argocd | scanner | semaphore
```

### Rollen-Reihenfolge in `ansible/site.yml`

`common → dnsmasq → tailscale → k3s → argocd → scanner → semaphore_secrets`,
danach separate Plays `semaphore_targets` und `semaphore_bootstrap`.

### ArgoCD-Apps unter `argocd/apps/`

`example-whoami, gotify, headlamp, kubeseal-webgui, monitoring,
sealed-secrets, semaphore` — jede Unterordner wird automatisch zu einer
ArgoCD-`Application` im gleichnamigen Namespace.

## Pflicht-Skills (für AI-Agenten)

| Situation | Skill | Verhalten |
|---|---|---|
| Neues Feature / Bug-Fix | `superpowers:brainstorming` | MUSS vor Code aufgerufen werden |
| Implementierung | `superpowers:test-driven-development` | MUSS vor Code aufgerufen werden |
| Vor Commit/PR | `superpowers:verification-before-completion` | MUSS ausgeführt werden |
| Debug | `superpowers:systematic-debugging` | MUSS vor Fix aufgerufen werden |
| Bug nach Debug | `superpowers:test-driven-development` | Regressionstest schreiben, BEVOR der Fix committed wird |

## Verhalten

- Antworte auf Deutsch.
- Änderungen immer über Branch + PR, nie direkt auf `main`.
- YAGNI: keine ungefragten Features.
- Keine unnötigen Kommentare im Code.
- Secrets immer vault-encrypted, niemals plaintext committen.
<!-- CUSTOM:END -->
