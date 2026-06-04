#!/usr/bin/env bash
# PreToolUse-Hook. Warnt bei destruktiven Befehlen und fehlender Recherche.
# Blockiert nie — Entscheidung liegt beim Agenten.

STDIN_JSON=""
if [ ! -t 0 ]; then
  STDIN_JSON=$(cat)
fi

if command -v forgecrate >/dev/null 2>&1; then
  # Destruktive-Befehl-Warnung (alle Branches)
  # forgecrate älterer Versionen gibt {"continue":false,...} zurück — in Warnung umwandeln
  OUT=$(printf '%s' "$STDIN_JSON" | forgecrate hook pre-tool)
  if [ -n "$OUT" ]; then
    if command -v jq >/dev/null 2>&1 && printf '%s' "$OUT" | jq -e '.continue == false' >/dev/null 2>&1; then
      REASON=$(printf '%s' "$OUT" | jq -r '.stopReason // "Destruktiver Befehl erkannt"')
      printf '%s' "$OUT" | jq --arg r "Warnung: $REASON" \
        '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$r}}'
    else
      printf '%s' "$OUT"
    fi
  fi

  # Recherche-Empfehlung: warnt bei Edit/Write/MultiEdit ohne vorherige Recherche
  DECISION=$(printf '%s' "$STDIN_JSON" | forgecrate hook require-research)
  if [ -n "$DECISION" ]; then
    printf '%s' "$DECISION"
  fi
fi
