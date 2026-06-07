# GETBETTER

_Letzte Aktualisierung: 2026-06-07_

## Entscheidungen

- **scanbd direkt-Modus + systemd-Path-Unit-Entkopplung statt Manager-Modus**: scanbd im direct mode erkennt den Hardware-Button zuverlässig. Der USB-Exklusiv-Anspruch wird gelöst, indem scan_button.sh nur eine Flag-Datei setzt; ein unabhängiger systemd-Dienst (scanner-trigger.service) stoppt scanbd, scannt, startet scanbd neu. Alternativen (saned/net-Backend, Manager-Modus) wurden verworfen, weil scanbd `local_only=1` in `sane_get_devices()` hartcodiert hat → net-Backend gibt immer leere Geräteliste zurück.

- **`/var/tmp/scanner/scan-pending` als Trigger-Flag**: Im `ReadWritePaths` des scanbd.service enthalten, erreichbar für den saned-User via scanner-Gruppe. Besser als `/run/scanner/...` (wäre nach Reboot leer) oder `/tmp/...` (unsicherer Shared Namespace).

- **`runuser -u saned -- env SANE_CONFIG_DIR=/etc/sane.d script`**: Explizites Setzen von SANE_CONFIG_DIR beim Ausführen als saned-User, damit `/etc/sane.d/dll.conf` (= fujitsu) genutzt wird, nicht `/etc/scanbd/dll.conf`.

- **ADF Duplex: alle Seiten rotieren + Paare tauschen**: Der Fujitsu ADF scannt Rückseite zuerst UND beide Seiten 180° gedreht. Fix im scan_to_pdf.sh: erst alle TIFFs mit `mogrify -rotate 180` drehen, dann Paare tauschen (`[back_rot, front_rot]` → `[front_rot, back_rot]`). Konfigurierbar via `scanner_duplex_rotate_back_pages` und `scanner_duplex_back_first`. Verifiziert durch iteratives Nutzer-Feedback.

- **PDF-Rotation für Paperless via pikepdf Content-Stream, nicht /Rotate-Metadatum**: OCRmyPDF ignoriert beim Re-Processing das `/Rotate`-Metadatum zuverlässig. Rotation muss physisch in den Content-Stream eingebacken werden: `q\n-612 0 0 -792 612 792 cm\n/Im0 Do\nQ`. Zusätzlich OCR-XObjects (`/OCR-...`) aus `/Resources` entfernen, damit Paperless die Seite neu OCR'd.

- **Semaphore-Environment statt deprecated `vault_key_id`**: Semaphore v2.18+ ignoriert `vault_key_id` im Template-Body und strippt zudem die Pod-Container-Env beim Task-Spawn. Lösung: per Projekt eine "default-env" Environment via API anlegen die `ANSIBLE_VAULT_PASSWORD_FILE` setzt, dann an jedes Template via `environment_id` koppeln.

- **`+ semaphore_pem_newline` statt `+ '\n'` in Jinja2-Bodies**: PEM-Schlüssel werden in `key.yml` via API geschrieben. In einem YAML folded scalar `>-` wird `'\n'` als literaler 2-Char-String an Jinja2 weitergereicht — `to_json` serialisiert ihn dann als `\\n`, Semaphore speichert den Key kaputt. Lösung: `semaphore_pem_newline: "\n"` in `login.yml` als `set_fact`.

- **Reboot-Skip via `lookup('env', 'SEMAPHORE_TASK_ID')`**: `common`-Role darf den Host nicht rebooten wenn das Playbook aus dem Semaphore-Pod heraus läuft.

- **`SEMAPHORE_SCHEDULE_TIMEZONE=Europe/Berlin` im Deployment statt UTC-Cron**: DST-sicher, ohne den Cron-String anzufassen.

- **Schedules deklarativ im `semaphore_bootstrap`-Role**: Neue `schedule.yml` (idempotent: GET-list → POST-if-missing → PUT-self-heal); `project.yml` baut eine Template-Name→ID-Map nach dem Template-Loop.

