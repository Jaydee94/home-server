# GETBETTER

_Letzte Aktualisierung: 2026-05-29_

## Entscheidungen

- **scanbd direkt-Modus + systemd-Path-Unit-Entkopplung statt Manager-Modus**: scanbd im direct mode erkennt den Hardware-Button zuverlässig. Der USB-Exklusiv-Anspruch wird gelöst, indem scan_button.sh nur eine Flag-Datei setzt; ein unabhängiger systemd-Dienst (scanner-trigger.service) stoppt scanbd, scannt, startet scanbd neu. Alternativen (saned/net-Backend, Manager-Modus) wurden verworfen, weil scanbd `local_only=1` in `sane_get_devices()` hartcodiert hat → net-Backend gibt immer leere Geräteliste zurück.

- **`/var/tmp/scanner/scan-pending` als Trigger-Flag**: Im `ReadWritePaths` des scanbd.service enthalten, erreichbar für den saned-User via scanner-Gruppe. Besser als `/run/scanner/...` (wäre nach Reboot leer) oder `/tmp/...` (unsicherer Shared Namespace).

- **`runuser -u saned -- env SANE_CONFIG_DIR=/etc/sane.d script`**: Explizites Setzen von SANE_CONFIG_DIR beim Ausführen als saned-User, damit `/etc/sane.d/dll.conf` (= fujitsu) genutzt wird, nicht `/etc/scanbd/dll.conf`.

- **ADF Duplex: alle Seiten rotieren + Paare tauschen**: Der Fujitsu ADF scannt Rückseite zuerst UND beide Seiten 180° gedreht. Fix im scan_to_pdf.sh: erst alle TIFFs mit `mogrify -rotate 180` drehen, dann Paare tauschen (`[back_rot, front_rot]` → `[front_rot, back_rot]`). Konfigurierbar via `scanner_duplex_rotate_back_pages` und `scanner_duplex_back_first`. Verifiziert durch iteratives Nutzer-Feedback.

- **PDF-Rotation für Paperless via pikepdf Content-Stream, nicht /Rotate-Metadatum**: OCRmyPDF ignoriert beim Re-Processing das `/Rotate`-Metadatum zuverlässig. Rotation muss physisch in den Content-Stream eingebacken werden: `q\n-612 0 0 -792 612 792 cm\n/Im0 Do\nQ`. Zusätzlich OCR-XObjects (`/OCR-...`) aus `/Resources` entfernen, damit Paperless die Seite neu OCR'd.

- **Semaphore-Environment statt deprecated `vault_key_id`**: Semaphore v2.18+ ignoriert `vault_key_id` im Template-Body und strippt zudem die Pod-Container-Env beim Task-Spawn. Lösung: per Projekt eine "default-env" Environment via API anlegen die `ANSIBLE_VAULT_PASSWORD_FILE` setzt, dann an jedes Template via `environment_id` koppeln. Im `semaphore_bootstrap` Role separat als `environment.yml` (idempotent POST/PUT) modelliert; `defaults/main.yml` definiert `semaphore_default_environment` zentral und beide Projekte referenzieren ihn.

- **`+ semaphore_pem_newline` statt `+ '\n'` in Jinja2-Bodies**: PEM-Schlüssel werden in `key.yml` via API geschrieben. In einem YAML folded scalar `>-` wird `'\n'` als literaler 2-Char-String an Jinja2 weitergereicht — `to_json` serialisiert ihn dann als `\\n`, Semaphore speichert den Key kaputt, Go's `ssh.ParsePrivateKey` rejected ihn. Lösung: `semaphore_pem_newline: "\n"` in `login.yml` als `set_fact` (double-quoted YAML → echtes LF) und im Body via Variable referenzieren.

- **Reboot-Skip via `lookup('env', 'SEMAPHORE_TASK_ID')`**: `common`-Role darf den Host nicht rebooten wenn das Playbook aus dem Semaphore-Pod heraus läuft — der Pod selbst läuft auf dem Host und würde sich selbst killen, der Task hängt für immer. Skip-Bedingung in der Reboot-Task, dazu eine Warn-Task die den Operator informiert manuell neu zu starten.

