# 20 — Gameserver-UI

Web-Oberfläche zur Verwaltung der 7DTD-KubeVirt-VM unter `http://gameserver.homeserver`.

## Architektur

```
Browser → Traefik (LAN/Tailnet) → Namespace gameserver-ui
            Service :80 → Pod :3000 (Next.js standalone)
                            ↓
                  ServiceAccount gameserver-ui
                  Role/RoleBinding im Namespace gameserver
                            ↓
                  KubeVirt API: VirtualMachine + VirtualMachineInstance
```

- **Authentifizierung:** Single-Admin, iron-session-Cookie, bcrypt-Hash aus SealedSecret `gameserver-ui-auth`
- **VM-Steuerung:** PATCH `spec.runStrategy` (`Always` = starten, `Halted` = stoppen)
- **Metriken:** VictoriaMetrics-Abfragen via `/api/metrics` — CPU-Auslastung (`kubevirt_vmi_vcpu_seconds_total`) und RAM `X.X / Y.Y GB` (`kubevirt_vmi_memory_resident_bytes` / `kubevirt_vm_resource_requests`)
- **RBAC:** Cross-Namespace — ServiceAccount im Namespace `gameserver-ui`, Role/RoleBinding im Namespace `gameserver` (nur `get/list` auf VMI, `get/list/patch` auf VM)
- **Image:** `ghcr.io/jaydee94/gameserver-ui` — Build via GitHub Actions (`.github/workflows/gameserver-ui.yml`), Tag `sha-<short-sha>`

## Seal-Prozedur

Bei Erstinstallation oder Rotation:

```bash
# 1. Neues SESSION_SECRET erzeugen
SESSION_SECRET=$(openssl rand -hex 32)

# 2. Admin-Passwort festlegen
read -s -p "Admin-Passwort: " PW; echo

# 3. bcrypt-Hash erzeugen
HASH=$(cd apps/gameserver-ui && node -e \
  "console.log(require('bcryptjs').hashSync(process.argv[1],10))" "$PW")

# 4. SESSION_SECRET sealen
SEALED_SESSION=$(echo -n "$SESSION_SECRET" | ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubeseal --raw --namespace gameserver-ui --name gameserver-ui-auth \
   --controller-name sealed-secrets-controller \
   --controller-namespace sealed-secrets \
   --from-file=/dev/stdin')

# 5. HASH sealen
SEALED_HASH=$(echo -n "$HASH" | ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubeseal --raw --namespace gameserver-ui --name gameserver-ui-auth \
   --controller-name sealed-secrets-controller \
   --controller-namespace sealed-secrets \
   --from-file=/dev/stdin')

# 6. Beide Werte in argocd/apps/gameserver-ui/values.yaml eintragen:
#    sealedSecret.encryptedSessionSecret: "<SEALED_SESSION>"
#    sealedSecret.encryptedAdminPasswordHash: "<SEALED_HASH>"
```

Anschließend committen und pushen — ArgoCD synct automatisch.

## Image-Tag pinnen

Nach jedem CI-Build den neuen `sha-<short-sha>`-Tag in `values.yaml` eintragen:

```bash
# Letzten erfolgreichen Build ermitteln
gh run list --workflow=gameserver-ui --repo jaydee94/home-server --limit 1

# Tag in values.yaml setzen
# image.tag: "sha-<short-sha>"
# image.pullPolicy: IfNotPresent
```

## Troubleshooting

### Pod bleibt in CrashLoop / Login schlägt mit 500 fehl

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n gameserver-ui logs -l app=gameserver-ui --tail=50'
```

Ursache meistens: `SESSION_SECRET` oder `ADMIN_PASSWORD_HASH` fehlen (SealedSecret noch nicht versiegelt oder Controller hat Secret noch nicht entschlüsselt). Lösung: Seal-Prozedur oben durchführen, danach Pod neu starten:

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n gameserver-ui rollout restart deployment gameserver-ui'
```

### 502 vom /api/vm-Endpunkt

RBAC-Problem — ServiceAccount hat keine Berechtigung auf die KubeVirt-Ressourcen:

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl auth can-i get virtualmachines -n gameserver \
   --as=system:serviceaccount:gameserver-ui:gameserver-ui'
# Expected: yes
```

Falls `no`: ArgoCD-Sync erzwingen (Role/RoleBinding im Namespace `gameserver` prüfen).

### VM-Status bleibt "Unknown"

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n gameserver get vm,vmi'
```

Die VM muss im Namespace `gameserver` existieren und den Namen `7dtd-server` tragen.

## End-to-End-Verifikation nach Merge

1. `http://gameserver.homeserver` → Redirect auf `/login`
2. Admin-Passwort eingeben → Dashboard mit `runStrategy: Halted`
3. „Starten" → nach ~60 s VMI-Phase `Running` + Tailscale-IP sichtbar
4. „Stoppen" (Bestätigungs-Dialog) → VMI verschwindet, Status `Stopped`
5. RBAC-Negativtest: `kubectl auth can-i delete vm -n gameserver --as=system:serviceaccount:gameserver-ui:gameserver-ui` → `no`

## Implementierte Seiten

| Seite | Pfad | Funktion |
|---|---|---|
| Dashboard | `/` | VM-Status, CPU/RAM-Kacheln, Horde-Night-Countdown, Starten/Stoppen |
| Logs | `/logs` | Live-Logs mit Suche, Pause, Kopieren und Download |
| Console | `/console` | Interaktive Telnet-Console zur VM |
| Config | `/config` | Servereinstellungen inline bearbeiten |
| Backups | `/backups` | Backup erstellen (mit Retention), Download, Löschen |
| Mods | `/mods` | Mod-Liste anzeigen und verwalten |
| Players | `/players` | Online-Spieler mit Session-Dauer |

## Weiterführend

- Quellcode: `apps/gameserver-ui/`
- Helm-Chart: `argocd/apps/gameserver-ui/`
- Gameserver-Infra (KubeVirt VM, CronJobs, Tailscale): `docs/19-gameserver.md`
