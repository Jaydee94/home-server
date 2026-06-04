# WSJF-Scoring — roadmap-triage

## Formel

```
WSJF = Cost of Delay / Job Size
Cost of Delay = value + time_criticality + risk_opportunity
```

Alle Achsen auf modifizierter Fibonacci-Skala: **1 · 2 · 3 · 5 · 8 · 13**

Höherer WSJF = früher machen.

## Achsen-Ankerpunkte

### value (User-/Business-Wert)
| Score | Bedeutung |
|---|---|
| 1 | Kosmetisch, kaum merkbar |
| 5 | Spürbarer Nutzen für Kernnutzer |
| 13 | Kernkritisch / Differenzierungsmerkmal |

### time_criticality (verfällt der Wert?)
| Score | Bedeutung |
|---|---|
| 1 | Egal wann |
| 5 | An Release/Event gebunden |
| 13 | Harte Deadline oder blockiert andere Arbeit |

### risk_opportunity (reduziert Risiko / eröffnet Optionen)
| Score | Bedeutung |
|---|---|
| 1 | Nein |
| 5 | Entschärft bekanntes Risiko |
| 13 | Schaltet künftige Features frei |

### size (Aufwand/Unsicherheit)
| Score | Bedeutung |
|---|---|
| 1 | Stunden |
| 5 | Tage |
| 13 | Wochen oder unklar |

## Beispiel-Rechnung

```
Idee: "CSV-Export für Reports"
value=5, time_criticality=3, risk_opportunity=1, size=3

CoD = 5+3+1 = 9
WSJF = 9/3 = 3,0  → prio:high
```

In den Issue-Body schreiben:
```
**WSJF:** value=5 · time-crit=3 · risk-opp=1 · size=3 → **score=3.0**
```

## Prio-Buckets

| Label | Score |
|---|---|
| `prio:critical` | ≥ 4,0 |
| `prio:high` | 2,0 – 3,9 |
| `prio:medium` | 1,0 – 1,9 |
| `prio:low` | < 1,0 |

## Re-Scoring

Body editieren + `prio:*`-Label tauschen:
```bash
gh issue edit <nr> --body "..."
bash .claude/skills/forgecrate-roadmap-triage/roadmap.sh stage-move <nr> <stage>  # falls Stage sich ändert
```

## Konsistenz-Regeln

- Bewerte jede Achse einzeln, begründe in einem Satz.
- Anchore gegen schon bewertete Issues (relativer Vergleich > absolute Schätzung).
- Bei Unsicherheit: konservativ bei `value`, großzügig bei `size` (verhindert WSJF-Inflation).
