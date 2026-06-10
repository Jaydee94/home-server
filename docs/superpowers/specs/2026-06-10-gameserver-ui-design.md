# Gameserver-UI — Design-Spec

**Datum:** 2026-06-10 · **Issues:** #122 (Infra), #123 (UI), #124 (Velero)

## Ziel

Eine Weboberfläche im k3s-Cluster, die den 7 Days to Die-Server (KubeVirt-VM
`7dtd-server`, Namespace `gameserver`) vollständig verwaltet — ohne SSH auf den
Host oder manuelle `kubectl patch`-Kommandos.

## Anforderungen

| Feature | Beschreibung |
|---|---|
| VM Start/Stop + Status | `runStrategy` patchen (Always/Halted), VMI-Phase, Uptime, cloud-init-Fortschritt |
| Zeitplan | Start/Stop-CronJobs anzeigen, Schedule ändern, temporär suspendieren |
| Spieler | Aktuelle Spielerliste via Telnet (`lp`), Broadcast (`say`), `saveworld` |
| Logs & Monitoring | 7DTD-Container-Logs (Live-Stream), CPU/RAM der VM |
| Config | serverconfig.xml editieren, validieren, ausrollen (Hybrid, s.u.) |
| Backups | Spielwelt-Backups auflisten, anstoßen, zurückspielen — Ziel: UGREEN NAS |

**Zugriff:** Nur der Betreiber, mit Login (Single-Admin-Credentials).
**Stack:** Next.js (App Router, TypeScript), ein Container.

## Architektur

```
argocd/apps/gameserver-ui/          ← ArgoCD-App (Helm), Namespace gameserver-ui
  └── Next.js-Container (ghcr.io/jaydee94/gameserver-ui, Build: GitHub Actions)
        ├── K8s-API (ServiceAccount + RBAC → Namespace gameserver):
        │     virtualmachines patch (runStrategy), virtualmachineinstances get,
        │     cronjobs get/patch
        ├── SSH → VM (VMI-Pod-IP, Privkey im SealedSecret):
        │     serverconfig.xml schreiben, docker restart/logs, tar-Streams
        ├── Telnet → VM-IP:8081 (direkt über Pod-Netz):
        │     lp, say, saveworld
        ├── NAS-Mount (hostPath /mnt/gameserver-data ← Host-SMB-Mount via Ansible):
        │     Backups (tar.gz) + persistierte serverconfig.xml
        └── VictoriaMetrics-HTTP-API (CPU/RAM virt-launcher-Pod)

Ingress: http://gameserver.homeserver (Traefik, Pi-hole löst *.homeserver)
```

### Schlüsselentscheidungen

1. **Kein Agent in der VM.** KubeVirt-Masquerade leitet alle Ports der VMI-Pod-IP
   an die VM weiter — SSH (22) und Telnet (8081) sind aus dem Cluster direkt
   erreichbar. Einzige VM-Änderung: SSH-Pubkey der UI in der cloud-init
   (einmalig neu versiegeln).
2. **Nur die UI mountet das NAS-Share** (Host-SMB-Mount → hostPath, Muster wie
   Scanner-Rolle). Die VM braucht keinen SMB-Mount; Backup-tar wird über SSH
   gestreamt. Backup-Liste und Restore-Vorbereitung funktionieren so auch bei
   gestoppter VM.
3. **Config-Hybrid:** Quelle der Wahrheit liegt auf dem NAS-Mount. "Ausrollen" =
   via SSH in die VM schreiben + `docker restart 7dtd-server`. Nach VM-Neubau
   stellt ein Button die persistierte Config wieder her.
4. **Spielwelt-Backup app-konsistent aus der VM:** `saveworld` via Telnet, dann
   `tar czf - /opt/7dtd/data` über SSH gestreamt auf den NAS-Mount. Velero kann
   die KubeVirt-Disk auf `local-path` nicht zuverlässig sichern (keine
   CSI-Snapshots; FSB/Kopia mit KubeVirt-Volumes laut kubevirt-velero-plugin
   ungetestet). Quellen: velero.io/docs (File System Backup),
   github.com/kubevirt/kubevirt-velero-plugin.
5. **Velero ist ein separates Teilprojekt** (#124) für normale App-PVCs, Ziel
   In-Cluster-MinIO; Gameserver-DataVolume ausgenommen.

## Komponenten (UI-Backend)

| Modul | Verantwortung | Grenze/Mock in Tests |
|---|---|---|
| `lib/k8s` | VM/VMI/CronJob-Operationen via `@kubernetes/client-node` | K8s-API gemockt |
| `lib/telnet` | Telnet-Session, Auth, Befehle, `lp`-Parsing | Socket gemockt |
| `lib/ssh` | SSH-Exec + Streams (Logs, tar) via `ssh2` | SSH gemockt |
| `lib/backups` | Liste/Erstellen/Restore auf NAS-Mount | Temp-Verzeichnis |
| `lib/config` | serverconfig.xml lesen/validieren/persistieren/ausrollen | s.o. |
| `lib/metrics` | VictoriaMetrics-Queries | HTTP gemockt |
| `app/api/*` | REST-Routen, Session-Guard | Modul-Mocks |
| `app/*` | React-Seiten (Dashboard, Spieler, Logs, Config, Backups, Zeitplan) | Playwright |

## Fehlerverhalten

- VM gestoppt → Spieler/Logs/Config-Live-Teile zeigen klaren Hinweis statt Fehler;
  Start-Button prominent. Backup-Liste bleibt verfügbar (NAS-Mount).
- Telnet/SSH-Timeouts → Fehlermeldung mit Ursache, kein Silent-Fail.
- Destruktive Aktionen (Stop, Restore, Config-Rollout) → Bestätigungs-Dialog.
- NAS-Mount fehlt → Backups/Config-Persistenz deaktiviert mit Warnbanner.

## Sicherheit

- Login: Single-Admin (Username + bcrypt-Hash im SealedSecret), Session-Cookie
  (httpOnly), alle API-Routen geschützt.
- RBAC minimal: nur Namespace `gameserver`, nur die benötigten Verben/Ressourcen.
- SSH-Privkey + Telnet-Passwort als SealedSecrets, nie im Image/Repo.

## Teilprojekte & Reihenfolge

1. **A (#122):** Ansible-SMB-Mount + cloud-init-SSH-Key (Voraussetzung)
2. **B (#123):** UI in 7 Iterationen: Gerüst+Login → VM-Status/Start/Stop →
   Spieler/Telnet → Logs/Monitoring → Config-Editor → Backups → Zeitplan
3. **C (#124):** Velero (Backlog, nach B)

## Testing

- TDD: vitest-Unit-/Integrationstests pro Modul, Mocks nur an Systemgrenzen
  (K8s-API, SSH, Telnet-Socket, VictoriaMetrics).
- Playwright-E2E gegen `next dev` mit gemocktem Backend.
- Manuelle Cluster-Verifikation: ArgoCD-Sync, Login, VM-Start → Spielerliste,
  Backup-Roundtrip (anstoßen → tar auf NAS → Restore), Config-Rollout → in VM prüfen.
