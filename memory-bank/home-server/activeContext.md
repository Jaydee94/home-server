# Active Context

## Aktueller Branch
feat/gameserver-ui-remove-deprecated-props (PR offen)

## Aktueller Fokus
Veraltete Properties aus der serverconfig.xml über die UI entfernbar machen.

## Erledigt in diesem Branch
- `removeProperty(xml, name)` in serverconfig.ts: entfernt die <property>-Zeile inkl.
  nachgestelltem Kommentar, no-op bei unbekanntem Namen. TDD.
- UI: in Gruppe „Sonstige" (unbekannte/veraltete Properties) je Feld 🗑-Button mit
  Undo; markierte Properties werden beim Speichern via removeProperty entfernt;
  Änderungszähler berücksichtigt Entfernungen. Bekannte V2.6-Settings geschützt.
- Suite 120/120, tsc+eslint+build clean. docs/20 + Spec aktualisiert.
- Konkreter Anlass: serverconfig.xml des Servers enthält veraltete
  ControlPanelEnabled/Port/Password (in V2.6 durch WebDashboard* ersetzt) → über
  „Sonstige" entfernbar.

## Offene Punkte
- PR mergen → Build → Pod-Restart → live die ControlPanel*-Properties entfernen
  (Config → Sonstige → 🗑 → Ausrollen). ACHTUNG: Speichern startet 7DTD-Container neu.

## Zuletzt gemergt (alle live verifiziert)
- PR #168: /api/worlds 502 (fehlendes GeneratedWorlds-Verzeichnis) gefixt; Map-Dropdown läuft.
- PR #167: benutzerfreundliches Config-Formular (~97 Properties, typgerechte Controls,
  Akkordeon+Suche, Map-Dropdown, serializeProperties ergänzt fehlende).
- PR #165: Container-Neustart + Versions-Kachel. PR #164: Konsole/Logs-Cleanup.
- PR #163: Telnet graceful exit.

## Verifizierte Fakten (V2.6)
- Welten: RWG, Navezgane, Pregen06k01/06k02/08k01/08k02 (+ Empty/Playtesting).
- serverconfig.xml des Servers hat aktuell 14 Properties; 3 davon veraltet (ControlPanel*).
- Deploy gameserver-ui: Tag :stable → nach Merge Pod-Restart nötig.
