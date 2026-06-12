# Active Context

## Aktueller Branch
feat/gameserver-ui-config-form (PR offen)

## Aktueller Fokus
Benutzerfreundliche serverconfig.xml-Konfiguration in der Gameserver-UI.

## Erledigt in diesem Branch
- `configSchema.ts`: kuratiertes Schema aller ~70 V2.6-Properties (Quelle: mitgelieferte
  serverconfig.xml des Servers, V2.6 b14) mit type/label/description/default/options/range.
- Typgerechte Controls (`ConfigFieldControl.tsx`): enum→Dropdown, bool→Toggle,
  begrenzte int→Slider+Zahl, offene→Stepper, text/password.
- `GameWorld` = dynamisches Dropdown via `GET /api/worlds` (listet Welten im Container:
  serverfiles/Data/Worlds + GeneratedWorlds, + RWG).
- `config/page.tsx`: ~8 Gruppen als Akkordeon + Suche; geänderte Felder hervorgehoben
  + Zähler am Speichern-Button; Default-Hinweis je Feld; „Experten (XML)" bleibt.
- `buildConfigModel` mergt Schema+Datei; unbekannte Properties → „Sonstige".
- `serializeProperties` ergänzt fehlende Properties (alle Settings setzbar). ACHTUNG:
  bestehender Test „ignores keys not present" wurde bewusst zu „ergänzt fehlende" geändert.
- TDD: configSchema/configModel/serverconfig Tests. Suite 116/116, tsc+eslint+build clean.
- docs/20 Config-Zeile aktualisiert. Spec: docs/superpowers/specs/2026-06-12-...-config-form-design.md

## Verifizierte Fakten (V2.6)
- Welten auf Server: Navezgane, Pregen06k01/06k02/08k01/08k02 (+ Empty/Playtesting), keine generierten.
- `version`-Telnet → `Game version: V 2.6 (b14)`.
- Welt-Pfade: /home/sdtdserver/serverfiles/Data/Worlds, /home/sdtdserver/.local/share/7DaysToDie/GeneratedWorlds.

## Offene Punkte
- PR mergen → Image-Build → **Pod-Restart** der gameserver-ui (Tag :stable).
- Live verifizieren: /config Akkordeon/Controls, Map-Dropdown, Speichern.
- Hinweis: Speichern startet den 7DTD-Container neu (~1 Min).

## Zuletzt gemergt (alle live verifiziert)
- PR #166: memory-bank-sync.
- PR #165: Container-Neustart + Spielversions-Kachel (echter Restart getestet).
- PR #164: Konsolen-Output sauber + /logs Verbindungs-Toggle.
- PR #163: Telnet graceful exit → keine IOException.
