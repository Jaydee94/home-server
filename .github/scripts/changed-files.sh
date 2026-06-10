#!/usr/bin/env bash
# Emit the list of files (or Helm charts) changed in the current PR / push as a
# GitHub Actions step output. Usage: changed-files.sh <yaml|charts>
#
#   yaml   -> files=<space-separated changed *.yml/*.yaml paths>
#   charts -> charts=<space-separated argocd/apps/<name>/ dirs with a Chart.yaml>
#
# The diff range is derived from the GitHub event:
#   pull_request -> merge-base(<base branch>, HEAD)..HEAD
#   push         -> <event.before>..HEAD  (falls back to HEAD~1)
#   local        -> HEAD~1..HEAD
set -euo pipefail

mode="${1:?usage: changed-files.sh <yaml|charts>}"

resolve_range() {
  case "${GITHUB_EVENT_NAME:-local}" in
    pull_request)
      git fetch --no-tags --quiet origin \
        "+refs/heads/${GITHUB_BASE_REF}:refs/remotes/origin/${GITHUB_BASE_REF}"
      echo "$(git merge-base "origin/${GITHUB_BASE_REF}" HEAD) HEAD"
      ;;
    push)
      before="$(jq -r '.before // empty' "${GITHUB_EVENT_PATH}")"
      if [ -z "${before}" ] || [ "${before}" = "0000000000000000000000000000000000000000" ] \
         || ! git cat-file -e "${before}^{commit}" 2>/dev/null; then
        before="$(git rev-parse HEAD~1 2>/dev/null || git rev-parse HEAD)"
      fi
      echo "${before} HEAD"
      ;;
    *)
      echo "$(git rev-parse HEAD~1 2>/dev/null || git rev-parse HEAD) HEAD"
      ;;
  esac
}

read -r base head <<<"$(resolve_range)"

# Added/Copied/Modified/Renamed — skip deletions (the file no longer exists).
changed="$(git diff --name-only --diff-filter=ACMR "${base}" "${head}")"

case "${mode}" in
  yaml)
    files="$(printf '%s\n' "${changed}" \
      | grep -E '\.ya?ml$' \
      | grep -Ev '^argocd/apps/[^/]+/templates/' \
      | tr '\n' ' ' \
      | sed 's/ *$//')"
    echo "files=${files}"
    ;;
  charts)
    charts="$(printf '%s\n' "${changed}" \
      | sed -nE 's#^(argocd/apps/[^/]+/).*#\1#p' \
      | sort -u \
      | while read -r dir; do [ -f "${dir}Chart.yaml" ] && printf '%s\n' "${dir}"; done \
      | tr '\n' ' ' \
      | sed 's/ *$//')"
    echo "charts=${charts}"
    ;;
  *)
    echo "unknown mode: ${mode}" >&2
    exit 2
    ;;
esac