- **Laufende Secret-Werte auslesen statt neu erfinden**: Für `vault_paperless_*` die echten Werte aus der bereits deployten NAS-`.env` gelesen — ein neues DB-Passwort hätte die bestehende PostgreSQL-DB unzugänglich gemacht.

- **`CronWorkflow.spec.schedules` (Array) in Argo Workflows v4.x**: `spec.schedule` (String) wurde in v4.x aus dem CRD-Schema entfernt. Ersatz: `spec.schedules: ["0 3 * * *"]`.

- **jameswynn/homepage Helm Chart als Wrapper (Ansatz A)**: Upstream-Dependency statt plain Manifests oder Custom Chart — folgt dem headlamp-Muster, Renovate hält Version aktuell. Konfiguration unter `homepage.config.*` (settings, services, widgets, bookmarks) — nicht direkt unter `homepage:`. `homepage.config.kubernetes.mode: cluster` geht in `config:`, nicht in `kubernetes:` auf Top-Level.

- **dnsmasq-Wildcard deckt neue Services automatisch ab**: `address=/homeserver/<ip>` in `dnsmasq.conf.j2` macht jeden `*.homeserver`-Namen direkt erreichbar ohne `dnsmasq_hosts`-Eintrag. Kein Update nötig für neue ArgoCD-Apps.

- **`kubectl patch configmap` als ArgoCD-Konfigurationsweg ohne Ansible**: Wenn Ansible lokal nicht installiert ist, direkt `kubectl -n argocd patch configmap argocd-cm` nutzen — idempotent, sofort wirksam, idempotenter Helm-Upgrade überschreibt beim nächsten `make argocd`.

- **Sealed Secrets Public Key via SSH fetchen für lokales kubeseal**: `kubectl -n sealed-secrets get secret -l sealedsecrets.bitnami.com/sealed-secrets-key=active -o jsonpath="{.items[0].data.tls\.crt}" | base64 -d > /tmp/sealed-secrets.crt` → `kubeseal --cert /tmp/sealed-secrets.crt` lokal nutzen ohne direkten Cluster-Zugriff via kubeconfig.

- **Grafana-Passwort via `existingSecret` stabilisieren**: Wenn `adminPassword` und `existingSecret` leer sind, generiert Helm bei jedem ArgoCD-Sync ein neues Zufalls-Passwort (`randAlphaNum`). Fix: `grafana-admin` SealedSecret im Monitoring-Namespace anlegen, `admin.existingSecret: grafana-admin` in values.yaml setzen. Danach `grafana-cli reset-admin-password` einmalig ausführen um DB und Secret zu synchronisieren.

- **selfh.st/icons GitHub API Tree für exakte Icon-Namen**: `curl -s "https://api.github.com/repos/selfhst/icons/git/trees/main?recursive=1"` listet alle SVG-Dateinamen auf. `argocd.svg` existiert nicht — korrekt ist `argo-cd.svg`. Kein Raten, keine 404-Überraschungen.

- **MetalLB TCP+UDP shared-IP via `metallb.io/allow-shared-ip`**: Wenn Pi-hole zwei getrennte LoadBalancer-Services (TCP + UDP) mit derselben IP deployt, verweigert MetalLB dem zweiten Service die IP ("can't change sharing key, address already in use"). Fix: beide Services (serviceDns + serviceDnsTCP) brauchen `metallb.io/allow-shared-ip: <gleicher-key>`. Ohne diese Annotation bleibt einer der Services `<pending>` und DNS funktioniert nur halb.

- **Tailscale Split DNS muss bei dnsmasq→Pi-hole-Migration aktualisiert werden**: Tailscale registriert `~homeserver` als Domain auf dem tailscale0-Interface. Diese Route ist spezifischer als das globale `~.` (Pi-hole). Wenn Tailscale noch den alten dnsmasq-Server referenziert, schlagen alle `*.homeserver`-Auflösungen fehl — auch lokal auf dem Home-Server. Tailscale-Konsole → DNS: `homeserver`-Nameserver auf `192.168.178.2` (Pi-hole) ändern.

