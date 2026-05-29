# PR-Checkliste

Systematische Überprüfung vor `gh pr create`. Alle offenen Punkte müssen adressiert sein.

## Ablauf

0. **Base-Branch ermitteln**
   ```bash
   BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||')
   [ -z "$BASE" ] && BASE="main"
   echo "Base-Branch: $BASE"
   ```

1. **Breaking Changes identifizieren**
   ```bash
   git diff "$BASE" -- '*.go' '*.ts' '*.py' '*.rs' '*.java' | grep -E '^\+.*(func |export (function|class|const |type )|pub fn |public (class|interface))'
   ```
   - Entfernte oder umbenannte Felder in structs/types/interfaces prüfen
   - Datenbankmigrationen vorhanden? (`git diff "$BASE" --name-only | grep -iE 'migrat'`)

2. **Testabdeckung für geänderte Dateien**

   Geänderte Nicht-Test-Dateien ermitteln:
   ```bash
   git diff "$BASE" --name-only | grep -vE '(_test\.|\.spec\.|_spec\.|Test\.|\.test\.)'
   ```

   Für jede geänderte Datei: prüfe ob im selben Verzeichnis eine Testdatei liegt:
   ```bash
   git diff "$BASE" --name-only | grep -vE '(_test\.|\.spec\.|_spec\.|Test\.|\.test\.)' | while read f; do
     dir=$(dirname "$f")
     if ls "$dir"/*{_test.*,.spec.*,_spec.*,Test.*,.test.*} 2>/dev/null | grep -q .; then
       echo "OK: $f"
     else
       echo "KEIN TEST: $f"
     fi
   done
   ```
   Dateien mit "KEIN TEST" explizit auflisten.

3. **Dokumentation synchronisieren**

   `/forgecrate-doc-sync` aufrufen — der Skill gleicht alle Docs mit dem aktuellen Code-Stand ab und aktualisiert veraltete Abschnitte direkt. Erst wenn der Skill durchgelaufen ist und seinen Report ausgegeben hat, gilt dieser Punkt als erledigt.

4. **PR-Beschreibung vollständig?**

   Existiert bereits ein Draft-PR? Falls ja:
   ```bash
   gh pr view --json title,body 2>/dev/null
   ```
   Falls kein Draft-PR: frage den Nutzer nach dem geplanten PR-Titel und der Beschreibung.

   Prüfe ob folgende Punkte beantwortet sind:
   - Was wurde geändert?
   - Warum (Ticket/Issue verlinkt)?
   - Wie wurde getestet?

5. **Checkliste ausgeben**

   Format:
   ```
   ✅ Keine Breaking Changes erkannt
   ⚠️  src/deploy.ts hat keinen zugehörigen Test im selben Verzeichnis
   ✅ README.md aktuell
   ❌ PR-Beschreibung: "Wie getestet" fehlt
   ```

   Offene ❌-Punkte müssen behoben sein bevor `gh pr create` aufgerufen wird.
   ⚠️-Punkte sind Hinweise — können mit Begründung übersprungen werden.
