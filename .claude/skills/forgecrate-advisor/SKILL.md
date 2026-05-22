# forgecrate Advisor

Analysiert ein Repo und empfiehlt das passende `forgecrate`-Profil und die passenden Flavors.

## Verfügbare Profile

| Profil | Wann |
|--------|------|
| `backend` | Go, Rust, Python, Java, C# — kein oder minimales Frontend |
| `frontend` | React, Vue, Svelte, Angular — UI-lastiges Projekt |
| `fullstack` | Frontend und Backend in einem Repo |

## Verfügbare Flavors

| Flavor | Wann |
|--------|------|
| `strict-review` | Team >1 Person, PRs, formale Review-Prozesse |
| `tdd` | Test-first-Kultur, Testabdeckung >70 %, CI-Pflicht |
| `minimal` | Prototyp, Solo-Projekt, wenig Overhead gewünscht |
| `gitops` | ArgoCD-/Flux-getriebene Infrastruktur, Kyverno/OPA-Policies |
| `getbetter` | Lern-fokussierte Projekte, Session-übergreifende Erkenntnisse |
| `github` | GitHub-zentrierter Workflow: Releases via `gh`, CI-getriebene Tags |
| `no-research` | Air-gapped Repos, strikte Compliance, rein interne Logik |

## Ablauf

1. **Sprache und Framework erkennen** — prüfe `go.mod`, `package.json`, `Cargo.toml`, `pyproject.toml`. Schau ob Frontend-Abhängigkeiten (react, vue, …) vorhanden sind.

2. **Profil ableiten**:
   - Nur Backend-Sprache → `backend`
   - Nur Frontend-Framework → `frontend`
   - Beides → `fullstack`

3. **Test-Kultur erkennen** — prüfe ob Tests vorhanden sind, ob CI konfiguriert ist (`.github/workflows/`), ob Coverage-Reports erzeugt werden → Flavor `tdd` sinnvoll?

4. **Arbeitsweise abfragen** — stelle diese Fragen nacheinander:

   a. "Ist das ein Prototyp oder Solo-Projekt ohne formalen Review-Prozess?"
      - Ja → empfehle `minimal` (fügt keine weiteren Pflicht-Skills hinzu; das Compose-System ist additiv, d. h. `minimal` deaktiviert weder `strict-review` noch `tdd` — es kombiniert sie einfach nicht; weiter mit Schritt 5)
      - Nein → weiter mit b

   b. "Arbeitest du im Team mit PR-Reviews?"
      - Ja → Flavor `strict-review` vormerken

   c. "Schreibst du Tests vor der Implementierung (Test-first)?"
      - Ja → Flavor `tdd` vormerken

5. **Empfehlung ausgeben**:

```
Empfehlung basierend auf diesem Repo:

Profil:  backend
Reasons: Go-Modul erkannt, kein Frontend-Framework

Flavors: strict-review, tdd
Reasons: .github/workflows/ vorhanden (CI), >50 Testdateien gefunden

Befehl:
  forgecrate init --profile backend --flavors strict-review,tdd

Alternativ ohne TDD-Disziplin:
  forgecrate init --profile backend --flavors strict-review
```

6. **Frage ob ausführen** — "Soll ich `forgecrate init` mit dieser Konfiguration jetzt ausführen?"
