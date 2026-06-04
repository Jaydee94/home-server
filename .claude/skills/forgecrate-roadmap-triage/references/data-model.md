# Datenmodell — roadmap-triage

## ID

Issue-Nummer = einzige ID. Kein eigenes Schema.

## Stage-Labels (genau einer pro Issue)

| Label | Bedeutung |
|---|---|
| `stage:inbox` | Neu erfasst, noch nicht bewertet |
| `stage:backlog` | Bewertet, aber nicht eingeplant |
| `stage:planned` | Einem Milestone zugewiesen, noch nicht gestartet |
| `stage:in-progress` | Aktiv in Arbeit |
| — (geschlossen, reason=completed) | `shipped` |
| — (geschlossen, reason=not planned) + `dropped` | Verworfen |

Stage-Wechsel = altes `stage:*`-Label entfernen, neues setzen:
```bash
bash .claude/skills/forgecrate-roadmap-triage/roadmap.sh stage-move <issue-nr> <neues-stage-label>
```

## Type-Labels (genau einer pro Issue)

`type:feature` · `type:bug` · `type:enhancement` · `type:tech-debt` · `type:research` · `type:chore`

**Abgrenzung Bugfix / Feature / Enhancement / Meilenstein:**
- Bug = unerwartetes Verhalten, das korrigiert werden muss → `type:bug`
- Feature = neue Fähigkeit, die vorher nicht existierte → `type:feature`
- Enhancement = bestehende Fähigkeit verbessern → `type:enhancement`
- **Meilenstein = kein Type**, sondern die GitHub-Milestone-Klammer

## Prioritäts-Labels (ab Triage, einer pro Issue)

| Label | WSJF-Score |
|---|---|
| `prio:critical` | ≥ 4,0 |
| `prio:high` | 2,0 – 3,9 |
| `prio:medium` | 1,0 – 1,9 |
| `prio:low` | < 1,0 |

## Resurface-Labels (optional)

`resurface:<tag>` — on-demand anlegen, z. B. `resurface:v2.0`, `resurface:post-launch`.  
Macht „beim nächsten Release wieder vorlegen" per `--label` abfragbar:
```bash
gh issue list --label "resurface:v2.0"
# oder via Script:
bash .claude/skills/forgecrate-roadmap-triage/roadmap.sh resurface
```

## Milestone-Struktur

GitHub Milestone mit folgenden Feldern in der **Beschreibung**:

```
Ziel: <ein Satz>
Definition of Done: <prüfbare Kriterien>
Scope-Lock: <Datum>
Kapazität: <WIP-Limit, default 7>
```

Anlegen via `gh api`:
```bash
gh api repos/{owner}/{repo}/milestones \
  --method POST \
  --field title="v1.0" \
  --field description="Ziel: ...\nDefinition of Done: ...\nScope-Lock: YYYY-MM-DD\nKapazität: 7"
```

## Optionales Project-Board

Spalten = Stages, Number-Field „WSJF" sortierbar.  
**Nur Visualisierung** — die Wahrheit bleibt am Issue, nicht am Board.
