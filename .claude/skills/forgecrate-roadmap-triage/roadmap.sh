#!/usr/bin/env bash
# roadmap.sh — thin gh wrapper for roadmap-triage skill
set -euo pipefail

# --- auth check ---
if ! gh auth status &>/dev/null; then
  echo "Fehler: gh ist nicht authentifiziert. Bitte ausführen: gh auth login" >&2
  exit 1
fi

OWNER=$(gh repo view --json owner -q .owner.login)
REPO=$(gh repo view --json name  -q .name)

cmd="${1:-help}"
shift || true

case "$cmd" in

  # ── Labels idempotent anlegen ─────────────────────────────────────────────
  setup-labels)
    declare -A STAGE_COLORS=(
      ["stage:inbox"]="0075ca"
      ["stage:backlog"]="6e40c9"
      ["stage:planned"]="0e8a16"
      ["stage:in-progress"]="e4e669"
    )
    for label in "${!STAGE_COLORS[@]}"; do
      gh label create "$label" --color "${STAGE_COLORS[$label]}" \
        --description "Roadmap stage" 2>/dev/null || true
    done

    for t in feature bug enhancement tech-debt research chore; do
      gh label create "type:$t" --color "f9d0c4" \
        --description "Issue type" 2>/dev/null || true
    done

    gh label create "prio:critical" --color "b60205" --description "WSJF >= 4.0"  2>/dev/null || true
    gh label create "prio:high"     --color "d93f0b" --description "WSJF 2.0-3.9" 2>/dev/null || true
    gh label create "prio:medium"   --color "fbca04" --description "WSJF 1.0-1.9" 2>/dev/null || true
    gh label create "prio:low"      --color "0075ca" --description "WSJF < 1.0"   2>/dev/null || true
    gh label create "dropped"       --color "cfd3d7" --description "Not planned, archived" 2>/dev/null || true

    echo "Labels gesichert (bestehende Labels wurden übersprungen)."
    ;;

  # ── Neue Idee erfassen ────────────────────────────────────────────────────
  capture)
    title="${1:-}"
    [[ -z "$title" ]] && { echo "Usage: roadmap.sh capture \"<titel>\"" >&2; exit 1; }
    gh issue create \
      --title "$title" \
      --label "stage:inbox" \
      --body "$(printf '%s\n' \
        '**WSJF:** value=_ · time-crit=_ · risk-opp=_ · size=_ → **score=_**' \
        '**Resurface:** —' \
        '' \
        '<Beschreibung / Kontext, 1–3 Sätze>' \
        '' \
        '**Definition of Done:** <sobald eingeplant>')"
    ;;

  # ── Inbox anzeigen ────────────────────────────────────────────────────────
  inbox)
    echo "=== stage:inbox ==="
    gh issue list --label "stage:inbox" \
      --json number,title,labels \
      --template '{{range .}}#{{.number}}  {{.title}}{{"\n"}}{{end}}'
    ;;

  # ── Backlog nach WSJF-Score sortiert ──────────────────────────────────────
  backlog-ranked)
    echo "=== stage:backlog (nach WSJF absteigend) ==="
    gh issue list --label "stage:backlog" --limit 100 \
      --json number,title,body \
      --jq '
        map(. + {
          score: (
            .body
            | capture("score=(?<s>[0-9]+\\.?[0-9]*)") // {s: "0"}
            | .s | tonumber
          )
        })
        | sort_by(-.score)
        | .[]
        | "[\(.score | tostring | .[0:4])]  #\(.number)  \(.title)"
      '
    ;;

  # ── Fällige resurface-Issues ──────────────────────────────────────────────
  resurface)
    echo "=== Issues mit resurface:* Labels ==="
    gh issue list --limit 100 \
      --json number,title,labels \
      --jq '
        .[]
        | select(any(.labels[]; .name | startswith("resurface:")))
        | "#\(.number)  \(.title)  (\(.labels | map(select(.name | startswith("resurface:"))) | .[0].name))"
      '
    ;;

  # ── Stage-Zählungen + Milestone-Stand ────────────────────────────────────
  status)
    echo "=== Stage-Übersicht ==="
    for stage in "stage:inbox" "stage:backlog" "stage:planned" "stage:in-progress"; do
      count=$(gh issue list --label "$stage" --json number --jq 'length')
      printf "  %-22s %s\n" "$stage:" "$count"
    done

    echo ""
    echo "=== Aktive Milestones ==="
    gh api "repos/$OWNER/$REPO/milestones" \
      --jq '
        .[]
        | select(.state == "open")
        | "  \(.title): \(.closed_issues)/\(.open_issues + .closed_issues) done  (offen: \(.open_issues))"
      '
    ;;

  # ── Stage-Label tauschen ──────────────────────────────────────────────────
  stage-move)
    issue="${1:-}"; new_stage="${2:-}"
    [[ -z "$issue" || -z "$new_stage" ]] && {
      echo "Usage: roadmap.sh stage-move <issue-nr> <neues-stage-label>" >&2
      exit 1
    }
    for s in inbox backlog planned in-progress; do
      gh issue edit "$issue" --remove-label "stage:$s" 2>/dev/null || true
    done
    gh issue edit "$issue" --add-label "$new_stage"
    echo "Issue #$issue → $new_stage"
    ;;

  # ── Hilfe ─────────────────────────────────────────────────────────────────
  *)
    cat <<'HELP'
roadmap.sh — roadmap-triage Hilfsskript

Befehle:
  setup-labels                Labels idempotent anlegen (einmalig)
  capture "<titel>"           Neue Idee als stage:inbox Issue erfassen
  inbox                       Alle stage:inbox Issues anzeigen
  backlog-ranked              Backlog nach WSJF-Score absteigend
  resurface                   Issues mit resurface:* Labels
  status                      Stage-Zählungen + Milestone-Fortschritt
  stage-move <nr> <stage>     Stage-Label tauschen
HELP
    ;;
esac
