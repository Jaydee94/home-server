#!/usr/bin/env bash
# Test-Skript für pre-tool.sh Bash-Schutz auf main/master
# Dokumentiert geblockte vs. erlaubte Befehle
# Aufruf: bash base/hooks/pre-tool-test.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$SCRIPT_DIR/pre-tool.sh"
PASS=0
FAIL=0

run_hook() {
  local input="$1"
  TOOL_INPUT="$input" CLAUDE_TOOL_NAME="Bash" bash "$HOOK"
}

assert_blocked() {
  local desc="$1"
  local input="$2"
  local output
  output=$(run_hook "$input")
  if echo "$output" | grep -q '"continue": false'; then
    printf "[PASS] GEBLOCKT: %s\n" "$desc"
    PASS=$((PASS + 1))
  else
    printf "[FAIL] ERWARTET GEBLOCKT: %s\n  Input:  %s\n  Output: %s\n" "$desc" "$input" "$output"
    FAIL=$((FAIL + 1))
  fi
}

assert_allowed() {
  local desc="$1"
  local input="$2"
  local output
  output=$(run_hook "$input")
  if echo "$output" | grep -q '"continue": false'; then
    printf "[FAIL] ERWARTET ERLAUBT: %s\n  Input:  %s\n  Output: %s\n" "$desc" "$input" "$output"
    FAIL=$((FAIL + 1))
  else
    printf "[PASS] ERLAUBT: %s\n" "$desc"
    PASS=$((PASS + 1))
  fi
}

# Simuliere main-Branch via temporäres Git-Repo
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT
cd "$TMPDIR"
git init -q
git checkout -q -b main
export GIT_DIR="$TMPDIR/.git"
export GIT_WORK_TREE="$TMPDIR"

echo "=== GEBLOCKTE Befehle auf main ==="

assert_blocked "git commit direkt"                  "git commit -am 'fix'"
assert_blocked "git commit mit Semikolon"           "echo x; git commit -m 'msg'"
assert_blocked "git push origin main"               "git push origin main"
assert_blocked "git push --force"                   "git push --force origin"
assert_blocked "git push -f"                        "git push -f origin main"
assert_blocked "git reset --hard"                   "git reset --hard HEAD"
assert_blocked "git reset --hard mit Commit"        "git reset --hard abc123"
assert_blocked "git clean -f"                       "git clean -f"
assert_blocked "git clean -fd"                      "git clean -fd"
assert_blocked "Schreib-Redirektion in Datei"       "echo x >> README.md"
assert_blocked "Schreib-Redirektion mit >"          "echo y > config.yaml"

echo ""
echo "=== ERLAUBTE Befehle auf main ==="

assert_allowed "git status (read-only)"             "git status"
assert_allowed "git log (read-only)"                "git log --oneline"
assert_allowed "git diff (read-only)"               "git diff HEAD"
assert_allowed "git fetch (kein push)"              "git fetch origin"
assert_allowed "git branch --show-current"          "git branch --show-current"
assert_allowed "go test (kein git)"                 "go test ./..."
assert_allowed "Redirektion nach /tmp/"             "echo x >> /tmp/debug.log"
assert_allowed "grep (lesen)"                       "grep -r 'TODO' ."
assert_allowed "cat (lesen)"                        "cat README.md"

echo ""
echo "=== Ergebnis ==="
printf "Bestanden: %d  Fehlgeschlagen: %d\n" "$PASS" "$FAIL"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