- **`SEMAPHORE_SCHEDULE_TIMEZONE=Europe/Berlin` im Deployment statt UTC-Cron**: Semaphore evaluiert Cron-Schedules per Default in UTC. Ein `0 6 * * *` in UTC würde zwischen CET/CEST um eine Stunde verrutschen. Die TZ-Env im Pod (via Helm-`values`, default `Europe/Berlin`) lässt `0 6 * * *` ganzjährig um 06:00 Lokalzeit feuern — DST-sicher, ohne den Cron-String anzufassen.

- **Schedules deklarativ im `semaphore_bootstrap`-Role**: Neue `schedule.yml` (idempotent: GET-list → POST-if-missing → PUT-self-heal, gleiches Jinja-Dict-Body-Muster wie `template.yml` für Integer-Typen); `project.yml` baut eine Template-Name→ID-Map nach dem Template-Loop. So sind Cron-Schedules reproduzierbar (überleben Neuaufsetzen) statt nur per API-Klick zu existieren.

- **Laufende Secret-Werte auslesen statt neu erfinden**: Für `vault_paperless_*` die echten Werte aus der bereits deployten NAS-`.env` gelesen (become-PW aus committed `all.yml` via `.vault` entschlüsselt, dann `sudo -S cat`), nicht neu generiert. Ein neues DB-Passwort hätte die bestehende PostgreSQL-DB unzugänglich gemacht. Nur den `secret_key` (war nie in der `.env`) neu generiert — der invalidiert lediglich Login-Sessions, keine Daten.

- **`CronWorkflow.spec.schedules` (Array) in Argo Workflows v4.x**: `spec.schedule` (String) wurde in v4.x aus dem CRD-Schema entfernt. Ersatz: `spec.schedules: ["0 3 * * *"]`. Da ArgoCD `ServerSideApply=true` nutzt, lehnt der API-Server undeklararierte Felder direkt ab — kein Retry hilft, nur der Schema-konforme Fix.

## Anti-Patterns

- **SANE net-Backend ausprobieren ohne Quellcode zu prüfen**: Stunden in Manager-Modus + saned investiert, obwohl scanbd im Quellcode `local_only=1` hartcodiert hat. Hätte zuerst das scanbd-Verhalten verstanden werden sollen (greife nach SANE_DEBUG-Logs, lies die Manpage/Source), bevor ein alternativer Architektur-Ansatz verfolgt wird.

- **saned.socket deployen ohne inetd-Port-Belegung zu prüfen**: Ubuntus scanbd-Paket installiert `openbsd-inetd`, der bereits Port 6566 belegt. Das `ss -tlnp | grep 6566` vor dem Deploy hätte den Konflikt sofort sichtbar gemacht.

- **Diagnose-Reihenfolge**: Die libusb-Busy-Ursache hätte früher mit `SANE_DEBUG_SANEI_USB=1 scanimage ...` (während scanbd läuft) identifiziert werden können, statt zuerst Konfigurationen zu verändern.

- **Template-Divergenz und fehlende Deployed-File-Prüfung**: `scanbd-dll.conf.j2` wurde auf `net` geändert während der Server manuell auf `fujitsu` zurückgesetzt wurde — template und Live-Config liefen auseinander. Allgemeiner: Bei unerwartetem Verhalten zuerst die deployte Datei auf dem Server lesen (`cat -n /path/to/script`), nicht nur das Template.

- **`{% raw %}...{% endraw %}` auf einer Zeile mit Jinja2 `trim_blocks`**: Ansible setzt `trim_blocks=True`. Das `\n` nach `{% endraw %}` wird gestrippt. Fix: `{% endraw %}` immer auf einer eigenen Zeile platzieren, sodass das `\n` innerhalb des Raw-Blocks erhalten bleibt.

- **Scanner-Verhalten ohne Testdaten annehmen**: Mehrfach falsche Annahmen über die Reihenfolge (front-first vs. back-first) und die Anzahl der zu rotierenden Seiten (nur Rückseiten vs. alle). Korrekte Vorgehensweise: Einen echten Testlauf durchführen und das Ergebnis inspizieren, bevor der Fix implementiert wird.

- **pypdf /Rotate-Metadatum vs. pikepdf Content-Stream**: Zwei Iterationen verschwendet weil pypdf's `page.rotate()` nur `/Rotate` setzt, OCRmyPDF das aber beim Re-Import ignoriert. Für PDFs die Paperless noch einmal verarbeitet: immer die Transformation in den Content-Stream einbacken.

