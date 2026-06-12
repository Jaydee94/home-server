# Gameserver-UI: Logs-Ansicht — Verbindungs-Rauschen umschaltbar

**Datum:** 2026-06-12
**Status:** Design genehmigt
**Branch:** `fix/gameserver-ui-console-output-marker`

## Problem

Die `/logs`-Seite zeigt `docker logs --tail=100 7dtd-server`. Bei idle-Server (0
Spieler) produziert 7DTD kaum Spiel-Logs; die letzten 100 Zeilen sind nahezu
vollständig **Telnet-Plumbing** (Verbindungsauf-/abbau bei jedem UI-Poll via `lp`)
und — vor PR #163 — IOException-Stacktraces (je ~13 Zeilen). Ergebnis: echtes
Spielgeschehen ist nicht erkennbar; die Ansicht wirkt wie ein „Telnet-Log", nicht
wie ein Gameserver-Log.

## Ziel

`/logs` zeigt standardmäßig nur Spielgeschehen; das Verbindungs-Rauschen ist per
Toggle einblendbar. Roh-Logs bleiben jederzeit zugänglich.

## Design

### Architektur & Datenfluss

- `src/app/api/logs/route.ts`: streamt weiterhin **rohe** `docker logs`-Ausgabe;
  einzige Änderung `--tail=100` → `--tail=500` (bei idle-Server bleibt nach dem
  Filtern sonst zu wenig übrig).
- Neue Pure-Function `isConnectionNoise(line: string): boolean` in
  `src/lib/logfilter.ts` — klassifiziert eine Logzeile als Verbindungs-Rauschen.
- `src/app/logs/page.tsx`: hält wie bisher alle Roh-Zeilen im State. Neuer Toggle
  **„Verbindungs-Logs"** (Default: **aus** = sauber). Anzeige-Filter rein
  clientseitig und reaktiv — kein Refetch beim Umschalten. Bestehender Such-Filter
  wird zusätzlich angewandt.

### Klassifizierung „Verbindungs-Rauschen" (Default ausgeblendet)

Eine Zeile gilt als Rauschen, wenn sie eines dieser Muster matcht:

- `Telnet connection (from|closed):`
- `(Started|Exited) thread TelnetClient`
- `Executing command '…' by Telnet`
- `IOException in TelnetClient`
- `socket has been shut down`
- Telnet-spezifische Stacktrace-Frames: `TelnetConnection[.:]` und die
  zugehörigen `at System.Net.Sockets.…`-Frames

**Bewusst NICHT** generisch alle `at …`-Stacktraces filtern — echte
Spiel-Exceptions sollen sichtbar bleiben.

### Copy / Download

WYSIWYG: exportieren genau die aktuell angezeigten Zeilen (respektieren Toggle +
Suche).

### Tests

- Unit-Tests für `isConnectionNoise`: jede Rausch-Kategorie → `true`; Gegenprobe
  mit echten Spielzeilen (Player join/leave, Chat, „Day N, HH:MM", Blood-Moon,
  generische Game-Exception) → `false`.
- Page-Toggle-Verhalten bleibt ungetestet (kein React-Testing-Setup im Repo;
  Konvention dieses Pakets).

## Out of Scope (YAGNI)

- Server-seitiges Filtern / persistente Filter-Präferenz.
- Poll-Frequenz der UI reduzieren (separates Thema).
- Volltext-Logfile statt `docker logs` (Quelle ist korrekt, siehe docs/19).