- **Pi-hole adminSecret safe default: `enabled: false` mit leerem Cipher**: ArgoCD-Erstdeploy ohne committed SealedSecret — `adminSecret.enabled: false` lässt Pi-hole ohne Passwort starten (LAN-only Ingress akzeptabel). Passwort erst nach Deploy über kubeseal setzen, dann `enabled: true` + Cipher committen.

- **Homepage Hybrid-Theme: `::before`-Pseudo-Element statt box-shadow für Hover-Akzent**: CSS `::before` mit `scaleY(0) → scaleY(1)` Transition erzeugt den Teal-Balken links an der Karte. Eleganter als box-shadow-Overlay, funktioniert mit `overflow: hidden` auf `.service-card`. Hairline-Karten (`border-radius: 8px`, kein box-shadow im Ruhezustand) statt Material-Elevation.

- **Branch + PR + squash auch für triviale Ein-Datei-Änderungen**: CLAUDE.md verbietet Direktpush auf main ohne Ausnahme. Auto-mode-Classifier erzwingt das — .gitignore-Änderungen gehören ebenfalls auf einen Feature-Branch.

- **Homepage `color: teal` → `.bg-theme-800` muss im CSS explizit überschrieben werden**: Der homepage Tailwind-Wrapper hat die Klasse `bg-theme-50 dark:bg-theme-800`. Mit `color: teal` wird `bg-theme-800` zu `teal-800` = `rgb(17, 94, 89)` und liegt über dem `body`-Hintergrund. Fix: `.bg-theme-50, .bg-theme-800 { background-color: #080F0D !important; }` im custom.css. Ohne diesen Override ist jede Body-Hintergrundfarbe wirkungslos. Diagnose via `getComputedStyle()` im Browser.

- **`iconStyle: color` statt `theme` für farbige Original-Logos**: `iconStyle: theme` tönt alle Icons in die Theme-Farbe (teal). Design zeigt farbige Original-Logos (ArgoCD rot, Grafana orange, etc.) → `iconStyle: color` in settings.yaml.

- **Claude Design Bundle via `curl | gunzip | tar`**: Design-Handoff-Bundles von `api.anthropic.com/v1/design/h/<hash>` sind gzip-tar-Archive. Dekomprimieren: `curl -sL <url> | gunzip | tar -t` (auflisten), `tar -xO "<pfad>"` (einzelne Datei ausgeben). WebFetch/WebFetch scheitern am Binary-Content — direkt curl nutzen.

## Anti-Patterns

- **SANE net-Backend ausprobieren ohne Quellcode zu prüfen**: Stunden in Manager-Modus + saned investiert, obwohl scanbd im Quellcode `local_only=1` hartcodiert hat.

- **saned.socket deployen ohne inetd-Port-Belegung zu prüfen**: Ubuntus scanbd-Paket installiert `openbsd-inetd`, der bereits Port 6566 belegt.

- **Template-Divergenz und fehlende Deployed-File-Prüfung**: Bei unerwartetem Verhalten zuerst die deployte Datei auf dem Server lesen (`cat -n /path/to/script`), nicht nur das Template.

- **`{% raw %}...{% endraw %}` auf einer Zeile mit Jinja2 `trim_blocks`**: Ansible setzt `trim_blocks=True`. Das `\n` nach `{% endraw %}` wird gestrippt. Fix: `{% endraw %}` immer auf einer eigenen Zeile platzieren.

- **Scanner-Verhalten ohne Testdaten annehmen**: Mehrfach falsche Annahmen über die Reihenfolge und Anzahl der zu rotierenden Seiten. Korrekte Vorgehensweise: echten Testlauf durchführen und Ergebnis inspizieren.

- **pypdf /Rotate-Metadatum vs. pikepdf Content-Stream**: Zwei Iterationen verschwendet. Für PDFs die Paperless noch einmal verarbeitet: immer die Transformation in den Content-Stream einbacken.

- **Subagent-Output ohne Diff-Verifikation glauben**: Subagenten überschätzen ihren Fortschritt im Summary. Nach jedem Subagent-Lauf: `git diff` prüfen.

