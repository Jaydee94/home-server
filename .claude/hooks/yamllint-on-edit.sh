#!/bin/bash
# Run yamllint after Claude edits a YAML file.
file=$(echo "$CLAUDE_TOOL_INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('file_path',''))" 2>/dev/null)

# Only act on .yml / .yaml files
[[ "$file" == *.yml || "$file" == *.yaml ]] || exit 0

# Skip Helm templates (yamllint can't parse {{ }} syntax)
[[ "$file" == */templates/* ]] && exit 0

yamllint -c /home/jaydee/git/home-server/.yamllint "$file"
