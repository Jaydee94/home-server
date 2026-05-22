# GETBETTER

_Letzte Aktualisierung: 2026-05-22_

## Entscheidungen

- **scanbd direkt-Modus + systemd-Path-Unit-Entkopplung statt Manager-Modus**: scanbd im direct mode erkennt den Hardware-Button zuverlässig. Der USB-Exklusiv-Anspruch wird gelöst, indem scan_button.sh nur eine Flag-Datei setzt; ein unabhängiger systemd-Dienst (scanner-trigger.service) stoppt scanbd, scannt, startet scanbd neu. Alternativen (saned/net-Backend, Manager-Modus) wurden verworfen, weil scanbd `local_only=1` in `sane_get_devices()` hartcodiert hat → net-Backend gibt immer leere Geräteliste zurück.

- **`/var/tmp/scanner/scan-pending` als Trigger-Flag**: Im `ReadWritePaths` des scanbd.service enthalten, erreichbar für den saned-User via scanner-Gruppe. Besser als `/run/scanner/...` (wäre nach Reboot leer) oder `/tmp/...` (unsicherer Shared Namespace).

- **`runuser -u saned -- env SANE_CONFIG_DIR=/etc/sane.d script`**: Explizites Setzen von SANE_CONFIG_DIR beim Ausführen als saned-User, damit `/etc/sane.d/dll.conf` (= fujitsu) genutzt wird, nicht `/etc/scanbd/dll.conf`.

## Anti-Patterns

- **SANE net-Backend ausprobieren ohne Quellcode zu prüfen**: Stunden in Manager-Modus + saned investiert, obwohl scanbd im Quellcode `local_only=1` hartcodiert hat. Hätte zuerst das scanbd-Verhalten verstanden werden sollen (greife nach SANE_DEBUG-Logs, lies die Manpage/Source), bevor ein alternativer Architektur-Ansatz verfolgt wird.

- **saned.socket deployen ohne inetd-Port-Belegung zu prüfen**: Ubuntus scanbd-Paket installiert `openbsd-inetd`, der bereits Port 6566 belegt. Das `ss -tlnp | grep 6566` vor dem Deploy hätte den Konflikt sofort sichtbar gemacht.

- **Diagnose-Reihenfolge**: Die libusb-Busy-Ursache hätte früher mit `SANE_DEBUG_SANEI_USB=1 scanimage ...` (während scanbd läuft) identifiziert werden können, statt zuerst Konfigurationen zu verändern.

- **Template-Divergenz und fehlende Deployed-File-Prüfung**: `scanbd-dll.conf.j2` wurde auf `net` geändert während der Server manuell auf `fujitsu` zurückgesetzt wurde — template und Live-Config liefen auseinander. Allgemeiner: Bei unerwartetem Verhalten (z.B. "scan klappt, PDF kommt nicht an") zuerst die deployte Datei auf dem Server lesen (`cat -n /path/to/script`), nicht nur das Template. Jinja2-Rendering kann edge cases haben, die Template und Deployment auseinandertreiben.

- **`{% raw %}...{% endraw %}` auf einer Zeile mit Jinja2 `trim_blocks`**: Ansible setzt `trim_blocks=True`. Das `\n` nach `{% endraw %}` wird gestrippt — die folgende Zeile klebt direkt an den Raw-Inhalt. `page_count=${#pages[@]}{% endraw %}\nif [...]` wird zu `page_count=${#pages[@]}if [...]` → Bash-Syntax-Fehler. Fix: `{% endraw %}` immer auf einer eigenen Zeile platzieren, sodass das `\n` innerhalb des Raw-Blocks erhalten bleibt.

## Was funktioniert

- **`SANE_DEBUG_SANEI_USB=1 scanimage -L` während scanbd läuft**: Zeigt sofort `LIBUSB_ERROR_BUSY` und identifiziert den USB-Exklusiv-Anspruch als Root Cause — kein Raten nötig.

- **Manueller Stop-Test**: `systemctl stop scanbd && scan_to_pdf.sh` — wenn es danach klappt, ist USB-Exklusivität die Ursache. Einfacher, schneller Proof-of-Concept vor der Implementierung.

- **systemd Path Units für Inter-Service-Kommunikation**: `PathExists=<flag>` + oneshot service ist eine saubere, wartbare Lösung für "Process A signalisiert Process B" ohne Pipes, Sockets oder Race Conditions.

- **`trap restart_scanbd EXIT` im Trigger-Skript**: Stellt sicher, dass scanbd immer neu gestartet wird, auch wenn der Scan fehlschlägt — verhindert dauerhaft toten Scanner.

- **Ansible blockinfile für inkrementelle Konfigurationsänderungen** (z.B. ImageMagick policy.xml): Sicherer als das gesamte Distro-File zu ersetzen; überlebt Paket-Upgrades besser.

- **`cat -n /deployed/script` bei Laufzeitfehlern**: Zeigt die deployte Datei mit Zeilennummern — unverzichtbar wenn der Fehler eine Zeilennummer nennt (`line 87: syntax error`). Direkt zur Fehlerzeile springen statt im Template zu suchen.

- **`bash -n script` nach manuellem Server-Patch**: Schnelle Syntax-Verifikation vor dem nächsten Testlauf. Schlägt fehl wenn Bash die Datei nicht parsen kann, ohne sie auszuführen.

- **`sed -i` für Notfall-Patch auf dem Server**: Wenn ein Template-Fehler gefunden wird und `make <role>` Zeit kostet, kann die deployte Datei direkt gepatcht werden — sofortiges Testen möglich. Template-Fix danach committen; nie als dauerhaft betrachten.