- **pypdf `extract_text()` zur Orientierungs-Erkennung**: OCRmyPDF bettet OCR-Text in einer separaten Form-XObject-Schicht ein — Text-Extraktion zeigt "lesbaren" Text auf einer visuell auf dem Kopf stehenden Seite. Kein verlässliches Signal für Bild-Orientierung.

- **Subagent-Output ohne Diff-Verifikation glauben**: Subagenten überschätzen ihren Fortschritt im Summary. Nach jedem Subagent-Lauf: `git diff` prüfen ob die behaupteten Änderungen wirklich drin sind, sonst manuell vervollständigen.

- **`no_log: true` ohne `register` + Folge-Assertion**: Versteckt silent failures. Wenn `no_log: true` nötig ist: zusätzlich `register: result` + Folge-Task mit `assert/fail_when`-Logik die nur boolean-Signale prüft.

- **`'\n'` in YAML folded scalar `>-` als Newline annehmen**: Jinja2 sieht den Backslash literal weil YAML im folded scalar keine Escapes verarbeitet. Ergebnis ist ein 2-Char-String. Lösung: `set_fact: nl: "\n"` (double-quoted YAML) und im Folded-Body via Variable referenzieren.

- **Self-Reboot in Playbooks die aus dem Pod heraus laufen**: Wenn der Ansible-Controller selbst auf dem Target läuft, bricht der Reboot die laufende Task ab. Vor jedem `reboot`-Task: prüfen ob der Controller außerhalb des Targets läuft.

- **Bootstrap-Re-Runs ohne Test dazwischen**: Mehrfach hintereinander `make semaphore-bootstrap` ausgeführt in der Hoffnung dass der nächste Run hilft — der Bootstrap selbst hat den Key dabei jedes Mal wieder kaputt gemacht. Vorgehen: nach jedem Run einen echten End-to-End-Test, bevor weiter "repariert" wird.

- **`defaults/main.yml` editieren obwohl `all.yml` die Variable komplett überschreibt**: `schedules:` in den `semaphore_bootstrap`-defaults ergänzt — der Schedule-Loop blieb beim Bootstrap aber `skipping`, weil `semaphore_projects` in `group_vars/all.yml` definiert ist und die defaults **als Ganzes** ersetzt. Vor dem Editieren von Role-defaults prüfen ob dieselbe Variable in `group_vars/`/`host_vars/` überschrieben wird.

- **Gitignored Secret-Datei + Semaphore-Frischklon**: `host_vars/ugreen-nas/vault.yml` war via `.gitignore` ausgeschlossen. `make nas` lief damit, aber der Semaphore-Run klont das Repo frisch → `vault_paperless_*` fehlten. Secrets die ein CI-Run braucht, müssen vault-verschlüsselt committet sein.

- **Privates ghcr-Image ohne `docker login` + fine-grained PAT**: Für private Registry-Pulls in Ansible: explizite `community.docker.docker_login`-Task **und** klassischer PAT mit `read:packages` (kein fine-grained PAT).

- **ArgoCD stuck auf alter Revision nicht früh erkannt**: Wenn `status.operationState.operation.sync.revision` ≠ `status.sync.revision`, synct ArgoCD noch die alte Revision — auch nach Hard-Refresh. Lösung: `/operation` via `kubectl patch --type json -p '[{"op":"remove","path":"/operation"}]'` entfernen, dann neuen Sync mit korrekter Revision patchen. Signal: `status.sync.status: OutOfSync` mit neuer Revision = ArgoCD kennt den neuen Commit, hat aber noch keine neue Operation gestartet.

- **Placeholder-SealedSecrets ohne `enabled: false` committen**: `REPLACE_ME_SEALED_*`-Werte in values.yaml erzeugen sofort kaputte SealedSecrets im Cluster (`illegal base64 data at input byte 7`). Besser: Placeholder-Blöcke mit `enabled: false` guarden oder ein prominenter Kommentar mit `MUST BE REPLACED BEFORE DEPLOYING`.

- **Credential-Mindestlängen nicht in values.yaml dokumentiert**: MinIO verlangt rootUser ≥ 3 Zeichen und rootPassword ≥ 8 Zeichen. Fehlte als Hinweis im Kommentar → zweiter Seal-Durchgang nötig. Generell: Mindestanforderungen an Credentials direkt beim Seal-Kommentar dokumentieren.

## Was funktioniert

- **`SANE_DEBUG_SANEI_USB=1 scanimage -L` während scanbd läuft**: Zeigt sofort `LIBUSB_ERROR_BUSY` — kein Raten nötig.

