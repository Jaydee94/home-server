# Gameserver-UI — Redesign (Optik & UX) — Design-Spec

- **Datum:** 2026-06-11
- **Branch:** `feat/gameserver-ui-redesign`
- **App:** `apps/gameserver-ui` (Next.js, deployed via `argocd/apps/gameserver-ui`)
- **Status:** Design abgestimmt (Brainstorming), bereit für Implementierungsplan

## Ziel

Die bestehende, funktional vollständige aber optisch rohe Gameserver-UI
(weißer Hintergrund, Inline-Styles, native Buttons, Debug-Tabellen) in ein
konsistentes, dunkles **Clean-Admin-Dashboard** mit eigenem Design-System
überführen, die UX an mehreren Stellen schärfen und gezielt Features ergänzen
bzw. straffen.

## Leitentscheidungen (aus dem Brainstorming)

| Thema | Entscheidung |
|---|---|
| Visuelle Richtung | Clean Admin, **dunkel** |
| Akzentfarbe | **Amber/Rost** (7DTD-Nod), dezent |
| Grundgerüst | **Linke Sidebar**, am Desktop **auf Icons einklappbar** |
| Dichte | **Komfortabel** (großzügiger Weißraum) |
| Mobile | **Muss top sein** — jede Seite voll responsiv |
| Branding | Zombie-Icon + **echter Servername aus der Config** (z. B. „ZCPM-Zombieland") |
| Lade-/Leerzustände | **Skeletons** |
| Gefährliche Aktionen | **Klick-Bestätigungs-Modal** (einheitlich) + **Toasts** |
| Aktualisierung | **Polling beibehalten** (5–15 s) + dezenter „zuletzt aktualisiert"-Hinweis |
| Umsetzung | **In Phasen** — Phase 1 Fundament+Restyle, Phase 2 neue Features |

## Navigation (Ziel-Struktur)

Sidebar mit Servername-Kopf, Icons, Active-State, dauerhaft sichtbarem
Server-Status-Pill und **Logout unten**:

```
Dashboard · Spieler · Konsole · Logs · Config · Backups · Mods   [Logout]
```

- **Entfernt:** die bisherige **Zeitplan-Seite** (Scheduling läuft über
  Kubernetes-CronJobs in Git, nicht über die UI).
- **Neu:** **Konsole** als eigener Nav-Punkt.

## Seiten-Design

### Dashboard
- **Status-Hero** (menschenlesbar): farbiger Status-Punkt + „Server läuft / gestoppt /
  startet", Subzeile „seit … · Tag N", kontextabhängige Aktionen
  (Starten / Neustart / Stoppen). Aktionen werden **gegated**, wenn der Server
  gestoppt ist.
- **Stat-Kacheln:** Spieler online (x/max), CPU, RAM, letztes Backup.
- **Connect-Karte:** Tailscale-`ip:port` als kopierbarer Code + „Kopieren".
- **Online-Spieler-Vorschau:** kompakte Chips der aktuell verbundenen Spieler.
- **Horde-Nacht-Countdown:** *nice-to-have* — via `gettime` (aktueller Tag) +
  `BloodMoonFrequency` aus der Config errechenbar (siehe Machbarkeit). Nur
  einbauen, wenn der Aufwand klein bleibt, sonst still weglassen.
- **Technik-Block:** eigene, **dauerhaft sichtbare** Karte mit den rohen
  KubeVirt-Werten (`runStrategy`, `VMI-Phase`, `printableStatus`, Roh-IP) —
  bewusst behalten, nur aus dem Hero herausgelöst.

### Spieler
- Tabelle mit **Name · Level · Spielzeit · letzter Login**.
  **HP und Ping entfallen.**
- **Datenrealität (wichtig):** `listplayers`/`lp` liefert nur **aktuell online**
  Spieler. **„Letzter Login" für offline Spieler ist über Telnet nicht
  verfügbar**, und es gibt keine vom Spiel persistierte Gesamt-Spielzeit.
  - *Spielzeit* wird daher als **Session-Dauer** interpretiert (seit Connect,
    UI-seitig getrackt) — bei fehlenden Daten „—".
  - *Letzter Login* nur **best-effort** (z. B. UI-seitig gemerkter letzter
    Online-Zeitpunkt seit App-Start); andernfalls „—". Bei der Plan-Erstellung
    final entscheiden, ob die Spalte bleibt oder durch ein verfügbares Feld
    (z. B. Deaths/Zombie-Kills) ersetzt wird.
- Aktion **Broadcast-Nachricht** bleibt.
- **„Welt speichern" wandert hier raus** → auf die Backups-Seite.
- Kein Kick/Ban (bewusst nicht im Scope).

### Konsole (neu)
- Freitext-Eingabe für **beliebige** Telnet-/Server-Befehle + Anzeige der
  Antwort. Keine Whitelist, keine Schnell-Buttons.

### Logs
- Reine Log-Ansicht (Live-SSE-Stream, ~500 Zeilen).
- **CPU/RAM-Zeile entfällt** (Metriken leben jetzt nur auf dem Dashboard).
- **Phase 2:** Log-Tools — Suche, Level-Filter, Pause, Kopieren, Download.

### Config
- **Strukturiertes Formular** über **alle** konfigurierbaren
  `serverconfig.xml`-Properties, gruppiert in Sektionen (Identität/Server,
  Zugang, Welt, Gameplay/Schwierigkeit, …). **Passwörter maskiert.**
- **Roh-XML** bleibt erhalten als **„Experten"-Tab** (zweite Ansicht), nicht
  mehr Standardansicht.
- Speichern = „Ausrollen + Neustart" hinter dem einheitlichen Bestätigungs-Modal.

### Backups
- Liste mit **menschenlesbaren Zeitstempeln** (relativ + absolut) und Größe.
- Aktionen: **Erstellen · Download · Löschen · Restore** (Restore hinterm Modal).
- **„Welt speichern"-Button** (von der Spielerseite hierher verschoben).
- **Retention:** automatisch „**letzte N behalten**" (konfigurierbar), ältere
  werden gelöscht; zusätzlich manuelles Löschen.

### Mods
- Restyle des bestehenden Flows (Zip-Upload via Drag&Drop, Liste, Löschen).
  Keine neuen Mod-Funktionen im Scope.

### Login
- Voll ans neue Design angepasst (dunkel, zentriert, Akzentfarbe).

## Querschnitt: Design-System

Neues, leichtgewichtiges Design-System unter `apps/gameserver-ui/src`:

- **Tokens:** Farben (dunkle Flächen + Amber-Akzent + semantische Status-Farben
  grün/gelb/rot), Spacing-Skala, Radius, Typo (Geist-Font **tatsächlich nutzen**).
- **Komponenten (wiederverwendbar):** `AppShell`/`Sidebar`, `Button`,
  `Card`, `StatTile`, `Modal` (Bestätigung), `Toast`/`ToastProvider`,
  `StatusDot`, `Table`, `Skeleton`, `CopyButton`, `EmptyState`.
- Ersetzt **alle** bisherigen Inline-Styles; einheitliche Seitenbreite/Layout
  über die Shell statt pro Seite.
- **Responsiv**: Sidebar klappt mobil zu einem ausklappbaren Menü; Tabellen/
  Karten brechen sauber um.

## Bewusst NICHT im Scope (YAGNI)

- Spieler **Kick/Ban**
- **Gotify-Push** bei Start/Stop/Crash
- **Undo**- bzw. Tipp-Bestätigungs-Muster (einfaches Klick-Modal genügt)
- **Zeitplan-Seite** (über Kubernetes gesteuert → entfernt)
- **CPU/RAM-Verlaufsgrafiken** (nur aktuelle Zahlenwerte)
- Mod-Enable/Disable-Toggle

## Phasen

**Phase 1 — Fundament & Restyle (ein PR-Strang):**
- Design-System + Tokens + Kernkomponenten
- Sidebar-Shell (einklappbar, Status-Pill, Logout, mobil)
- Login restyled
- **Alle Seiten** im neuen Look: Dashboard (Hero + Kacheln + Technik-Karte),
  Spieler (neue Spalten, „Welt speichern" entfernt), Logs (ohne CPU/RAM),
  Config (Restyle, noch ohne Formular — oder Formular wenn Aufwand passt),
  Backups (Restyle + „Welt speichern"-Button verschoben), Mods (Restyle)
- Einheitliche **Modals + Toasts**, Skeletons, State-Gating
- Zeitplan-Seite entfernen, **Konsole**-Nav-Punkt anlegen (mind. Grundgerüst)

**Phase 2 — Neue Features:**
- Config-**Formular** über alle Properties (+ Experten-XML-Tab) *(falls nicht
  schon in P1)*
- **Konsole** (Freitext-Befehle) voll funktionsfähig
- **Log-Tools** (Suche/Filter/Pause/Kopieren/Download)
- **Backups+** (Download, Löschen, Retention)
- **Horde-Nacht-Countdown** (nur falls einfach)

## Offene Machbarkeits-Punkte (vor/in Phase 2 zu prüfen)

- **Horde-Countdown:** `gettime` liefert aktuellen Tag → mit `BloodMoonFrequency`
  aus der Config ist der nächste Blutmond berechenbar. Machbar, geringer Aufwand.
- **Spieler-Spalten:** „letzter Login" und persistente Spielzeit sind über
  Telnet **nicht** verfügbar (`listplayers` zeigt nur Online-Spieler). Im Plan
  final entscheiden: best-effort (UI-getrackt) oder Spalten durch verfügbare
  Felder (Deaths/Zombie-Kills/Position) ersetzen.
- **Backup-Download** über die bestehende SMB/NAS-Anbindung (Streaming großer
  Dateien durch die Next.js-API).
- Retention-Löschung sicher gegen versehentliches Entfernen des letzten Backups.

## Test-Strategie

- Bestehende Vitest-Suite (`src/app/api/**`, `src/lib/**`) bleibt grün.
- Neue Lib-Logik (Config-Property-Parsing/-Serialisierung, Retention, Telnet-
  Befehls-Routing) **TDD**: Test zuerst, dann Implementierung.
- UI-Komponenten: Behavior-Tests (sichtbares Verhalten), keine Style-Snapshots.
- Manuelle Verifikation über die Ingress-Route mit Playwright (Screenshots vor/
  nach je Seite).

## Quellen

- 7 Days to Die Console/Telnet Commands — https://7d2d.net/console-commands
- Command Console (Wiki) — https://7daystodie.fandom.com/wiki/Command_Console
- 7DTD Telnet Commands (PingPlayers) — https://pingplayers.com/knowledgebase/7-days-to-die/telnet-commands
