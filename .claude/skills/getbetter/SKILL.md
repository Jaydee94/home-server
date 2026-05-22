# GETBETTER

Reflektiert die aktuelle Session und aktualisiert `.claude/GETBETTER.md` mit synthetisierten Erkenntnissen.

## Ablauf

1. **Bestehende Erkenntnisse laden**

   Lies `.claude/GETBETTER.md` mit dem Read-Tool. Falls die Datei nicht existiert, starte mit einer leeren Basis.

   Falls keine verwertbare Session-History vorhanden ist (z.B. direkt nach Sessionbeginn oder nach Kompaktierung): kurze Meldung ausgeben und Skill beenden — keine Erkenntnisse erzwingen.

2. **Aktuelle Session reflektieren**

   Analysiere die aktuelle Session und extrahiere Erkenntnisse in diesen Kategorien:

   - **Entscheidungen** — Was wurde entschieden und warum? Welche Alternativen wurden verworfen?
   - **Anti-Patterns** — Was lief schief? Was hätte früher erkannt werden sollen?
   - **Was funktioniert** — Welche Ansätze haben sich bewährt? Was sollte beibehalten werden?

   Formuliere frei — kein starres Format, aber bleib konkret und präzise.

3. **Synthetisieren und schreiben**

   Führe bestehende und neue Erkenntnisse zusammen:
   - Bestehende Punkte bleiben erhalten; ein Punkt gilt als überholt wenn ein neuer denselben Sachverhalt präziser beschreibt oder ihn explizit widerlegt
   - Überschneidende Punkte werden verdichtet, nicht doppelt geführt
   - Neue Erkenntnisse werden eingearbeitet

   Schreibe das Ergebnis nach `.claude/GETBETTER.md`:

   ```markdown
   # GETBETTER

   _Letzte Aktualisierung: YYYY-MM-DD_ (ISO 8601, immer das aktuelle Datum einsetzen)

   ## Entscheidungen
   [synthetisierter Inhalt]

   ## Anti-Patterns
   [synthetisierter Inhalt]

   ## Was funktioniert
   [synthetisierter Inhalt]
   ```

4. **Bestätigen**

   Gib eine kurze Zusammenfassung: wie viele Punkte wurden hinzugefügt, verdichtet oder entfernt.
