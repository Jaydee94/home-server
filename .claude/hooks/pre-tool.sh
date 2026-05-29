#!/usr/bin/env bash
TOOL="${CLAUDE_TOOL_NAME:-}"

case "$TOOL" in
  Edit|Write|MultiEdit)
    BRANCH=$(git branch --show-current 2>/dev/null)
    if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
      printf '{"continue": false, "stopReason": "Direkte Änderungen auf main sind verboten. Branch anlegen: git checkout -b feat/<thema> — dann erst Edit/Write verwenden."}'
      exit 0
    fi
    echo '{"hookSpecificOutput": {"hookEventName": "PreToolUse", "additionalContext": "Branch-Check OK. Stelle sicher: brainstorming und tdd Skills wurden aufgerufen."}}'
    ;;
  Bash)
    BRANCH=$(git branch --show-current 2>/dev/null)
    if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
      INPUT="${TOOL_INPUT:-}"

      # git commit direkt auf main
      if echo "$INPUT" | grep -qE '(^|[;&|]|\brun\b)\s*git\s+commit\b'; then
        printf '{"continue": false, "stopReason": "Destruktiver Bash-Befehl auf main verboten: git commit. Branch anlegen: git checkout -b feat/<thema>"}'
        exit 0
      fi

      # git push --force / git push -f
      if echo "$INPUT" | grep -qE 'git\s+push\s+.*(-f\b|--force\b)'; then
        printf '{"continue": false, "stopReason": "Destruktiver Bash-Befehl auf main verboten: git push --force. Force-Push auf main ist nicht erlaubt."}'
        exit 0
      fi

      # git push origin main / git push origin master
      if echo "$INPUT" | grep -qE 'git\s+push\b.*\b(main|master)\b'; then
        printf '{"continue": false, "stopReason": "Destruktiver Bash-Befehl auf main verboten: git push ... main/master. Branch anlegen: git checkout -b feat/<thema>"}'
        exit 0
      fi

      # git reset --hard
      if echo "$INPUT" | grep -qE 'git\s+reset\s+--hard\b'; then
        printf '{"continue": false, "stopReason": "Destruktiver Bash-Befehl auf main verboten: git reset --hard."}'
        exit 0
      fi

      # git clean -f
      if echo "$INPUT" | grep -qE 'git\s+clean\s+.*-[a-zA-Z]*f'; then
        printf '{"continue": false, "stopReason": "Destruktiver Bash-Befehl auf main verboten: git clean -f."}'
        exit 0
      fi

      # Schreib-Redirectionen in versionierte Dateien (nicht /tmp/)
      if echo "$INPUT" | grep -qE '>+\s*[^/\s][^\s]*' && ! echo "$INPUT" | grep -qE '>+\s*/tmp/'; then
        printf '{"continue": false, "stopReason": "Schreib-Redirektion (> oder >>) in versionierte Datei auf main verboten. Branch anlegen oder /tmp/ verwenden."}'
        exit 0
      fi
    fi

    echo '{"hookSpecificOutput": {"hookEventName": "PreToolUse", "additionalContext": "Bash-Aufruf. Keine destruktiven Aktionen ohne Bestätigung."}}'
    ;;
esac

# GEBLOCKTE Bash-Muster auf main/master:
# - git commit (direkter Commit auf main)
# - git push [--force] origin main
# - git reset --hard
# - Schreib-Redirectionen (>> / >)
# Hinweis: Dieser Hook ist keine alleinige Schutzschicht. GitHub Branch Protection ergänzen.