- **`'\n'` in YAML folded scalar `>-` als Newline annehmen**: Jinja2 sieht den Backslash literal. Lösung: `set_fact: nl: "\n"` (double-quoted YAML).

- **Bootstrap-Re-Runs ohne Test dazwischen**: Nach jedem Run einen echten End-to-End-Test, bevor weiter "repariert" wird.

- **`defaults/main.yml` editieren obwohl `all.yml` die Variable komplett überschreibt**: Vor dem Editieren von Role-defaults prüfen ob dieselbe Variable in `group_vars/`/`host_vars/` überschrieben wird.

- **Gitignored Secret-Datei + Semaphore-Frischklon**: Secrets die ein CI-Run braucht, müssen vault-verschlüsselt committet sein.

- **ArgoCD stuck auf alter Revision nicht früh erkannt**: Wenn `status.operationState.operation.sync.revision` ≠ `status.sync.revision`, synct ArgoCD noch die alte Revision. Lösung: `/operation` via `kubectl patch --type json -p '[{"op":"remove","path":"/operation"}]'` entfernen.

- **Placeholder-SealedSecrets ohne Guard committen**: `PLACEHOLDER_SEAL_WITH_KUBESEAL`-Werte in SealedSecrets erzeugen sofortigen `CreateContainerConfigError` — Pod kann nicht starten weil Secret nicht existiert. Zwei Strategien: (a) `helm template` rendert das SealedSecret erst wenn ein `enabled: true`-Guard gesetzt ist, oder (b) Placeholder committen und explizit dokumentieren dass `kubectl rollout restart` nach echtem Seal nötig ist. Wichtig: nach Seal-Commit immer `kubectl rollout restart deployment/<name> -n <ns>` ausführen.

- **Credential-Mindestlängen nicht in values.yaml dokumentieren**: MinIO verlangt rootUser ≥ 3 Zeichen und rootPassword ≥ 8 Zeichen. Generell: Mindestanforderungen direkt beim Seal-Kommentar dokumentieren.

- **ArgoCD ApplicationSet trackt nur `main` — kein Live-Testing auf Feature-Branch**: Wenn der Root ApplicationSet `revision: main` nutzt, erscheinen neue Apps erst nach dem Merge. Pod-Health-Verifikation während der Entwicklung auf Feature-Branch ist nicht möglich — diesen Schritt in den Post-Merge-Workflow verschieben.

- **Subagenten haben keinen SSH-/Netzwerk-Zugriff**: Subagenten können keine kubectl-, SSH- oder kubeseal-Befehle gegen den Home-Server ausführen. Server-Verifikation (Pod-Status, Secret-Check, ArgoCD-Sync) muss immer der Hauptagent übernehmen.

- **Kubeseal ohne `tr -d '\n'` → Trailing-Newline im Sealed-Wert**: Wenn `cut -d= -f2` oder SSH-Output direkt zu `kubeseal --raw --from-file=/dev/stdin` gepiped wird, enthält der Input ein abschließendes `\n`. Das Sealed-Wert entschlüsselt dann zu `<password>\n` statt `<password>` → Authentifizierung schlägt fehl. Immer `| tr -d '\n'` vor kubeseal einfügen.

- **Helm `randAlphaNum` + ArgoCD-Sync = instabiles Passwort**: Helm-Charts die `randAlphaNum` für Passwörter nutzen regenerieren bei jedem `helm upgrade` ein neues Zufalls-Passwort, wenn kein `existingSecret` referenziert wird. ArgoCD ruft `helm upgrade` bei jedem Sync auf. Betroffene Charts: Grafana (kube-prometheus-stack). Fix: immer `existingSecret` mit SealedSecret nutzen.

- **`GF_SECURITY_ADMIN_PASSWORD` aktualisiert bestehende Grafana-DB nicht**: Wenn der Admin-User bereits in `grafana.db` existiert, übernimmt ein Neustart mit geändertem `GF_SECURITY_ADMIN_PASSWORD` das neue Passwort NICHT in die DB. Explizit: `/usr/share/grafana/bin/grafana cli --homepath /usr/share/grafana admin reset-admin-password <pw>` ausführen um DB und Env-Var zu synchronisieren.

