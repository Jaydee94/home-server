# 22 – Home Assistant MCP Server (`ha-mcp`) für Claude Code

**[`homeassistant-ai/ha-mcp`](https://github.com/homeassistant-ai/ha-mcp)** (MIT-Lizenz)
exponiert Home Assistant über das **Model Context Protocol (MCP)**, sodass
Claude Code auf dem eigenen Rechner Geräte/Sensoren abfragen und Dashboards,
Automationen, Szenen etc. direkt verwalten kann — z. B. auf Zuruf: "Baue mir
ein Dashboard aus all meinen Geräten."

| | |
|---|---|
| App | `argocd/apps/ha-mcp/` (lokaler Chart, kein Upstream-Dependency) |
| Namespace | `ha-mcp` |
| Image | `ghcr.io/homeassistant-ai/ha-mcp` |
| Port | `8086` (HTTP-Modus, `MCP_PORT`) |
| URL | `http://ha-mcp.homeserver/<secret-path>` — Secret-Pfad **nicht** im Klartext hier, siehe SealedSecret `ha-mcp-secrets` |
| Auth | Geheimer URL-Pfad (`MCP_SECRET_PATH`) statt Bearer-Token; zusätzlich Home-Assistant-Long-Lived-Token |
| Client | Claude Code auf dem eigenen Rechner, **lokal/user-scope**, nicht im geteilten `.mcp.json` |

## Warum ha-mcp statt der eingebauten HA-MCP-Server-Integration

Home Assistant bringt seit 2024.9 eine offizielle, eingebaute
"Model Context Protocol Server"-Integration mit. Sie ist einfacher (kein
zusätzlicher Container), beschränkt den Zugriff aber auf Entities, die für
**Assist** freigegeben sind. `ha-mcp` wurde bewusst stattdessen gewählt: voller
API-Zugriff (kein manuelles Freigeben jeder Entity nötig) und ein deutlich
größerer Werkzeugkasten (~90 Tools: Dashboards, Automationen, Szenen, Helper,
Backups, Historie/Statistik, Kamera-Snapshots, ZHA-Geräte, Config-Suche).

> **Hinweis:** Das Upstream-Projekt selbst empfiehlt primär eine
> **HACS-Installation als In-Process Custom Component** ("die einfachste
> Variante"). Das widerspricht der bewussten **HACS-freien Policy** dieses
> Repos (siehe `docs/17-homeassistant.md`) — Erweiterungen werden hier
> GitOps-reproduzierbar über gepinnte Init-Container installiert, nicht über
> HACS' Laufzeit-Downloads. Deshalb wird stattdessen der **eigenständige
> Docker-Container** (`ghcr.io/homeassistant-ai/ha-mcp`, HTTP-Modus) als
> eigene ArgoCD-App deployt. Nicht "korrigieren", indem man doch auf die
> HACS-Variante wechselt.

## Architektur

```
Claude Code (Nutzer-Rechner, Tailscale)
        │ HTTPS/HTTP, Secret-URL-Pfad als Credential
        ▼
Traefik (kube-system) — http://ha-mcp.homeserver
        │
k3s ─ ha-mcp Pod (Namespace "ha-mcp", ghcr.io/homeassistant-ai/ha-mcp)
   ├─ NetworkPolicy "ha-mcp-ingress" → Ingress nur von kube-system (Traefik)
   ├─ SealedSecret "ha-mcp-secrets" → HOMEASSISTANT_TOKEN, MCP_SECRET_PATH
   └─ env HOMEASSISTANT_URL → home-assistant.home-assistant.svc.cluster.local:8123
        │ REST/WebSocket-API, Long-Lived Access Token
        ▼
home-assistant Pod (Namespace "home-assistant")
   └─ NetworkPolicy "home-assistant-ingress" → Ingress von kube-system UND ha-mcp
```

`ha-mcp` ist zustandslos (kein PVC) — Einstellungen wie "Read Only Mode" oder
angepinnte Tools werden außerhalb der HA-Add-on-Variante nicht persistiert und
müssen nach jedem Pod-Neustart erneut geprüft werden (siehe Abschnitt
"Sicherheitshinweise").

## 1. Long-Lived Access Token in Home Assistant erzeugen

1. <http://homeassistant.homeserver> → Profil (unten links) → **Sicherheit** →
   **Langlebige Zugriffstoken** → *Token erstellen*.
2. Name z. B. `ha-mcp`, Token kopieren (wird nur einmal angezeigt).
3. **Wichtig:** Dieser Token hat vollen API-Zugriff auf das verwendete Konto
   (Dashboards, Automationen, Backups, YAML-Config) — nur mit einem
   Admin-Konto erzeugen und wie ein Passwort behandeln. Niemals im Klartext
   committen.

## 2. Secret-Pfad generieren

`ha-mcp` generiert im HTTP-Modus standardmäßig bei jedem Start einen
zufälligen URL-Pfad (`/private_<random>`) als einzige Zugriffskontrolle. Damit
das Deployment GitOps-reproduzierbar bleibt (fester Pfad statt "nach jedem
Neustart die Logs nach der neuen URL durchsuchen"), wird der Pfad stattdessen
über `MCP_SECRET_PATH` fest vorgegeben:

```bash
echo "/private_$(openssl rand -hex 32)"
```

> **Vor dem ersten Deploy verifizieren:** Ob `MCP_SECRET_PATH` im reinen
> `ha-mcp-web`-Modus (nicht OAuth/OIDC) exakt wie dokumentiert greift, ist
> nicht abschließend aus der Upstream-Doku bestätigt. Container einmal manuell
> mit `docker run` und den finalen Env-Vars starten, Log-Ausgabe prüfen: Nutzt
> die geloggte Connect-URL den gepinnten Pfad? Falls nicht, den tatsächlich
> generierten Pfad aus den Pod-Logs übernehmen und dokumentieren, dass er sich
> bei jedem Neustart ändert (Workaround, bis Upstream das klärt).

## 3. Secrets versiegeln (kubeseal-webgui)

Zwei Werte einzeln über **kubeseal-webgui** (<http://kubeseal-webgui.homeserver>)
versiegeln:

| Feld | Namespace | Secret Name | Secret Type |
|---|---|---|---|
| `token` = `<Long-Lived Access Token>` | `ha-mcp` | `ha-mcp-secrets` | `Opaque` |
| `secret-path` = `/private_<dein-hex>` | `ha-mcp` | `ha-mcp-secrets` | `Opaque` |

Die beiden verschlüsselten Strings in `argocd/apps/ha-mcp/values.yaml`
eintragen:

```yaml
haMcpSecret:
  enabled: true
  secretName: ha-mcp-secrets
  encryptedToken: "AgB..."        # ← kubeseal-webgui, Key: token
  encryptedSecretPath: "AgB..."   # ← kubeseal-webgui, Key: secret-path
```

Nach Commit + Push synct ArgoCD das SealedSecret und der `ha-mcp`-Pod startet.

## 4. NetworkPolicy: Home Assistant für ha-mcp öffnen

`argocd/apps/home-assistant/templates/networkpolicy.yaml` erlaubte bisher
Ingress auf Port 8123 nur aus `kube-system`. Diese Datei wurde um einen
zweiten `from:`-Eintrag für den Namespace `ha-mcp` ergänzt — ohne diese
Änderung würde `ha-mcp` beim Verbindungsversuch zu Home Assistant
stillschweigend hängen bleiben (Connection Timeout, keine Fehlermeldung).
Kubernetes labelt jeden Namespace automatisch mit dem unveränderlichen Label
`kubernetes.io/metadata.name` (seit 1.21) — kein manuelles Namespace-Labeling
nötig.

## 5. Deploy verifizieren

```bash
# 1. ArgoCD-Apps synced & healthy
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n argocd get applications ha-mcp home-assistant'

# 2. Pod läuft, Service/Ingress/SealedSecret/NetworkPolicy vorhanden
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n ha-mcp get pods,svc,ingress,sealedsecret,secret,networkpolicy'

# 3. Log prüfen: verwendet die Connect-URL den gepinnten Secret-Pfad?
#    Und: erfolgreicher Handshake mit Home Assistant (kein Connection Refused/Timeout)?
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl -n ha-mcp logs deploy/ha-mcp'

# 4. Falscher Pfad → 403/404 erwartet (beweist, dass die Zugriffskontrolle greift)
curl -i http://ha-mcp.homeserver/private_offensichtlich-falsch

# 5. Richtiger Pfad → gültige MCP-Antwort
curl -i http://ha-mcp.homeserver/<dein-secret-pfad>
```

## 6. Claude Code lokal verbinden

**Nicht** in das geteilte, forgecrate-generierte `.mcp.json` dieses Repos
eintragen — das würde einen persönlichen Home-Assistant-Token in eine
geteilte, committete Datei schreiben. Stattdessen lokal/user-scope
registrieren (Flags gegen die installierte Claude-Code-Version mit
`claude mcp add --help` prüfen, falls abweichend):

```bash
claude mcp add --transport http home-assistant \
  http://ha-mcp.homeserver/<dein-secret-pfad> \
  --scope user
```

Prüfen mit `claude mcp list`, in einer Session mit `/mcp` → Status
"connected". Danach z. B.:

- "Welche Geräte und Sensoren habe ich in Home Assistant?" (Lesezugriff)
- "Baue mir ein Dashboard, das alle meine Lichter und Sensoren gruppiert
  nach Raum zeigt." (Schreibzugriff)

Ergebnis in <http://homeassistant.homeserver> unter den Dashboards prüfen.

## Sicherheitshinweise

- **Read Only Mode muss deaktiviert bleiben**, sonst können keine Dashboards
  angelegt werden. Der Default-Zustand dieser Einstellung ist aus der
  Upstream-Doku nicht abschließend ersichtlich — nach der ersten Verbindung
  über die Server-Settings (Tool `ha_dev_manage_settings` oder Web-UI unter
  dem Secret-Pfad) prüfen.
- Einstellungen wie Read-Only-Mode oder angepinnte Tools werden **nicht**
  über Pod-Neustarts hinweg persistiert (kein PVC) — nach jedem Neustart neu
  setzen, falls abweichend vom gewünschten Zustand.
- Der Secret-Pfad **ist** das Credential — wie ein Passwort behandeln: nicht
  in Chat-Verläufe, Issues oder Klartext-Dateien einfügen.
- Der Home-Assistant-Token hat vollen API-Zugriff des verwendeten Kontos —
  bei Verdacht auf Kompromittierung sofort in HA widerrufen und neu erzeugen.

## Rotation

1. Neuen Secret-Pfad (`openssl rand -hex 32`) und/oder neuen Long-Lived
   Access Token in HA erzeugen.
2. Alten HA-Token widerrufen (Profil → Sicherheit → Langlebige Zugriffstoken).
3. Neue Werte über kubeseal-webgui versiegeln, `encryptedToken`/
   `encryptedSecretPath` in `values.yaml` ersetzen, committen, pushen.
4. ArgoCD synct das SealedSecret automatisch, der Pod startet neu.
5. Lokalen `claude mcp`-Eintrag mit der neuen URL aktualisieren
   (`claude mcp remove home-assistant && claude mcp add ...` oder Äquivalent).

## Troubleshooting

| Symptom | Ursache / Fix |
|---|---|
| Pod `CrashLoopBackOff` | `encryptedToken`/`encryptedSecretPath` in `values.yaml` sind noch `REPLACE_ME` → Secrets über kubeseal-webgui versiegeln. |
| `curl` auf den korrekten Pfad liefert 403/404 | Der bei `MCP_SECRET_PATH` gepinnte Pfad wird von diesem Image/Modus evtl. nicht 1:1 übernommen — Pod-Logs prüfen und tatsächlich verwendeten Pfad übernehmen (siehe Abschnitt 2). |
| Home Assistant nicht erreichbar (Timeout in den Pod-Logs) | NetworkPolicy-Anpassung aus Abschnitt 4 fehlt, oder der Service-DNS-Name von Home Assistant weicht von `home-assistant.home-assistant.svc.cluster.local` ab → `kubectl -n home-assistant get svc` prüfen und `homeassistant.url` in `values.yaml` korrigieren. |
| Claude Code zeigt keine/alte Tools nach einer Settings-Änderung | Tool-Liste ist gecacht — Verbindung in der Claude-Code-Session neu aufbauen. |
| Dashboard-Erstellung schlägt fehl oder no-opt | Read Only Mode ist (noch) aktiv → in den ha-mcp-Server-Settings deaktivieren (siehe "Sicherheitshinweise"). |
| Falscher Port angenommen (9584/9583) | Das sind die Ports der In-Process- bzw. HA-Add-on-Variante — der Docker/HTTP-Modus hier nutzt `MCP_PORT` = `8086`. |