- **Manueller Stop-Test**: `systemctl stop scanbd && scan_to_pdf.sh` — wenn es danach klappt, ist USB-Exklusivität die Ursache.

- **systemd Path Units für Inter-Service-Kommunikation**: `PathExists=<flag>` + oneshot service ist eine saubere Lösung für "Process A signalisiert Process B".

- **`trap restart_scanbd EXIT` im Trigger-Skript**: Stellt sicher, dass scanbd immer neu gestartet wird, auch wenn der Scan fehlschlägt.

- **Ansible blockinfile für inkrementelle Konfigurationsänderungen**: Sicherer als das gesamte Distro-File zu ersetzen; überlebt Paket-Upgrades besser.

- **`cat -n /deployed/script` bei Laufzeitfehlern**: Zeigt die deployte Datei mit Zeilennummern — direkt zur Fehlerzeile springen.

- **`bash -n script` nach manuellem Server-Patch**: Schnelle Syntax-Verifikation vor dem nächsten Testlauf.

- **pikepdf Content-Stream-Inspektion zur Ursachen-Diagnose**: `page.get("/Contents").read_bytes()` zeigt CTM-Matrix und OCR-Layer-Referenzen direkt.

- **Nutzer-Screenshots als primäres Verifikationsmittel**: Bei visuellen PDF-Problemen zuverlässiger als programmatische Analyse.

- **`od -c | tail` für Byte-genaue String-Inspektion**: Wenn `\n` vs `\\n` der Unterschied ist — zeigt die echten ASCII-Bytes.

- **Mini-Isolations-Playbook zum Bestätigen einer Jinja2/YAML-Hypothese**: Statt im großen Bootstrap-Lauf zu raten, in 10 Zeilen testen. Hypothese in 30 Sekunden bewiesen.

- **Manuelle API-Calls (Python urllib) als Vergleichsbasis**: Wenn die Ansible `uri`-Task fehlschlägt und alles korrekt aussieht: identisches PUT mit Python testen. Funktioniert manuell aber nicht Ansible → Ansible-Body-Serialisierungs-Bug.

- **`/proc/$PID/environ` für Live-Inspektion von Subprocess-Env**: `xargs -0 -n1 -a /proc/PID/environ` listet die Env-Vars eines laufenden Prozesses auf.

- **Subagenten parallel für unabhängige Domains**: Spart ~60% Zeit — **vorausgesetzt** Diff-Verifikation nach Rückkehr passiert.

- **`VAULT_OPTS="--vault-password-file=.vault"`**: Non-interaktive `make`-Targets essentiell für Self-Testing. `.vault` via `.gitignore` automatisch ausgeschlossen.

- **Semaphore-API direkt für Verification**: Login → Task POST + Status-Polling. Schnelle Feedback-Loops ohne Browser.

- **Iteratives Semaphore-Testen deckt gestapelte Hürden auf**: triggern → pollen → bei `error` Output tailen → Root Cause fixen → erneut. `PLAY RECAP` zeigt sofort wie weit der Run kam.

- **Externe Credentials vor dem Fix validieren**: Erst den Token gegen die Registry testen bevor eine Login-Task gebaut wird. 403 + leerer Bearer beweist sofort dass der Token das Problem ist.

- **Secret-Werte beschaffen + verschlüsseln ohne Klartext-Leak**: Wert aus Quelle lesen und direkt in `ansible-vault encrypt_string --stdin-name NAME` pipen — nur der `!vault`-Block landet im Output.

- **CRD-Schema-Introspection für SSA-Fehler**: `kubectl get crd <name> -o jsonpath="{.spec.versions[0].schema.openAPIV3Schema.properties.spec.properties}"` zeigt deklarierte Felder sofort — schneller als Doku-Suche. Besonders hilfreich wenn ServerSideApply "field not declared in schema" wirft.

- **SealedSecret-Status über `.status.conditions[].message`**: `kubectl get sealedsecret -o json` + `.status.conditions[].message` zeigt "illegal base64 data at input byte 7" für Placeholder-Werte. Direkte Diagnose ohne Pod-Logs.

- **Pod-Logs als erste Anlaufstelle bei Credential-Fehlern**: MinIO's `FATAL Unable to validate credentials ... HINT: MINIO_ROOT_USER length should be at least 3` war sofort aus `kubectl logs` lesbar — kein Raten über die Fehlerursache nötig.
