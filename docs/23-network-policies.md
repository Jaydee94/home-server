# 23 – NetworkPolicies

Bis auf `ha-mcp` und `home-assistant` (die schon vorher eigene, eng
geschnittene `NetworkPolicy`-Ressourcen hatten) liefen alle App-Namespaces
in einem flachen Cluster-Netz: jeder Pod in jedem Namespace konnte jeden
anderen Pod über dessen ClusterIP erreichen. Dieses Dokument beschreibt das
Muster, mit dem ein Teil davon geschlossen wurde, und — genauso wichtig —
welche Namespaces **bewusst ausgenommen** wurden und warum.

## Muster: Namespace-Isolation (Ingress-only)

Jede betroffene App bekommt eine `templates/networkpolicy.yaml` mit genau
einer `NetworkPolicy`:

```yaml
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector: {}                # jeder Pod im selben Namespace
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system   # Traefik-Ingress
```

- **Nur `Ingress`, nie `Egress`.** Ausgehender Traffic (DNS-Auflösung,
  Internet-Zugriff für *arr-Downloads, HA-Extension-Init-Container, apt/curl
  in Init-Containern, …) bleibt vollständig unangetastet. Das minimiert das
  Risiko, etwas kaputt zu machen — es gibt in diesem Setup keine
  Staging-Umgebung, jede Änderung geht direkt gegen den produktiven
  Single-Node-Cluster.
- **`podSelector: {}` als erster `from`-Eintrag erlaubt jeglichen Traffic
  innerhalb desselben Namespace.** Das ist bewusst grob (nicht
  Port-scharf) — Apps mit mehreren zusammenspielenden Komponenten im
  selben Namespace (z. B. Argo Workflows Controller/Server, der
  VictoriaMetrics-Stack aus VMSingle/VMAgent/VMAlert/Alertmanager/Grafana,
  Recyclarr → Sonarr/Radarr im `media`-Namespace) funktionieren dadurch
  unverändert weiter, ohne dass jede interne Verbindung einzeln
  nachvollzogen werden musste.
- **`kubernetes.io/metadata.name`** ist seit Kubernetes 1.21 ein
  unveränderliches, automatisch gesetztes Label auf jedem Namespace — kein
  manuelles Namespace-Labeling nötig (siehe auch `docs/22-ha-mcp.md`).

## Abgedeckte Namespaces

| Namespace | Zusätzliche Allow-Regel(n) | Grund |
|---|---|---|
| `argo-workflows` | `monitoring` | vmagent scraped Argo Workflows (`monitoring/templates/vm{pod,service}scrape-argo-workflows*.yaml`) |
| `example-whoami` | – | nur Traefik |
| `gameserver-ui` | – | nur Traefik |
| `gotify` | – | nur Traefik |
| `headlamp` | – | nur Traefik |
| `homepage` | – | nur Traefik (Homepage ruft andere Namespaces selbst auf — das ist *deren* Ingress-Regel, nicht Homepages eigene) |
| `kubeseal-webgui` | – | nur Traefik |
| `media` | `monitoring`, `homepage` | vmagent scraped `media-api-exporter`; Homepage-Widgets rufen Seerr/Sonarr/Radarr/Prowlarr/SABnzbd direkt per ClusterIP-DNS auf |
| `minio` | `monitoring`, `argo-workflows` | vmagent scraped MinIO; Argo Workflows nutzt MinIO als S3-Artifact-Repository (`minio.minio.svc.cluster.local:9000`) |
| `monitoring` | `homepage`, `gameserver-ui` | Homepage-Grafana-Widget; gameserver-ui fragt VictoriaMetrics direkt ab (`vmsingle-monitoring-victoria-metrics-k8s-stack.monitoring.svc.cluster.local:8428`) |
| `semaphore` | – | nur Traefik |

Alle Cross-Namespace-Abhängigkeiten wurden vorher per
`grep -rn "svc.cluster.local" argocd/apps/` verifiziert, nicht geraten —
diese Liste ist vollständig für den heutigen Stand des Repos. Wird eine
neue App ergänzt, die per ClusterIP-DNS in einen der obigen Namespaces
hineinruft, muss die jeweilige `networkpolicy.yaml` um einen entsprechenden
`namespaceSelector`-Eintrag ergänzt werden — sonst bricht die Verbindung
stillschweigend (Connection Timeout, keine Fehlermeldung, siehe
`docs/22-ha-mcp.md` Abschnitt 4 für ein Beispiel aus der Praxis).

## Bewusst ausgenommene Namespaces

Diese Namespaces haben **keine** neue NetworkPolicy bekommen. Das ist eine
Scoping-Entscheidung, keine Lücke, die einfach übersehen wurde — jede
hätte ein reales Risiko, den laufenden Betrieb zu brechen, ohne
Staging-Umgebung zum Gegentesten:

- **`pihole`** — läuft auf einer dedizierten MetalLB-LAN-IP
  (`192.168.178.2:53`), die das **gesamte LAN** als DNS-Server nutzt
  (FritzBox zeigt darauf). Traffic über eine MetalLB-LoadBalancer-IP kommt
  je nach `externalTrafficPolicy` mit einer Node-IP oder der echten
  Client-IP als Quelle an — beides matcht **nicht** automatisch gegen
  `podSelector`/`namespaceSelector`. Eine naive Default-Deny-Policy hier
  hätte das Risiko, DNS für das ganze Haus zu brechen. Würde man das
  absichern wollen, bräuchte es eine sorgfältig getestete `ipBlock`-Regel
  für `local_subnet` (`192.168.178.0/24`) statt der hier verwendeten
  Namespace-Isolation.
- **`mosquitto`** — dieselbe Problematik: dedizierte MetalLB-LAN-IP
  (`192.168.178.4:1883`), an die das Nuki Smart Lock direkt spricht
  (siehe `docs/18-nuki-mqtt.md`).
- **`jellyfin`** — hat **drei** parallele Zugriffspfade (Traefik-Ingress,
  dedizierte MetalLB-LAN-IP für Smart-TVs, Tailscale-Klipper-hostPort) —
  die letzten beiden umgehen `podSelector`/`namespaceSelector` auf
  dieselbe Weise wie Pi-hole/Mosquitto. Zusätzlich ruft `media` Jellyfin
  bereits heute per ClusterIP an (`jellyfin.jellyfin.svc.cluster.local`) —
  eine korrekte Policy bräuchte mindestens `ipBlock`-Regeln für LAN +
  Tailscale-CGNAT (`100.64.0.0/10`) plus die `media`-Ausnahme.
- **`metallb`** — Speaker-Pods sprechen über ein Memberlist-Gossip-Protokoll
  auf bestimmten UDP-Ports direkt miteinander; eine falsch geschnittene
  Policy könnte MetalLBs eigene Leader-Election/Failover brechen, was
  wiederum *alle* LoadBalancer-IPs im Cluster (Pi-hole, Mosquitto, Jellyfin)
  lahmlegen würde.
- **`sealed-secrets`** — betreibt einen Admission-Webhook, den der
  Kubernetes-API-Server direkt erreichen muss. Wird dieser Pfad
  blockiert, lassen sich keine neuen SealedSecrets mehr entschlüsseln
  bzw. anlegen — inklusive der Policies aus diesem Dokument selbst, falls
  sie später mal ein SealedSecret bräuchten.
- **`kubevirt`** — mehrere Webhooks (virt-api) plus komplexe
  Pod-zu-Pod-Kommunikation zwischen virt-handler/virt-controller/virt-launcher.
- **`gameserver`** — die 7DTD-VM (KubeVirt) hängt an derselben
  virt-handler/virt-controller-Kommunikation wie `kubevirt` und ist
  ohnehin nur per Tailscale erreichbar (kein In-Cluster-Ingress-Bedarf).
- **`csi-driver-smb`** — CSI-Treiber-Kommunikation läuft primär über
  Unix-Sockets/hostPath, nicht über gewöhnliche Pod-IPs; das
  Risiko/Nutzen-Verhältnis einer Netzwerk-Policy hier ist unklar genug,
  um es für jetzt auszulassen.
- **`monitoring-dashboards`** — enthält nur `ConfigMap`s, keine Pods; eine
  `NetworkPolicy` hätte dort schlicht nichts zu selektieren.
- **`argocd`** — ArgoCD selbst wurde hier nicht angefasst (siehe
  offene Punkte unten).

## Verifikation nach dem Deploy

```bash
ssh -i ~/.ssh/id_ed25519 jaydee@192.168.178.127 \
  'sudo kubectl get networkpolicy -A'

# Homepage-Dashboard öffnen, prüfen ob alle Widgets (Grafana-Status,
# Sonarr/Radarr/Prowlarr/SABnzbd/Seerr-Stats) weiterhin Live-Daten zeigen.
# Grafana öffnen, prüfen ob Argo-Workflows- und MinIO-Dashboards weiterhin
# Daten anzeigen (vmagent-Scraping funktioniert noch).
# Argo Workflows: einen Workflow mit Artifact-Output laufen lassen, prüfen
# ob der Upload nach MinIO klappt.
```

## Offene Punkte / mögliche Folge-Schritte

- Die oben ausgenommenen Namespaces (v. a. `pihole`, `mosquitto`,
  `jellyfin`) ließen sich mit `ipBlock`-Regeln für `local_subnet` und die
  Tailscale-CGNAT-Range absichern — das braucht aber sorgfältiges Testen
  gegen eine Kopie des Clusters oder ein Wartungsfenster, nicht einen
  Fire-and-Forget-Commit.
- `argocd`, `kube-system` selbst und die restlichen Infra-Namespaces
  (`metallb`, `sealed-secrets`, `kubevirt`, `csi-driver-smb`) wurden hier
  nicht angefasst.