- **Grafana Brute-Force-Lock durch wiederholte falsche Passwörter**: Nach zu vielen fehlgeschlagenen Auth-Versuchen blockiert Grafana die IP des Requesters temporär (In-Memory-Block). Ein Pod-Restart oder `grafana-cli reset-admin-password` löscht den Counter. Symptom im Log: `"too many consecutive incorrect login attempts for user - login for user temporarily blocked"`.

- **Manuelles Editieren langer base64-Sealed-Werte → Typo-Risiko**: Beim manuellen Ersetzen von Sealed-Werten via Edit-Tool können einzelne Zeichen verloren gehen oder korrumpiert werden. SealedSecret-Status prüfen: `kubectl get sealedsecret -n <ns> -o jsonpath="{.status.conditions[0].message}"`. Besser: Write-Tool statt Edit für die gesamte Datei verwenden wenn mehrere Werte geändert werden.

- **ArgoCD ApplicationSet-Name nicht annehmen**: Der Name des Root ApplicationSet ist nicht zwingend `root-applicationset` — immer erst `kubectl get applicationset -n argocd` prüfen. Der falsche Name führt zu einem `NotFound`-Fehler beim Refresh-Trigger.

- **`pihole -c` (Chronometer) in Pi-hole v6 entfernt**: Der Chronometer-Befehl existiert in Pi-hole v6 nicht mehr. Stats nur über die REST API: POST `/api/auth` → SID → GET `/api/stats/summary` mit `sid`-Header.

- **Tailscale `~homeserver`-Domain nicht vor Host-DNS-Migration updaten**: Wenn Tailscale noch den alten dnsmasq als `homeserver`-Nameserver hat und `make host-dns` läuft, schlägt `resolvectl query *.homeserver` auf dem Host mit Timeout fehl — obwohl `dig @192.168.178.2` funktioniert. Ursache: Tailscale's `~homeserver` ist spezifischer als das globale `~.` von systemd-resolved. Reihenfolge: Tailscale Split DNS updaten, DANN `make host-dns`.

- **Screenshot-PNGs im Repo-Root akkumulieren lassen**: Temporäre Screenshots aus Playwright/Browser-Sessions landen ungetrackt im Root. `.gitignore`-Einträge für `*.png` (oder toolspezifische Verzeichnisse wie `.playwright-mcp/`) von Anfang an anlegen, nicht erst nach Akkumulation.

- **Direktpush auf main auch für triviale Änderungen versuchen**: CLAUDE.md verbietet Direktpush auf main ohne Ausnahme. Auch `.gitignore`-Einzeiler-Änderungen brauchen einen Feature-Branch + PR. Auto-mode-Classifier erzwingt das.

- **`body`-Hintergrund setzen reicht nicht wenn ein Tailwind-Wrapper darüber liegt**: Wenn ein Framework einen `fixed`/`absolute` Vollbild-Wrapper mit Theme-Farbe rendert, ist die `body`-CSS-Regel visuell wirkungslos. Diagnose: `document.querySelectorAll('div[class*="bg-"]')` + `getComputedStyle(el).backgroundColor` zeigt den tatsächlichen Übeltäter. Erst dann den richtigen Selektor überschreiben.

- **Design-Bundle-CSS als "fertig implementiert" deklarieren ohne Live-Screenshot-Vergleich**: Das Design-Bundle-CSS war funktional identisch zum bereits gemergten Stand — aber der homepage Tailwind-Wrapper wurde nicht berücksichtigt. Ein Live-Screenshot vor der Fertigmeldung hätte den Fehler sofort sichtbar gemacht.

## Was funktioniert

- **`SANE_DEBUG_SANEI_USB=1 scanimage -L` während scanbd läuft**: Zeigt sofort `LIBUSB_ERROR_BUSY`.

- **systemd Path Units für Inter-Service-Kommunikation**: `PathExists=<flag>` + oneshot service ist eine saubere Lösung für "Process A signalisiert Process B".

