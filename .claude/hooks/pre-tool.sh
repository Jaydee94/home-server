#!/usr/bin/env bash
# PreToolUse-Hook. Warnt bei destruktiven Befehlen und fehlender Recherche.
# Blockiert nie — Entscheidung liegt beim Agenten.

STDIN_JSON=""
if [ ! -t 0 ]; then
  STDIN_JSON=$(cat)
fi

if command -v forgecrate >/dev/null 2>&1; then
  # Destruktive-Befehl-Warnung (alle Branches)
  OUT=$(printf '%s' "$STDIN_JSON" | forgecrate hook pre-tool)
  if [ -n "$OUT" ]; then
    printf '%s' "$OUT"
  fi

  # Recherche-Empfehlung: warnt bei Edit/Write/MultiEdit ohne vorherige Recherche
  DECISION=$(printf '%s' "$STDIN_JSON" | forgecrate hook require-research)
  if [ -n "$DECISION" ]; then
    printf '%s' "$DECISION"
  fi
fi
