# GETBETTER

_Letzte Aktualisierung: 2026-06-04_

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

- **jameswynn/homepage Helm Chart als Wrapper (Ansatz A)**: Upstream-Dependency statt plain Manifests oder Custom Chart — folgt dem headlamp-Muster, Renovate hält Version aktuell. Konfiguration unter `homepage.config.*` (settings, services, widgets, bookmarks) — nicht direkt unter `homepage:`.

- **dnsmasq-Wildcard deckt neue Services automatisch ab**: `address=/homeserver/<ip>` in `dnsmasq.conf.j2` macht jeden `*.homeserver`-Namen direkt erreichbar ohne `dnsmasq_hosts`-Eintrag. Kein Update nötig für neue ArgoCD-Apps.

- **`kubectl patch configmap` als ArgoCD-Konfigurationsweg ohne Ansible**: Wenn Ansible lokal nicht installiert ist, direkt `kubectl -n argocd patch configmap argocd-cm` nutzen — idempotent, sofort wirksam, idempotenter Helm-Upgrade überschreibt beim nächsten `make argocd`.

- **Sealed Secrets Public Key via SSH fetchen für lokales kubeseal**: `kubectl -n sealed-secrets get secret -l sealedsecrets.bitnami.com/sealed-secrets-key=active -o jsonpath="{.items[0].data.tls\.crt}" | base64 -d > /tmp/sealed-secrets.crt` → `kubeseal --cert /tmp/sealed-secrets.crt` lokal nutzen ohne direkten Cluster-Zugriff via kubeconfig.

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

- **SealedSecret-Status über `.status.conditions[].message`**: `kubectl get sealedsecret -o json` zeigt "illegal base64 data at input byte 7" für Placeholder-Werte. Direkte Diagnose ohne Pod-Logs.

- **`kubectl -n argocd annotate application <name> argocd.argoproj.io/refresh=hard`**: Sofortiger ArgoCD-Sync ohne 3 Minuten warten — besonders nützlich direkt nach einem Push.

- **`kubectl rollout restart deployment/<name>` nach Secret-Erstellung**: Behebt `CreateContainerConfigError` sofort wenn das Secret nachträglich erstellt wurde — ArgoCD triggert kein automatisches Rollout bei Secret-Änderungen.

- **Sealed Secrets Public Key via SSH fetchen**: `kubectl -n sealed-secrets get secret -l sealedsecrets.bitnami.com/sealed-secrets-key=active -o jsonpath="{.items[0].data.tls\.crt}" | base64 -d` → `kubeseal --cert` lokal nutzen ohne kubeconfig gegen den Cluster.

- **Brainstorming → Research → Spec → Plan → Subagent-driven-development für GitOps-Deployments**: Der vollständige Workflow verhindert Annahmen-Fehler (dnsmasq-Wildcard, Chart-Struktur) die ohne Research falsch implementiert worden wären.

- **`helm show values <chart>` vor values.yaml schreiben**: Zeigt die tatsächliche Chart-Struktur. Bei jameswynn/homepage: settings/services/widgets liegen unter `homepage.config.*`, nicht direkt unter `homepage:` — ohne diesen Check wäre die Konfiguration lautlos ignoriert worden.