- **`trap restart_scanbd EXIT` im Trigger-Skript**: Stellt sicher, dass scanbd immer neu gestartet wird, auch wenn der Scan fehlschlägt.

- **Ansible blockinfile für inkrementelle Konfigurationsänderungen**: Sicherer als das gesamte Distro-File zu ersetzen; überlebt Paket-Upgrades besser.

- **`cat -n /deployed/script` bei Laufzeitfehlern**: Zeigt die deployte Datei mit Zeilennummern.

- **Nutzer-Screenshots als primäres Verifikationsmittel**: Bei visuellen PDF-Problemen zuverlässiger als programmatische Analyse.

- **`od -c | tail` für Byte-genaue String-Inspektion**: Wenn `\n` vs `\\n` der Unterschied ist.

- **Mini-Isolations-Playbook zum Bestätigen einer Jinja2/YAML-Hypothese**: Statt im großen Bootstrap-Lauf zu raten, in 10 Zeilen testen.

- **Subagenten parallel für unabhängige Domains**: Spart ~60% Zeit — vorausgesetzt Diff-Verifikation nach Rückkehr passiert.

- **Semaphore-API direkt für Verification**: Login → Task POST + Status-Polling. Schnelle Feedback-Loops ohne Browser.

- **CRD-Schema-Introspection für SSA-Fehler**: `kubectl get crd <name> -o jsonpath="{.spec.versions[0].schema.openAPIV3Schema.properties.spec.properties}"` zeigt deklarierte Felder sofort.

- **SealedSecret-Status über `.status.conditions[].message`**: `kubectl get sealedsecret -o json` zeigt "illegal base64 data at input byte N" für fehlerhafte Werte. Direkte Diagnose ohne Pod-Logs.

- **`kubectl -n argocd annotate application <name> argocd.argoproj.io/refresh=hard`**: Sofortiger ArgoCD-Sync ohne 3 Minuten warten — besonders nützlich direkt nach einem Push.

- **`kubectl rollout restart deployment/<name>` nach Secret-Erstellung**: Behebt `CreateContainerConfigError` sofort wenn das Secret nachträglich erstellt wurde — ArgoCD triggert kein automatisches Rollout bei Secret-Änderungen.

- **Sealed Secrets Public Key via SSH fetchen**: `kubectl -n sealed-secrets get secret -l sealedsecrets.bitnami.com/sealed-secrets-key=active -o jsonpath="{.items[0].data.tls\.crt}" | base64 -d` → `kubeseal --cert` lokal nutzen ohne kubeconfig gegen den Cluster.

- **Brainstorming → Research → Spec → Plan → Subagent-driven-development für GitOps-Deployments**: Der vollständige Workflow verhindert Annahmen-Fehler (dnsmasq-Wildcard, Chart-Struktur) die ohne Research falsch implementiert worden wären.

- **`helm show values <chart>` vor values.yaml schreiben**: Zeigt die tatsächliche Chart-Struktur. Bei jameswynn/homepage: settings/services/widgets liegen unter `homepage.config.*`, nicht direkt unter `homepage:` — ohne diesen Check wäre die Konfiguration lautlos ignoriert worden.

- **selfh.st/icons GitHub API Tree für exakte Icon-Namen**: `curl -s "https://api.github.com/repos/selfhst/icons/git/trees/main?recursive=1"` listet alle SVG-Dateinamen. Kein Raten ob `argocd.svg` oder `argo-cd.svg` — einfach suchen.

- **Dashboard Icons CDN als Icon-Fallback**: `https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/svg/<name>.svg` — deckt Apps ab die nicht auf selfh.st sind (opencode, actual-budget, firefly-iii).

- **Direktes CDN-URL als Icon-Fallback wenn Shorthand scheitert**: Wenn `semaphore-ui.svg` als Shorthand nicht aufgelöst wird, direkte URL `https://cdn.jsdelivr.net/gh/selfhst/icons/svg/semaphore-ui.svg` einsetzen — wird zuverlässig vom Browser geladen.

