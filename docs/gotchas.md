# Gotchas

Zentrale Sammlung der nicht offensichtlichen Fallstricke dieses Setups. Service-Seiten verlinken hierher, statt die Punkte zu wiederholen.

## Tooling

- **Lokale `kubectl`- und `kubeseal`-Aufrufe treffen den falschen Cluster.** Der lokale kubeconfig zeigt auf einen `kind`-Cluster. `kubectl` und `kubeseal --raw` deshalb per SSH auf dem Server ausführen (Controller `sealed-secrets-controller` im Namespace `sealed-secrets`).
- **In Ansible-Templates gehört `{% endraw %}` auf eine eigene Zeile.** Die Templates rendern mit `trim_blocks`.
- **Der Memory-MCP-Server schreibt nach einer Neuinstallation nicht.** `@modelcontextprotocol/server-memory` legt `dist/.claude/` im npx-Cache nicht selbst an, `create_entities` scheitert dann mit `ENOENT`, `read_graph` liefert stumm ein leeres Ergebnis. Nach jeder Erneuerung des npx-Caches: `mkdir -p "$(ls -d ~/.npm/_npx/*/node_modules/@modelcontextprotocol/server-memory/dist 2>/dev/null | head -1)/.claude"`.

## Host-Hardening (common-Rolle)

- **Das sshd-Drop-in muss vor `50-cloud-init.conf` sortieren.** sshd nimmt pro Keyword den ersten gelesenen Wert, und der Ubuntu-Installer setzt in `50-cloud-init.conf` `PasswordAuthentication yes`. Deshalb heißt die Datei `10-hardening.conf`, Kontrolle mit `sudo sshd -T | grep -E 'passwordauth|permitrootlogin|x11forwarding'`.
- **Ohne Key in `~/.ssh/authorized_keys` schreibt die Rolle kein Drop-in.** Sie warnt und überspringt den Schritt, damit sich niemand aussperrt. Notausgang bei Problemen: lokale Konsole, Datei löschen, `sudo systemctl reload ssh`.
- **SSH ist nur aus LAN, Tailnet und Pod-CIDR offen, und nur über IPv4.** Die Pod-CIDR-Regel braucht Semaphore, das als Pod mit seiner Pod-IP auf sshd zugreift. `ssh` deshalb immer gegen `192.168.178.127` oder die Tailscale-IP.
- **UFW schützt NodePorts und Traefik (80/443) nicht.** kube-proxy und Klipper schreiben diese Verbindungen schon in `nat/PREROUTING` auf Pod-IPs um, sie laufen durch `FORWARD` an den `INPUT`-Regeln vorbei. Einschränken lässt sich ein NodePort nur per NetworkPolicy.
- **Steht ein Reboot an, startet der Host um 05:00 neu.** `unattended-upgrades` plant dann `shutdown -r 05:00` (`unattended_reboot_time`), eine Stunde nach dem Backup (04:00) und vor dem Semaphore-Lauf (06:00), die 7DTD-VM und alle Pods enden dabei hart. Anzeigen mit `shutdown --show`, abbrechen mit `sudo shutdown -c`.

## AppArmor / Container-Signale

- **Auf Ubuntu 26.04 verweigert AppArmor Signale innerhalb von Containern.** Mit `kernel.apparmor_restrict_unprivileged_unconfined=1` (Ubuntu-Default) bekommen Container das gestapelte Label `cri-containerd.apparmor.d//&unconfined`, das containerd-Profil erlaubt Signale aber nur an `cri-containerd.apparmor.d`. Betroffen waren QEMU (KubeVirt), vmagent/vmalert (SIGHUP), Sonarr/Radarr (.NET bricht lautlos ab, Sonarrs `config.xml` wurde dabei geleert) und Postgres (SIGURG).
- **Die `common`-Rolle setzt den Sysctl deshalb auf `0`.** Die Datei `/etc/sysctl.d/99-apparmor-containers.conf` wirkt nur auf neu gestartete Prozesse, nach dem ersten Ausrollen also einmal rebooten.
- **Signal-Denials stehen im Kernel-Log.** `sudo journalctl -k | grep 'apparmor="DENIED".*operation="signal"'` zeigt sie, `sudo cat /proc/<pid>/attr/current` das Label eines Prozesses. Schnelltest: `sudo kubectl run t --rm -i --restart=Never --image=<alpine-image> --command -- sh -c 'cat /proc/self/attr/current; sleep 20 & kill -USR1 $!; echo rc=$?'`.
- **Die `Unconfined`-Ausnahmen stammen aus der Zeit vor dem Sysctl-Fix.** Betroffen sind KubeVirt-VM, vmagent, vmalert, das interne vmauth, Sonarr/Radarr/Prowlarr sowie webtrees und seine MariaDB (dort hing `gosu` bei 100 % CPU). Sie können weg, sobald nach dem Reboot keine Signal-Denials mehr im Kernel-Log stehen.

