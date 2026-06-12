# Gameserver-UI: Container-Neustart + Spielversion im Dashboard

**Datum:** 2026-06-12
**Status:** Design genehmigt
**Branch:** `feat/gameserver-ui-restart-version`

## Problem / Ziel

1. **Container-Neustart:** Bisher lässt sich nur die ganze VM stoppen/starten
   (`runStrategy` Halted/Always). Es fehlt ein schneller Neustart **nur des
   7DTD-Docker-Containers** auf der VM — insbesondere um Mod-Änderungen (Upload via
   `/mods`) zu laden, ohne OS + Tailscale neu zu booten.
2. **Spielversion:** Das Dashboard zeigt die aktive 7DTD-Spielversion nicht. Der
   Telnet-Befehl `version` liefert sie (`Game version: V 2.6 (b14) …`).

## Design

### A) Container-Neustart — `POST /api/restart`

Orchestrierung in testbarer Lib-Funktion `restartServer(ssh, opts, sleep)`
(`src/lib/restart.ts`):

1. VM muss `Running` sein (sonst 503 „VM läuft nicht" — Nutzer soll „Starten"
   verwenden).
2. Spieler via `lp` zählen (`telnetCommand` + `parseLp`).
3. **Wenn Spieler online:** Broadcast `say [Neustart] Server-Neustart in 30
   Sekunden – bitte ausloggen`, `sleep(20s)`, `say [Neustart] Neustart in 10
   Sekunden`, `sleep(10s)`. **Wenn 0 Spieler:** Countdown überspringen.
4. `saveworld` (Spielstand sichern).
5. `sudo docker restart 7dtd-server` via `ssh.exec`.

`sleep` ist als Parameter injizierbar (Default: echtes `setTimeout`-Promise) →
Tests laufen ohne reale Wartezeit.

- **Dashboard** (`page.tsx`): Button **„↻ Neustarten"** neben Start/Stopp (nur
  aktiv wenn `running`), Confirm-Dialog, Toast „Server wird neugestartet (~1 Min)".
- **Mods-Seite** (`mods/page.tsx`): Hinweis „Mods werden erst nach einem
  Server-Neustart geladen" + derselbe Restart-Button (ruft `/api/restart`).

### B) Spielversion — `GET /api/version`

- `telnetCommand(ssh, opts, "version")` → `parseVersion(out)` (`src/lib/version.ts`)
  extrahiert die Spielversion (Teil vor `Compatibility Version`), z. B. `V 2.6 (b14)`.
- Dashboard holt sie einmalig bei Load (nur wenn `running`); neue
  `StatTile label="Version"`.

### Fehlerbehandlung / Edge cases

- Beide Endpunkte: VM nicht `Running` → 503. SSH/Telnet-Fehler → 502.
- Container-Down ändert die VMI-Phase **nicht** → Dashboard zeigt während des
  ~1-Min-Restarts weiterhin „läuft"; Players/Version-Tiles erroren kurz. Bewusst
  akzeptiert; der Toast kommuniziert die Wartezeit.

### Tests (TDD)

- `parseVersion()`: extrahiert `V 2.6 (b14)`, ignoriert `Compatibility Version`
  und `Mod …`-Zeilen; leere/unerwartete Eingabe → `null`/leerer String.
- `restartServer()` mit Fake-`ssh`/Fake-`telnetCommand` + Fake-`sleep`:
  - Reihenfolge `saveworld` **vor** `docker restart 7dtd-server`.
  - Broadcast-`say` nur wenn Spieler > 0; bei 0 Spielern übersprungen.
  - `sudo docker restart 7dtd-server` wird aufgerufen.

## Mod-Zusammenspiel

Der Container-Neustart ist der schnelle, korrekte Weg, hochgeladene Mods zu laden
(7DTD liest Mods nur beim Start), ohne die VM komplett neu zu booten. Deshalb sitzt
derselbe Button prominent auf der Mods-Seite mit erklärendem Hinweis.

## Out of Scope (YAGNI)

- Container-Health-Anzeige im Dashboard (VMI-Phase bleibt die Status-Quelle).
- Versions-Caching/Persistenz (Abruf bei Bedarf reicht).
- Konfigurierbare Countdown-Dauer im UI (fix 30s; bei 0 Spielern übersprungen).