- **`/usr/share/grafana/bin/grafana cli admin reset-admin-password`**: Aktualisiert das DB-Passwort UND setzt den Brute-Force-Counter zurück — essenziell wenn sich Grafana-Credentials ändern und viele fehlgeschlagene Versuche stattgefunden haben.

- **`kubectl -n monitoring exec deploy/monitoring-grafana -- env | grep GF_SECURITY_ADMIN_PASSWORD`**: Zeigt das tatsächlich verwendete Admin-Passwort — zuverlässiger als das Kubernetes-Secret zu lesen, da das Secret (monitoring-grafana) und der Pod-Env-Var bei Helm-generierten Passwörtern auseinanderlaufen können.

- **`kubectl annotate applicationset <name> -n argocd argocd.argoproj.io/refresh=normal --overwrite`**: Erzwingt sofortigen ApplicationSet-Reconcile wenn ArgoCD neue App-Verzeichnisse aus einem frischen Merge noch nicht entdeckt hat — ohne 3 Minuten auf den nächsten Zyklus warten.

- **ApplicationSet-Controller-Logs für Git-Cache-Diagnose**: `kubectl logs -n argocd deploy/argocd-applicationset-controller --tail=30` zeigt `allPaths` — wenn neue App-Verzeichnisse fehlen, hat der Git-Cache noch den alten Stand. Refresh erzwingen statt warten.

- **Pi-hole v6 REST API für Stats**: `POST /api/auth {"password":"..."}` → SID → `GET /api/stats/summary` mit `sid`-Header. Liefert `queries.total`, `queries.blocked`, `queries.percent_blocked`, `clients.active`.

- **`dig @<ip> <name> +short` als Direkttest vor systemd-resolved-Diagnose**: Bevor in resolved-Konfiguration gesucht wird, `dig` direkt gegen den Ziel-DNS testen. Wenn dig funktioniert aber resolvectl nicht → Problem liegt in resolved's Routing-Logik (z.B. Tailscale `~domain`-Override), nicht in der DNS-Erreichbarkeit.

- **`yamllint -c .yamllint <einzelne-datei>` statt `make lint` für schnelle Verifikation**: Zeigt sofort ob die geänderte Datei sauber ist, ohne auf pre-existing Warnungen in anderen Dateien zu warten. Klar von `make lint` abzugrenzen (Gesamt-Check) vs. schnellem Einzel-Check.

- **Quick-WebSearch zur Recherche-Pflicht-Erfüllung bei vollständig spezifizierten Tasks**: Wenn der User eine vollständige Implementierungs-Spec liefert (exakter Dateiinhalt, Branch-Name, PR-Titel), reicht eine kurze Recherche zur Bestätigung stabiler API-Hooks — z.B. `gethomepage custom.css` um `#information-widgets`/`.service-card` als stabile Selektoren zu verifizieren.

- **Playwright `browser_evaluate` + `getComputedStyle` für DOM-Diagnose**: `document.querySelectorAll('div[class*="bg-"]')` + `getComputedStyle(el).backgroundColor` zeigt die tatsächlich gerenderten Farben aller bg-Elemente — nicht nur die CSS-Klassen. Ideal um Framework-Wrapper zu identifizieren die über dem body liegen. Schneller als SSH + wget in den Pod.

- **Playwright Screenshot-Vergleich als Verifikationsworkflow für visuelle Änderungen**: Vor dem Merge einen Screenshot nehmen, nach dem Merge + ArgoCD-Refresh + `rollout status` einen zweiten — direkter visueller Vergleich. `browser_navigate` → `browser_take_screenshot` → `Read` (PNG-Preview). Für CSS-Änderungen zuverlässiger als nur YAML-Lint.

- **`kubectl rollout status` nach `argocd annotate refresh=hard`**: Nach einem ArgoCD-Hard-Refresh muss der Deployment-Rollout abgewartet werden bevor ein Screenshot sinnvoll ist. Sequenz: annotate → sleep 15 → `rollout status --timeout=60s` → navigate → screenshot.