## ArgoCD / GitOps

- **Ein App-Verzeichnis zu löschen oder umzubenennen lässt die Ressourcen stehen.** Wegen `preserveResourcesOnDeletion: true` im ApplicationSet löscht ArgoCD nur das Application-Objekt, Deployments, Secrets und PVCs laufen verwaist weiter. Ein Umbenennen erzeugt eine zweite App in einem neuen Namespace, die Daten ziehen nicht mit.
- **Aufräumen geht nur von Hand.** Nach dem Sichern der Daten löscht `sudo kubectl delete namespace <name>` alles Namespaced samt der `local-path`-Daten, Reste zeigt vorher `sudo kubectl get all,pvc,ingress,networkpolicy -n <name>`. Cluster-weite Objekte findet `sudo kubectl get pv,clusterrole,clusterrolebinding,crd -o name | grep <name>`, statische SMB-PVs haben `Retain` und die NAS-Daten bleiben in jedem Fall.
- **Daten-PVCs tragen `argocd.argoproj.io/sync-options: Delete=false,Prune=false`.** Das gilt für die eigenen `local-path`-PVCs (`ntfy`, `semaphore`, `media`, `victorialogs-data`, alles über `common.pvc` wie `paperless-ai`), die Chart-PVCs von Jellyfin und Pi-hole und den `DataVolume` des Gameservers. `Prune=false` greift, wenn die PVC aus dem Rendering verschwindet, `Delete=false` beim kaskadierenden Löschen der App, die dann absichtlich `OutOfSync` („pruning skipped“) bleibt, bis jemand die PVC von Hand löscht. Neue Apps mit eigener PVC bekommen dieselbe Annotation.
- **PVCs aus `volumeClaimTemplates` schützt keine Annotation.** Home Assistant, Mosquitto und Remedy behalten sie trotzdem, weil ArgoCD sie nicht trackt und das StatefulSet sie beim Löschen stehen lässt (`persistentVolumeClaimRetentionPolicy: Retain`). `rps-arena-redis` und `remedy-postgres-backup` kommen aus Charts ohne Annotation-Value und sind nur über `preserveResourcesOnDeletion` geschützt, `kubectl delete namespace` oder `kubectl delete pvc` löscht in allen Fällen sofort.
- **Ein Feld unter `ignoreDifferences` wird nie angewendet.** Mit `RespectIgnoreDifferences=true` fällt es aus Diff und Apply, und die App bleibt trotzdem `Synced`. Regeln deshalb per `name`/`namespace` oder `jqPathExpressions` eng schneiden (`name` ist ein exakter Vergleich ohne Wildcards). Die CRD-Regel für `/spec/versions` gilt nur für `cdis.cdi.kubevirt.io` und `kubevirts.kubevirt.io`.
- **Helm-Charts aus OCI-Registries brauchen das Präfix `oci://`.** Beispiel `kubeseal-webgui` (`oci://ghcr.io/...`): eine HTTP-Repo-URL liefert 404, obwohl das Chart in der Registry liegt.
- **Das Library-Chart `argocd/lib/common` liegt absichtlich außerhalb von `argocd/apps/`.** Dort würde das ApplicationSet eine App daraus machen. Der repo-server baut die Dependency selbst (`charts/` und `Chart.lock` sind gitignored), und eine Änderung an der Library löst in CI keinen Chart-Lint aus: danach `paperless-ai`, `ha-mcp`, `media` und `webtrees` lokal mit `helm template` gegen `main` vergleichen und Selektor-Labels sowie PVC-Spec deployter Charts nie ändern.
- **ArgoCD verwaltet sich selbst, Änderungen gehören nach `argocd/apps/argocd/`.** `helm upgrade --set …` von Hand dreht `selfHeal` sofort zurück, und die Rolle `argocd` installiert nur auf einem frischen Cluster oder mit `make argocd-recover`. `helm list -n argocd` zeigt den Stand des Bootstraps, nicht die laufende Version ([ArgoCD](05-argocd.md#upgrades)).

## Secrets / SealedSecrets: Admin-Passwörter

- **Neue Apps mit Admin-UI starten oft ohne Passwort.** Damit der erste Sync ohne Handarbeit `Healthy` wird, liefern Charts wie Pi-hole, Grafana, Mosquitto und Gotify den Admin-Zugang zunächst ohne Secret aus, die UI ist dann nur durch LAN und Tailnet geschützt (in diesem Repo bei allen vier bereits versiegelt). Direkt nach dem ersten Sync das Passwort sealen (`kubeseal --raw --namespace <ns> --name <secret-name> --controller-name sealed-secrets-controller --controller-namespace sealed-secrets --from-file=/dev/stdin`), als `encryptedPassword` eintragen und zusätzlich `adminSecret.enabled: true` und `existingSecret` setzen, das Muster steht als Kommentar in den `values.yaml` (z. B. [`argocd/apps/pihole/values.yaml`](../argocd/apps/pihole/values.yaml)).

## MetalLB / Networking

- **MetalLB und Klipper brauchen auf beiden Seiten dieselbe `loadBalancerClass`.** Der Service (bei Pi-hole `serviceDns.loadBalancerClass`) und der Controller (`metallb.loadBalancerClass`) setzen `metallb.universe.tf/metallb`. Klipper überspringt klassifizierte Services, MetalLB nimmt nur passende, und fehlt eine Seite, bleibt der Service `<pending>` oder bekommt zwei EXTERNAL-IPs.
- **MetalLB hält eine IP auch nach dem Entfernen der Annotation fest.** Wechselt ein Service von LoadBalancer auf ClusterIP, bleibt die IP trotz entfernter `metallb.io/ip-allocated-from-pool`-Annotation im Speicher des Controllers belegt. Fix: `sudo kubectl -n metallb rollout restart deployment metallb-controller`.
- **`jellyfin-tailscale` hat absichtlich keine `loadBalancerClass`.** Klipper soll den Service übernehmen und hostPort `0.0.0.0:8096` binden, damit geteilte Tailscale-Nodes Jellyfin über `http://<tailscale-ip>:8096` erreichen ([Jellyfin](16-jellyfin.md)).

## NetworkPolicies

- **Neue Cross-Namespace-Aufrufe scheitern ohne Fehlermeldung.** Isolierte Namespaces (u. a. `media`, `monitoring`, `homepage`) lassen Ingress nur aus dem eigenen Namespace, von Traefik (`kube-system`) und von gelisteten Aufrufern zu, ein neuer Aufrufer bekommt einen Timeout. Fix: in der `networkpolicy.yaml` der Ziel-App einen `namespaceSelector` für den Aufrufer ergänzen ([NetworkPolicies](23-network-policies.md)).
- **Den Alertmanager per Pod-Label selektieren.** `vmalertmanager-monitoring-victoria-metrics-k8s-stack` (Port 9093) ist ein headless Service mit genau einem Pod (`app.kubernetes.io/name=vmalertmanager`), Egress-Regeln anderer Namespaces wie Remedy müssen deshalb den Pod treffen. Zusätzlich muss `monitoring-namespace-isolation` den Quell-Namespace erlauben.
- **Einige Namespaces haben bewusst keine Policy.** `pihole`, `mosquitto` und `jellyfin` empfangen über MetalLB-IPs Traffic ohne matchbare Quelle, `metallb`, `sealed-secrets`, `kubevirt`, `gameserver` und `csi-driver-smb` hängen an Webhook-, Controller- oder Gossip-Verkehr. Nicht ohne Testfenster nachrüsten, die Begründung steht in [NetworkPolicies](23-network-policies.md).

## Pi-hole / DNS

- **Pi-hole auf der MetalLB-IP `192.168.178.2` ist der einzige DNS-Server.** Der Host fragt es über die `host_dns`-Rolle, das LAN erst, wenn in der FritzBox „Lokaler DNS-Server = 192.168.178.2“ eingetragen ist ([Pi-hole](15-pihole.md)).
- **Pi-hole nie auf die Node-IP legen.** Klipper würde hostPort `0.0.0.0:53` binden und den Host-Resolver lahmlegen, deshalb die eigene MetalLB-IP.
- **`192.168.178.2` muss außerhalb des DHCP-Bereichs der FritzBox liegen.** Sonst droht ein ARP-Konflikt. Eine andere IP muss an vier Stellen geändert werden: `argocd/apps/metallb/templates/ipaddresspool.yaml`, `argocd/apps/pihole/values.yaml`, `pihole_dns_ip` in `ansible/group_vars/all.yml` und die FritzBox.
- **Pods lösen `*.homeserver` über die ConfigMap `coredns-custom` auf.** CoreDNS würde zufällig an Pi-hole oder die FritzBox weiterleiten, und die FritzBox antwortet NXDOMAIN. `coredns-custom` in `kube-system` (aus [`argocd/apps/pihole/templates/coredns-custom.yaml`](../argocd/apps/pihole/templates/coredns-custom.yaml)) beantwortet die Zone direkt.

## Tailscale

- **Die `tailscale`-CLI liest `TS_AUTHKEY` nicht.** Die Variable kennen nur containerboot und tsnet, mit ihr wartete `tailscale up` endlos auf einen Browser-Login. Die Rolle übergibt den Key deshalb als Datei (`--auth-key=file:/run/tailscale-authkey`, `0600`, nur während des Tasks) plus `--timeout`.
- **Ein fehlgeschlagener Tailscale-Login macht den Lauf nicht rot.** Auth-Keys laufen nach spätestens 90 Tagen ab, die Rolle meldet dann „Tailscale is not connected“ als `WARNING` und überspringt die restlichen Tailscale-Tasks. Fix: neuen Key erzeugen und mit `ansible-vault encrypt_string ... --name tailscale_auth_key` hinterlegen ([Tailscale](06-tailscale.md)).

## TLS / HTTPS

- **Alle Ingresses teilen sich ein Zertifikat der Homeserver-CA.** `argocd/apps/cert-manager` stellt `homeserver-ingress-tls` mit allen Hostnamen aus `ingressTls.hosts` aus und hängt es per `TLSStore default` in `kube-system` als Traefik-Default ein. HTTP leitet nicht auf HTTPS um, damit Cluster-interne `http://`-Aufrufe und Geräte ohne CA weiter funktionieren.
- **Jeder neue Ingress-Hostname gehört in `ingressTls.hosts`.** Fehlt er in [`argocd/apps/cert-manager/values.yaml`](../argocd/apps/cert-manager/values.yaml), zeigt der Browser eine Zertifikatswarnung. Ein Wildcard-Zertifikat geht nicht, weil Browser `*.homeserver` direkt unter einer TLD ablehnen.
- **Jedes Gerät muss der CA einmal vertrauen.** Export mit `sudo kubectl -n cert-manager get secret homeserver-ca-secret -o jsonpath='{.data.ca\.crt}' | base64 -d > homeserver-ca.crt`, dann als Stammzertifizierungsstelle importieren (gültig bis 2036).
- **„TRAEFIK DEFAULT CERT“ heißt: Secret oder TLSStore fehlt.** Prüfen mit `echo | openssl s_client -connect 192.168.178.127:443 -servername grafana.homeserver 2>/dev/null | openssl x509 -noout -issuer -ext subjectAltName`, erwartet ist der Issuer „Homeserver Root CA“. Bei „TRAEFIK DEFAULT CERT“ fehlt `homeserver-ingress-tls` oder der TLSStore.

## Alerting

- **Es gibt keinen Dead-Man's-Switch.** `Watchdog` und `InfoInhibitor` feuern absichtlich dauerhaft und gehen in den `blackhole`-Receiver, fällt der Node aus, kommt keine Meldung. Abhilfe wäre, `Watchdog` auf einen Webhook zu einem externen Heartbeat-Dienst zu routen (Route-Kommentar in [`argocd/apps/monitoring/values.yaml`](../argocd/apps/monitoring/values.yaml)).
- **Eigene Regeln nicht neben die Default-Regeln stellen.** CrashLoops und Pending-Pods decken `KubePodCrashLooping` und `KubePodNotReady` ab. Eine eigene Regel mit `for: 0m` auf `increase(restarts[15m])` flattert bei jedem Back-off.
- **`up{namespace="…"} == 0` feuert nie, wenn der Namespace kein Scrape-Target hat.** Für Workloads ohne Metrik-Endpoint kube-state-metrics (`kube_statefulset_status_replicas_ready`) oder einen Blackbox-TCP-Probe nutzen.
- **Backup-Fehler melden sich über `SystemdUnitFailed`.** Die Unit ist `homeserver-backup.service`, mit gesetztem `backup_ntfy_url` meldet das Backup zusätzlich direkt per ntfy.
- **Default-Regeln und -Dashboards kommen vom `sync-job`, nicht aus Helm.** Der PostSync-Hook `monitoring-victoria-metrics-k8s-stack-sync-job` lädt sie bei jedem Sync von `raw.githubusercontent.com` (Label `app.kubernetes.io/managed-by=sync-job`, in ArgoCD nicht als eigene Ressourcen sichtbar), ohne GitHub-Zugriff scheitert deshalb der Sync. Die Quellen in `defaultRules.sources` und `defaultDashboards.sources` (auch die VictoriaLogs-Regeln `vlogs`, `vlagent`, `vlhealth`) sind auf Commit-SHAs gepinnt und Renovate pflegt sie nicht: SHA eines Upstream-Repos in allen seinen URLs ersetzen, mergen und `sudo kubectl -n monitoring logs job/monitoring-victoria-metrics-k8s-stack-sync-job` lesen.
- **Gruppen-Keys unter `defaultRules.groups` müssen exakt die Upstream-Namen sein.** Also `kubernetes-system-scheduler`, nicht `kubernetesSystemScheduler`, ein falscher Key wird still ignoriert. Scheduler-, Controller-Manager- und etcd-Regeln hängen ohnehin an `kubeScheduler.enabled`, `kubeControllerManager.enabled` und `kubeEtcd.enabled`.
- **`PVCAlmostFull` und `PVCCritical` messen bei `local-path` die Host-Platte.** `kubelet_volume_stats_capacity_bytes` zeigt für jedes local-path-PVC das Dateisystem des Nodes (500 GB), nur SMB-Volumes melden ihre eigene Größe. Für vmsingle gibt es deshalb `VMSingleDataOverBudget` (`vm_data_size_bytes` gegen den PVC-Request).
- **vmalert fragt vmsingle direkt, nicht über VMAuth.** Mit aktivem `VLSingle` stellt der Chart `vmalert.datasource` auf das interne VMAuth um, ein Absturz von vmauth (SIGHUP, siehe [AppArmor](#apparmor--container-signale)) stoppte dann die ganze Alarmauswertung, deshalb setzt `vmalert.spec.datasource.url` das zurück. Log-basierte Alarme (LogsQL in einer `VMRule`) gehen erst, wenn diese Zeile entfernt ist.

## Grafana

- **Sidecar und `grafana.dashboards` schließen sich aus.** `grafana.sidecar.dashboards.enabled: true` zusammen mit `grafana.dashboards:` bricht das Helm-Template. Dashboards kommen nur als ConfigMaps mit Label `grafana_dashboard=1`.
- **Grafana stürzt mit `no such column: is_service_account` ab.** Dann `grafana.db` auf dem PVC löschen (`/var/lib/rancher/k3s/storage/<pvc-name>_monitoring_monitoring-grafana/`) und Grafana neu starten.
- **`Recreate` lässt sich nicht allein per Values setzen.** Grafana läuft mit `RollingUpdate` auf einem RWO-PVC mit SQLite. `grafana.deploymentStrategy.type: Recreate` scheitert beim Server-Side-Apply am vom API-Server gesetzten `spec.strategy.rollingUpdate` (`Forbidden: may not be specified when strategy type is 'Recreate'`), und der Sync der ganzen `monitoring`-App schlägt fehl; nötig wäre ein JSON-Patch `remove /spec/strategy/rollingUpdate` plus `type: Recreate` zeitgleich mit dem Merge, weil selfHeal sonst den alten Stand herstellt (nicht erprobt).
- **Dashboard-JSON vor dem Commit validieren und UIDs eindeutig halten.** Ungültiges JSON meldet Grafana nur im Log (`failed to load dashboard`, alle 30 s). Zwei Dashboards mit derselben `uid` überschreiben sich gegenseitig.
- **Das VictoriaLogs-Plugin installiert Grafana asynchron.** `victoriametrics-logs-datasource` kommt über `GF_PLUGINS_PREINSTALL`, weil `grafana.plugins` (`GF_PLUGINS_PREINSTALL_SYNC`) den Start verhindert, wenn der Download scheitert. Ohne Internet zeigt die Datasource „plugin not found“, bis ein Neustart mit Netz das Plugin auf das PVC (`/var/lib/grafana/plugins`) holt; danach braucht kein Neustart mehr Netz.

## Logs / VictoriaLogs

`VLSingle` speichert die Pod-Logs (Service `vlsingle-monitoring-victoria-metrics-k8s-stack:9428`, PVC `victorialogs-data` mit 10Gi), ein `VLAgent`-DaemonSet liest sie read-only aus `/var/log/containers` und `/var/log/pods`. Die Konfiguration steht kommentiert in [`argocd/apps/monitoring/values.yaml`](../argocd/apps/monitoring/values.yaml), Abfragen über Grafana beschreibt [Monitoring](13-monitoring.md).

- **VictoriaLogs hat keinen Ingress.** Ohne Grafana: `ssh -L 9428:localhost:9428 jaydee@192.168.178.127 'sudo kubectl -n monitoring port-forward svc/vlsingle-monitoring-victoria-metrics-k8s-stack 9428'`, dann `http://localhost:9428/select/vmui` oder `curl localhost:9428/select/logsql/query -d 'query=kubernetes.pod_namespace:=kube-system' -d 'limit=20'`. Auf dem Server reicht `sudo kubectl get --raw "/api/v1/namespaces/monitoring/services/vlsingle-monitoring-victoria-metrics-k8s-stack:9428/proxy/select/logsql/query?query=error&limit=20"`.
- **Der Agent hängt nur `kubernetes.*`-Felder an.** Das sind `pod_namespace`, `pod_name`, `container_name`, `pod_node_name` und `pod_labels.*`, Pod-Annotationen und Node-Labels sind aus. Alle Feldnamen listet `curl localhost:9428/select/logsql/field_names -d 'query=*'`.
- **Das Plattenlimit greift vor der Retention.** Neben 14 Tagen `retentionPeriod` gilt `retention.maxDiskSpaceUsageBytes: 8GiB`, danach löscht VictoriaLogs die ältesten Tages-Partitionen. `local-path` erzwingt keine Quota und expandiert nicht, das PVC lässt sich per Helm nicht vergrößern.
- **`storage: "0"` im `VLSingle` ist Absicht.** Der Chart-Default (20Gi) legte sonst ein zweites, ungeschütztes PVC an, das dem CR gehört, und `storage: null` greift nicht, weil Helm Nulls nur in übergebenen Values löscht. Bei Größe 0 mountet der Operator nur die eigenen `volumes`.
- **`logsPath: /var/log/containers/` endet absichtlich mit `/`.** Für genau `/var/log/containers` mountet der Operator den kompletten Host-`/var/log` und `/var/lib` read-only. Mit dem Slash bleiben nur die beiden hostPath-Mounts `/var/log/containers` (Symlinks) und `/var/log/pods` (Ziele).

## Disk / SMART

- **Die NVMe überwacht `smartctl-exporter`, auf dem Host fehlen `smartctl` und `nvme-cli`.** Werte ansehen mit `sudo kubectl -n smartctl-exporter exec ds/smartctl-exporter-prometheus-smartctl-exporter-0 -- /usr/sbin/smartctl -a /dev/nvme0` oder in Grafana mit `{__name__=~"smartctl_device_.*"}`. Scrape und Alerts liegen in `argocd/apps/monitoring/templates/` (Gruppe `homeserver.disk`).
- **Der Exporter läuft `privileged`.** Ohne kommt er nicht an `/dev/nvme0`, und privilegierte Container laufen mit dem Label `unconfined`, die AppArmor-Signal-Denials betreffen ihn also nicht.
- **Nur `/dev/nvme0` ist konfiguriert.** Eine zweite Platte muss in `config.devices` eingetragen werden.
- **`SmartctlExporterDown` erkennt keine veralteten Daten.** Scheitert `smartctl` nach einem erfolgreichen Lauf, liefert der Exporter weiter das letzte gute Ergebnis. Nach Kernel- oder Firmware-Updates einmal ins Pod-Log schauen (`S.M.A.R.T. output reading`).
- **`DiskMediaErrors` bleibt aktiv, sobald der Zähler über 0 ist.** Der Controller zählt über die Lebenszeit der Platte. Nach der Diagnose im Alertmanager stummschalten, bis die Platte getauscht ist.

## Home Assistant / HA-MCP

- **Frontend-Karten einmal von Hand als Lovelace-Ressource registrieren.** Die Erweiterungen kommen ohne HACS per Init-Container, die Ressourcen trägt man unter *Einstellungen > Dashboards > Ressourcen* ein ([Home Assistant](17-homeassistant.md)).
- **Nuki braucht den Broker auf der MetalLB-IP `192.168.178.4:1883`.** Nötig ist Firmware ab 4.0.28. Solange das SealedSecret `mosquitto-auth` leer ist, bleibt der Mosquitto-Pod in `ContainerCreating` ([Nuki MQTT](18-nuki-mqtt.md)).
- **Die HA-NetworkPolicy muss Ingress aus dem Namespace `ha-mcp` erlauben.** Fehlt die Regel, bekommt HA-MCP einen Timeout statt einer Fehlermeldung ([HA-MCP](22-ha-mcp.md)).

## KubeVirt / Gameserver

- **KubeVirt braucht `/dev/kvm`.** Vor dem ersten Sync `virt-host-validate` ausführen. `useEmulation: true` in `argocd/apps/kubevirt/kubevirt-cr.yaml` geht ohne KVM, ist für 7DTD aber zu langsam.
- **Die AppArmor-Annotation der VM wendet ArgoCD nicht an.** `/spec/template/metadata/annotations` der VirtualMachine steht in `ignoreDifferences`, die Annotation im Chart ist nur Dokumentation. Gesetzt wird sie per Patch, der jeden Sync überlebt: `sudo kubectl patch vm 7dtd-server -n gameserver --type=merge -p '{"spec":{"template":{"metadata":{"annotations":{"container.apparmor.security.beta.kubernetes.io/compute":"unconfined"}}}}}'`.
- **Erste Sync-Fehler von `gameserver` sind normal.** `argocd/apps/kubevirt/` muss vorher konvergieren, das übernimmt der ArgoCD-Retry (5×, exponentiell).
- **Die VM bleibt `Halted`, bis das cloud-init-Secret versiegelt ist.** `vm.runStrategy` beginnt mit `Halted`. Start bei Bedarf: `sudo kubectl patch vm 7dtd-server -n gameserver --type merge -p '{"spec":{"runStrategy":"Always"}}'` ([Gameserver](19-gameserver.md)).
- **CDI läuft im eigenen Namespace `cdi`.** Ressourcen mit eigenem `namespace:`-Feld überschreiben die ArgoCD-Destination.
- **Das SealedSecret `gameserver-cloudinit` enthält die komplette Userdata.** Jede Änderung heißt neu versiegeln und `values.yaml` aktualisieren ([Gameserver](19-gameserver.md)).
- **Tailscale-Node-Sharing mit `tag:gameserver` braucht den Tag in `tagOwners`.** Ein tag-basiertes `dst` macht Probleme ([tailscale/tailscale#14445](https://github.com/tailscale/tailscale/issues/14445)). Workaround: Grant direkt auf die Tailscale-IP.

## Media-Stack

- **Downloads und Bibliothek liegen im selben SMB-Mount (cifs `uid=1001`).** Imports sind so serverseitige Moves, Hardlinks gehen über SMB nicht. Das Jellyfin-PV mountet denselben Share mit `uid=0` ([Media-Stack](21-media-stack.md)).
- **Kein Job synct die Sprach-Profile.** Die Quality-Profile „[German] …“ und die German-Custom-Formats liegen nur in den SQLite-Datenbanken von Sonarr und Radarr auf den `*-config`-PVCs. Änderungen in der UI bleiben erhalten, nach einem PVC-Verlust müssen die Profile neu angelegt werden ([Media-Stack](21-media-stack.md)).

## Scanner / SANE

- **`scanner_usb_product_id` muss gesetzt sein.** Die ID per `lsusb` am Host ermitteln und in `ansible/group_vars/all.yml` eintragen, beim ersten Lauf muss außerdem die NAS erreichbar sein ([Scanner](10-scanner.md)).
- **scanbd hält das USB-Gerät exklusiv.** Solange scanbd läuft, scheitert `scanimage` mit `LIBUSB_ERROR_BUSY`, deshalb stoppt und startet `scanner-trigger.service` scanbd selbst. Diagnose: `SANE_DEBUG_SANEI_USB=1 scanimage -L`.
- **Als `saned` braucht SANE den Konfig-Pfad explizit.** Skripte so starten: `runuser -u saned -- env SANE_CONFIG_DIR=/etc/sane.d <script>`.

## Semaphore / Bootstrap

- **Der erste Bootstrap-Lauf liefert HTTP 400.** Die Rolle ist idempotent: so lange wiederholen, bis der Lauf sauber durchläuft, Folgeläufe ändern nichts.
- **Der Bootstrap gleicht bei jedem Lauf alles ab.** Keys, Projekte und Templates (per `PUT /api/project/{id}/templates/{tid}`, mit `changed_when: false`, weil `uri` sonst immer `changed` meldet) werden reconciliert. Vault-Passwort rotieren: neuen Wert mit `ansible-vault encrypt_string … --name 'semaphore_vault_password'` in `all.yml` einsetzen, dann `make semaphore-bootstrap`.
- **Jedes Target muss den Semaphore-Key autorisieren.** Den Pubkey aus `sudo cat /etc/semaphore-secrets/id_ed25519.pub` auf jedem Target in `authorized_keys` eintragen (`make semaphore-targets`).
- **Integer-Felder mit `body_format: json` als Dict-Literal bauen.** Im `>-`-Block `{{ {'key': val | int} | to_json }}` schreiben.

## UGREEN NAS / Portainer / Paperless

- **Portainer-HTTPS liegt auf Port 9444.** UGOS belegt `0.0.0.0:9443`, `docker compose up` scheitert dort mit „address already in use“. `portainer_https_port: 9444` in `ansible/host_vars/ugreen-nas/vars.yml` nie zurückstellen.
- **Das Portainer-Admin-Passwort liegt im Vault.** `vault_portainer_admin_password` in `ansible/group_vars/all.yml`, ändern per `ansible-vault encrypt_string`. Die Token-Rotation für Homepage steht in [Homepage](14-homepage.md).
- **Die cAdvisor-Antwort der NAS sprengt das Default-Scrape-Limit.** Sie ist etwa 19 MB groß, vmagent erlaubt standardmäßig 16 MiB. `promscrape.maxScrapeSize: "32MB"` in `vmagent.spec.extraArgs` hebt das Limit global an, `VMStaticScrape` hat dafür kein eigenes Feld.
- **`name: paperless` in `docker-compose.yml.j2` nie ändern.** Ohne festen Namen leitet `docker compose` ihn vom Verzeichnisnamen ab und kapert die Container einer zweiten Installation in einem gleichnamigen Verzeichnis (etwa `~/paperless`), ein anderer Name startet einen zweiten Stack mit zweitem Postgres auf demselben `/opt/paperless/db`. Bei Verdacht die Bind-Mounts prüfen: `docker inspect <container> --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{end}}'`.
- **Die Postgres-Major-Version darf nie floaten.** Ein Sprung über eine Major-Grenze (etwa 16 auf 18) lässt den `db`-Container mit „database files are incompatible“ abstürzen. Renovate schlägt für `postgres` deshalb nur Minor und Patch vor ([`renovate.json`](../renovate.json)), ein Major-Upgrade braucht manuelles `pg_upgrade`.
- **`/opt/paperless` liegt auf der 19-GB-Systempartition (eMMC), nicht auf dem RAID.** Unter `/opt` nichts Großes ablegen. Die Backup-Archive gehen deshalb nach `/volume1/paperless-backups` (`paperless_backup_dir`), und das Skript bricht ab, wenn `/volume1` nicht gemountet ist ([Backup](26-backup.md)).
