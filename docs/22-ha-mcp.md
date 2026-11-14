# HA-MCP für Claude Code

[`homeassistant-ai/ha-mcp`](https://github.com/homeassistant-ai/ha-mcp) stellt Home Assistant über das Model Context Protocol bereit. Claude Code auf dem eigenen Rechner kann damit Geräte und Sensoren abfragen und Dashboards, Automationen und Szenen anlegen.

| | |
|---|---|
| URL | `http://ha-mcp.homeserver/<secret-pfad>` |
| Namespace | `ha-mcp` |
| Quelle | [`argocd/apps/ha-mcp/`](../argocd/apps/ha-mcp/) (eigener Chart auf Basis von `argocd/lib/common`) |
| Image | `ghcr.io/homeassistant-ai/ha-mcp` (Tag in [`values.yaml`](../argocd/apps/ha-mcp/values.yaml)), HTTP-Modus `ha-mcp-web` auf Port 8086 |
| Auth | geheimer URL-Pfad (`MCP_SECRET_PATH`) plus Long-Lived Access Token für Home Assistant |

Das Repo nutzt ha-mcp statt der eingebauten MCP-Server-Integration von Home Assistant. Die eingebaute Integration sieht nur Entities, die für Assist freigegeben sind; ha-mcp hat vollen API-Zugriff und deutlich mehr Werkzeuge (Dashboards, Automationen, Helper, Backups, Historie). Upstream empfiehlt die Installation per HACS. Das Repo verzichtet bewusst auf HACS ([Home Assistant](17-homeassistant.md)), deshalb läuft ha-mcp als eigener Container. Nicht auf die HACS-Variante umstellen.

## Architektur

```text
Claude Code (Rechner, Tailnet)
   │ http://ha-mcp.homeserver/<secret-pfad>
   ▼
Traefik ─> ha-mcp (NetworkPolicy ha-mcp-ingress: nur kube-system, Port 8086)
             │ HOMEASSISTANT_URL=http://home-assistant.home-assistant.svc.cluster.local:8080
             ▼
           home-assistant-0 (NetworkPolicy home-assistant-ingress: kube-system und ha-mcp)
```

`HOMEASSISTANT_TOKEN` und `MCP_SECRET_PATH` kommen aus dem SealedSecret `ha-mcp-secrets` (Keys `token` und `secret-path`). Der Pod läuft ohne PVC, mit `readOnlyRootFilesystem` und UID 10001. Solange `encryptedToken` oder `encryptedSecretPath` auf `REPLACE_ME` stehen, rendert [`deployment.yaml`](../argocd/apps/ha-mcp/templates/deployment.yaml) kein Deployment.

## Einrichtung bei Neuinstallation

1. In Home Assistant mit einem Admin-Konto einen Long-Lived Access Token anlegen: Profil, Sicherheit, „Langlebige Zugriffstoken".
2. Secret-Pfad erzeugen: `echo "/private_$(openssl rand -hex 32)"`.
3. Beide Werte in http://kubeseal-webgui.homeserver für Namespace `ha-mcp`, Secret `ha-mcp-secrets` (Typ `Opaque`) einzeln versiegeln: Key `token` und Key `secret-path`.
4. Die Strings als `haMcpSecret.encryptedToken` und `haMcpSecret.encryptedSecretPath` in `values.yaml` eintragen, PR mergen.
5. Claude Code lokal im User-Scope verbinden, nie im committeten `.mcp.json` des Repos:

   ```bash
   claude mcp add --transport http home-assistant \
     http://ha-mcp.homeserver/<secret-pfad> --scope user
   claude mcp list
   ```

## Betrieb

```bash
sudo kubectl -n ha-mcp get pods,svc,ingress,sealedsecret,networkpolicy
sudo kubectl -n ha-mcp logs deploy/ha-mcp

# falscher Pfad muss 403/404 liefern
curl -i http://ha-mcp.homeserver/private_falsch
```

Rotation: neuen Pfad und/oder Token erzeugen, alten Token in Home Assistant widerrufen, Schritte 3 und 4 wiederholen. Danach den lokalen Eintrag ersetzen (`claude mcp remove home-assistant`, dann erneut `claude mcp add`).

## Fallstricke

- Der Secret-Pfad ist das Passwort. Nicht in Chats, Issues oder Klartext-Dateien einfügen. Der Token hat vollen API-Zugriff des Kontos; bei Verdacht sofort in Home Assistant widerrufen.
- Der Read-Only-Mode muss aus sein, sonst legt ha-mcp keine Dashboards an. Server-Settings überleben ohne PVC keinen Pod-Neustart; nach einem Neustart prüfen.
- Liefert der korrekte Pfad 403/404, steht der tatsächlich genutzte Pfad im Pod-Log.
- Port 8086 gilt für den HTTP-Modus. 9584 und 9583 gehören zur In-Process- bzw. Add-on-Variante.
- Zeigt Claude Code nach einer Änderung alte Tools, die Verbindung in der Session neu aufbauen (`/mcp`).
- Timeout zu Home Assistant: Die Freigabe für `ha-mcp` in der HA-NetworkPolicy fehlt, siehe [gotchas.md](gotchas.md#home-assistant--ha-mcp).
