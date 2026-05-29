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

## Anti-Patterns

- **SANE net-Backend ausprobieren ohne Quellcode zu prüfen**: Stunden in Manager-Modus + saned investiert, obwohl scanbd im Quellcode `local_only=1` hartcodiert hat. Hätte zuerst das scanbd-Verhalten verstanden werden sollen (greife nach SANE_DEBUG-Logs, lies die Manpage/Source), bevor ein alternativer Architektur-Ansatz verfolgt wird.

- **saned.socket deployen ohne inetd-Port-Belegung zu prüfen**: Ubuntus scanbd-Paket installiert `openbsd-inetd`, der bereits Port 6566 belegt. Das `ss -tlnp | grep 6566` vor dem Deploy hätte den Konflikt sofort sichtbar gemacht.

- **Diagnose-Reihenfolge**: Die libusb-Busy-Ursache hätte früher mit `SANE_DEBUG_SANEI_USB=1 scanimage ...` (während scanbd läuft) identifiziert werden können, statt zuerst Konfigurationen zu verändern.

- **Template-Divergenz und fehlende Deployed-File-Prüfung**: `scanbd-dll.conf.j2` wurde auf `net` geändert während der Server manuell auf `fujitsu` zurückgesetzt wurde — template und Live-Config liefen auseinander. Allgemeiner: Bei unerwartetem Verhalten zuerst die deployte Datei auf dem Server lesen (`cat -n /path/to/script`), nicht nur das Template.

- **`{% raw %}...{% endraw %}` auf einer Zeile mit Jinja2 `trim_blocks`**: Ansible setzt `trim_blocks=True`. Das `\n` nach `{% endraw %}` wird gestrippt. Fix: `{% endraw %}` immer auf einer eigenen Zeile platzieren, sodass das `\n` innerhalb des Raw-Blocks erhalten bleibt.

- **Scanner-Verhalten ohne Testdaten annehmen**: Mehrfach falsche Annahmen über die Reihenfolge (front-first vs. back-first) und die Anzahl der zu rotierenden Seiten (nur Rückseiten vs. alle). Korrekte Vorgehensweise: Einen echten Testlauf durchführen und das Ergebnis inspizieren, bevor der Fix implementiert wird. Die Nutzer-Screenshots waren am Ende zuverlässiger als jede Annahme.

- **pypdf /Rotate-Metadatum vs. pikepdf Content-Stream**: Zwei Iterationen verschwendet weil pypdf's `page.rotate()` nur `/Rotate` setzt, OCRmyPDF das aber beim Re-Import ignoriert. Für PDFs die Paperless noch einmal verarbeitet: immer die Transformation in den Content-Stream einbacken, nicht nur Metadaten setzen.

- **pypdf `extract_text()` zur Orientierungs-Erkennung**: OCRmyPDF bettet OCR-Text in einer separaten Form-XObject-Schicht ein, die unabhängig vom Bild-Pixel-Inhalt orientiert sein kann. Text-Extraktion via pypdf zeigt "lesbaren" Text auf einer visuell auf dem Kopf stehenden Seite — kein verlässliches Signal für die Bild-Orientierung.

- **Subagent-Output ohne Diff-Verifikation glauben**: 4 parallele Subagenten für 9 Issues dispatched, alle haben "fertig" gemeldet — `git diff --stat` zeigte aber dass mehrere Agents nur 1 von 4 Edits gemacht hatten. Subagenten überschätzen ihren Fortschritt im Summary. Nach jedem Subagent-Lauf: `git diff` prüfen ob die behaupteten Änderungen wirklich drin sind, sonst manuell vervollständigen.

- **`no_log: true` ohne `register` + Folge-Assertion**: Versteckt silent failures. In `key.yml` PUTs lief der HTTP-Call erfolgreich durch (204), aber der Body war wegen `'\n'`-Bug korrupt — niemand hat es gemerkt weil der Output suppressed war. Wenn `no_log: true` nötig ist: zusätzlich `register: result` + Folge-Task mit `assert/fail_when`-Logik die nur boolean-Signale prüft.

- **`'\n'` in YAML folded scalar `>-` als Newline annehmen**: Jinja2 sieht den Backslash literal weil YAML im folded scalar keine Escapes verarbeitet. Ergebnis ist ein 2-Char-String. Beweis via `cat file | od -c | tail`. Lösung: `set_fact: nl: "\n"` (double-quoted YAML) und im Folded-Body via Variable referenzieren.

- **Self-Reboot in Playbooks die aus dem Pod heraus laufen**: Wenn der Ansible-Controller selbst auf dem Target läuft (Semaphore-Pod im k3s-Cluster), bricht der Reboot die laufende Task ab, der Task hängt für immer, Pod restarts. Vor jedem `reboot`-Task: prüfen ob der Controller außerhalb des Targets läuft.

