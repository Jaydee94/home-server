# GETBETTER

_Letzte Aktualisierung: 2026-05-22_

## Entscheidungen

- **scanbd direkt-Modus + systemd-Path-Unit-Entkopplung statt Manager-Modus**: scanbd im direct mode erkennt den Hardware-Button zuverlässig. Der USB-Exklusiv-Anspruch wird gelöst, indem scan_button.sh nur eine Flag-Datei setzt; ein unabhängiger systemd-Dienst (scanner-trigger.service) stoppt scanbd, scannt, startet scanbd neu. Alternativen (saned/net-Backend, Manager-Modus) wurden verworfen, weil scanbd `local_only=1` in `sane_get_devices()` hartcodiert hat → net-Backend gibt immer leere Geräteliste zurück.

- **`/var/tmp/scanner/scan-pending` als Trigger-Flag**: Im `ReadWritePaths` des scanbd.service enthalten, erreichbar für den saned-User via scanner-Gruppe. Besser als `/run/scanner/...` (wäre nach Reboot leer) oder `/tmp/...` (unsicherer Shared Namespace).

- **`runuser -u saned -- env SANE_CONFIG_DIR=/etc/sane.d script`**: Explizites Setzen von SANE_CONFIG_DIR beim Ausführen als saned-User, damit `/etc/sane.d/dll.conf` (= fujitsu) genutzt wird, nicht `/etc/scanbd/dll.conf`.

- **ADF Duplex: alle Seiten rotieren + Paare tauschen**: Der Fujitsu ADF scannt Rückseite zuerst UND beide Seiten 180° gedreht. Fix im scan_to_pdf.sh: erst alle TIFFs mit `mogrify -rotate 180` drehen, dann Paare tauschen (`[back_rot, front_rot]` → `[front_rot, back_rot]`). Konfigurierbar via `scanner_duplex_rotate_back_pages` und `scanner_duplex_back_first`. Verifiziert durch iteratives Nutzer-Feedback.

- **PDF-Rotation für Paperless via pikepdf Content-Stream, nicht /Rotate-Metadatum**: OCRmyPDF ignoriert beim Re-Processing das `/Rotate`-Metadatum zuverlässig. Rotation muss physisch in den Content-Stream eingebacken werden: `q\n-612 0 0 -792 612 792 cm\n/Im0 Do\nQ`. Zusätzlich OCR-XObjects (`/OCR-...`) aus `/Resources` entfernen, damit Paperless die Seite neu OCR'd.

## Anti-Patterns

- **SANE net-Backend ausprobieren ohne Quellcode zu prüfen**: Stunden in Manager-Modus + saned investiert, obwohl scanbd im Quellcode `local_only=1` hartcodiert hat. Hätte zuerst das scanbd-Verhalten verstanden werden sollen (greife nach SANE_DEBUG-Logs, lies die Manpage/Source), bevor ein alternativer Architektur-Ansatz verfolgt wird.

- **saned.socket deployen ohne inetd-Port-Belegung zu prüfen**: Ubuntus scanbd-Paket installiert `openbsd-inetd`, der bereits Port 6566 belegt. Das `ss -tlnp | grep 6566` vor dem Deploy hätte den Konflikt sofort sichtbar gemacht.

- **Diagnose-Reihenfolge**: Die libusb-Busy-Ursache hätte früher mit `SANE_DEBUG_SANEI_USB=1 scanimage ...` (während scanbd läuft) identifiziert werden können, statt zuerst Konfigurationen zu verändern.

- **Template-Divergenz und fehlende Deployed-File-Prüfung**: `scanbd-dll.conf.j2` wurde auf `net` geändert während der Server manuell auf `fujitsu` zurückgesetzt wurde — template und Live-Config liefen auseinander. Allgemeiner: Bei unerwartetem Verhalten zuerst die deployte Datei auf dem Server lesen (`cat -n /path/to/script`), nicht nur das Template.

- **`{% raw %}...{% endraw %}` auf einer Zeile mit Jinja2 `trim_blocks`**: Ansible setzt `trim_blocks=True`. Das `\n` nach `{% endraw %}` wird gestrippt. Fix: `{% endraw %}` immer auf einer eigenen Zeile platzieren, sodass das `\n` innerhalb des Raw-Blocks erhalten bleibt.

- **Scanner-Verhalten ohne Testdaten annehmen**: Mehrfach falsche Annahmen über die Reihenfolge (front-first vs. back-first) und die Anzahl der zu rotierenden Seiten (nur Rückseiten vs. alle). Korrekte Vorgehensweise: Einen echten Testlauf durchführen und das Ergebnis inspizieren, bevor der Fix implementiert wird. Die Nutzer-Screenshots waren am Ende zuverlässiger als jede Annahme.

- **pypdf /Rotate-Metadatum vs. pikepdf Content-Stream**: Zwei Iterationen verschwendet weil pypdf's `page.rotate()` nur `/Rotate` setzt, OCRmyPDF das aber beim Re-Import ignoriert. Für PDFs die Paperless noch einmal verarbeitet: immer die Transformation in den Content-Stream einbacken, nicht nur Metadaten setzen.

- **pypdf `extract_text()` zur Orientierungs-Erkennung**: OCRmyPDF bettet OCR-Text in einer separaten Form-XObject-Schicht ein, die unabhängig vom Bild-Pixel-Inhalt orientiert sein kann. Text-Extraktion via pypdf zeigt "lesbaren" Text auf einer visuell auf dem Kopf stehenden Seite — kein verlässliches Signal für die Bild-Orientierung.

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
