# Modi — roadmap-triage

## a) Capture

**Trigger:** Idee, Bug, Feature-Wunsch, Enhancement wird erwähnt.

**Ablauf:**
1. Sofort Issue anlegen — keine Bewertung, kein Verhör:
   ```bash
   bash .claude/skills/forgecrate-roadmap-triage/roadmap.sh capture "<titel>"
   # oder manuell:
   gh issue create \
     --title "<titel>" \
     --label "stage:inbox" \
     --label "type:<vermutung>" \
     --body "<body-template mit Platzhalter-WSJF>"
   ```
2. Bestätige mit Issue-Nummer und URL.
3. Nichts weiter — Triage ist ein eigener Schritt.

---

## b) Triage

**Trigger:** „Backlog aufräumen", „Inbox verarbeiten", nach mehreren Captures.

**Ablauf je `stage:inbox`-Issue:**

```bash
bash .claude/skills/forgecrate-roadmap-triage/roadmap.sh inbox   # alle inbox Issues anzeigen
```

Für jedes Issue:

1. **Type final setzen** — altes `type:*` ggf. korrigieren.
2. **WSJF scoren** — alle vier Achsen bewerten, Rechnung zeigen, `score=X.X` in Body schreiben, `prio:*`-Label setzen.
3. **Blocker-Test explizit anwenden:**
   > „Kann die Definition of Done des aktiven Meilensteins ohne dieses Issue erfüllt werden?"
   - **Ja** → nicht in aktiven Milestone.
   - **Nein** → `stage:planned` + aktive Milestone (Blocker bestanden, Bestätigung einholen).

4. **Disposition:**
   | Situation | Aktion |
   |---|---|
   | Bug bricht DoD des aktiven Milestone | → `stage:planned` + aktive Milestone (nach Bestätigung) |
   | Passt zum *nächsten* Milestone + WIP-Limit frei + hoher WSJF | → `stage:planned` + nächste Milestone |
   | Sonst | → `stage:backlog` + ggf. `resurface:<tag>` |
   | Klar außerhalb Produktvision | → schließen (reason=„not planned"), `dropped`, Grund als Kommentar |

5. **Stage-Wechsel:** altes `stage:*` entfernen, neues setzen:
   ```bash
   bash .claude/skills/forgecrate-roadmap-triage/roadmap.sh stage-move <nr> stage:backlog
   ```

---

## c) Plan Release

**Trigger:** „Release planen", neuer Meilenstein starten.

**Ablauf:**

1. **Milestone sicherstellen:**
   ```bash
   gh api repos/{owner}/{repo}/milestones --method POST \
     --field title="<name>" \
     --field description="Ziel: ...\nDefinition of Done: ...\nScope-Lock: YYYY-MM-DD\nKapazität: 7"
   ```
   Existiert er bereits: Beschreibung prüfen und ggf. ergänzen.

2. **Backlog filtern:**
   ```bash
   bash .claude/skills/forgecrate-roadmap-triage/roadmap.sh backlog-ranked   # nach WSJF-Score absteigend
   gh issue list --label "resurface:<tag>"   # fällige Resurface-Items
   ```

3. **Re-Scoring**: veraltete Scores aktualisieren.

4. **Vorschlag:** genau so viele Top-Items wie das WIP-Limit erlaubt. Nichts verschieben ohne Bestätigung.

5. **Nach Freigabe:** Items auf `stage:planned` + Milestone setzen:
   ```bash
   bash .claude/skills/forgecrate-roadmap-triage/roadmap.sh stage-move <nr> stage:planned
   gh issue edit <nr> --milestone "<milestone-name>"
   ```

6. **Optional:** Master-Tracking-Issue anlegen mit Checkliste:
   ```
   - [ ] #<nr> Titel
   - [ ] #<nr> Titel
   ```

---

## d) Groom

**Trigger:** „Backlog reviewen", WSJF-Scores veraltet, Duplikate aufgefallen.

**Ablauf:**

1. **Veraltete Scores** markieren (> 4 Wochen alt oder abhängige Issues geändert).
2. **Fällige Resurface-Items** hervorheben:
   ```bash
   bash .claude/skills/forgecrate-roadmap-triage/roadmap.sh resurface
   ```
3. **Duplikate schließen:** reason=„not planned", Label `dropped`, Kommentar „Duplikat von #<nr>" — Original bleibt erhalten.
4. **Issues ohne `type:*`** ergänzen.

---

## e) Status

**Trigger:** „Was liegt an?", „Wie steht's?", „Milestone-Stand?"

```bash
bash .claude/skills/forgecrate-roadmap-triage/roadmap.sh status
```

Zeigt:
- Anzahl offener Issues je Stage
- Aktive Milestones: X/Y erledigt, WIP-Füllstand gegen Limit
- WIP-Warnung wenn aktiver Milestone voll ist