- **Bootstrap-Re-Runs ohne Test dazwischen**: Mehrfach hintereinander `make semaphore-bootstrap` ausgeführt in der Hoffnung dass der nächste Run hilft — der Bootstrap selbst hat den Key dabei jedes Mal wieder kaputt gemacht (gleicher `'\n'`-Bug). Vorgehen: nach jedem Run einen echten End-to-End-Test (Template starten, ersten Output-Step prüfen), bevor weiter "repariert" wird.

## Was funktioniert

- **`SANE_DEBUG_SANEI_USB=1 scanimage -L` während scanbd läuft**: Zeigt sofort `LIBUSB_ERROR_BUSY` und identifiziert den USB-Exklusiv-Anspruch als Root Cause — kein Raten nötig.

- **Manueller Stop-Test**: `systemctl stop scanbd && scan_to_pdf.sh` — wenn es danach klappt, ist USB-Exklusivität die Ursache. Einfacher, schneller Proof-of-Concept vor der Implementierung.

- **systemd Path Units für Inter-Service-Kommunikation**: `PathExists=<flag>` + oneshot service ist eine saubere, wartbare Lösung für "Process A signalisiert Process B" ohne Pipes, Sockets oder Race Conditions.

- **`trap restart_scanbd EXIT` im Trigger-Skript**: Stellt sicher, dass scanbd immer neu gestartet wird, auch wenn der Scan fehlschlägt — verhindert dauerhaft toten Scanner.

- **Ansible blockinfile für inkrementelle Konfigurationsänderungen** (z.B. ImageMagick policy.xml): Sicherer als das gesamte Distro-File zu ersetzen; überlebt Paket-Upgrades besser.

- **`cat -n /deployed/script` bei Laufzeitfehlern**: Zeigt die deployte Datei mit Zeilennummern — unverzichtbar wenn der Fehler eine Zeilennummer nennt. Direkt zur Fehlerzeile springen statt im Template zu suchen.

- **`bash -n script` nach manuellem Server-Patch**: Schnelle Syntax-Verifikation vor dem nächsten Testlauf.

- **pikepdf Content-Stream-Inspektion zur Ursachen-Diagnose**: `page.get("/Contents").read_bytes()` zeigt die CTM-Matrix (`612 0 0 792 0 0 cm`) und OCR-Layer-Referenzen direkt — unverzichtbar um zu verstehen warum `/Rotate` allein nicht ausreicht.

- **Nutzer-Screenshots als primäres Verifikationsmittel**: Bei visuellen PDF-Problemen sind Screenshots aus dem echten Viewer (Paperless) zuverlässiger als jede programmatische Analyse (text extraction, metadata). Screenshot anfordern statt auf Code-Analyse vertrauen.

- **`od -c | tail` für Byte-genaue String-Inspektion**: Wenn `\n` vs `\\n` (Newline vs literal Backslash-n) der Unterschied ist: `cat file | od -c | tail` zeigt die echten ASCII-Bytes — Python-`repr` oder JSON-Pretty-Print verschleiern die Differenz.

- **Mini-Isolations-Playbook zum Bestätigen einer Jinja2/YAML-Hypothese**: Statt im großen Bootstrap-Lauf zu raten, in 10 Zeilen testen: `>-` vs `"..."` Scalar mit `'\n'` und `copy: content:` zum Output-Capture. Hypothese in 30 Sekunden bewiesen statt 10 Min Bootstrap-Iterationen.

- **Manuelle API-Calls (Python urllib) als Vergleichsbasis**: Wenn die Ansible `uri`-Task fehlschlägt und alle Felder korrekt aussehen: identisches PUT mit Python testen. Funktioniert es manuell aber Ansible nicht, ist es ein Ansible-Body-Serialisierungs-Bug — sofort eingrenzen statt im URI-Modul zu raten.

- **`/proc/$PID/environ` für Live-Inspektion von Subprocess-Env**: Wenn unklar ist welche Env-Vars ein laufender Prozess hat (z.B. Semaphore-spawned ansible-playbook): `xargs -0 -n1 -a /proc/PID/environ` listet alles auf. Damit war in 1 Minute klar dass Semaphore die Pod-Env strippt.

- **Subagenten parallel für unabhängige Domains**: 9 GitHub-Issues in 4 Domain-Cluster aufgeteilt (Docs / Bootstrap-Role / Guards / Infra) und parallel dispatched. Spart ~60% Zeit gegenüber sequenziell — **vorausgesetzt** die Diff-Verifikation nach Rückkehr passiert (siehe Anti-Pattern).

- **`VAULT_OPTS="--vault-password-file=.vault"`**: Non-interaktive `make`-Targets sind essentiell für Self-Testing innerhalb der Session. `.vault` wird via `*.vault` in `.gitignore` automatisch ausgeschlossen — kein Risiko für versehentliche Commits.

- **Semaphore-API direkt für Verification**: Login via `/api/auth/login`, dann `/api/project/N/tasks` POST + Status-Polling. Ermöglicht End-to-End-Tests ohne Browser, schnelle Feedback-Loops für Bootstrap-Iterationen.
