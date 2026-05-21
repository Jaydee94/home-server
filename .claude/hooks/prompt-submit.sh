#!/usr/bin/env bash
# Erinnerung an Pflicht-Skills — wird bei jeder User-Nachricht ausgegeben.
# Schlank halten: nur wenige Zeilen, vollständig cached nach erster Ausführung.

if command -v forgecrate >/dev/null 2>&1; then
  forgecrate hook prompt-submit
else
  echo "## forgecrate — Aktive Konfiguration"
  echo "Profil: unbekannt | Flavors: keine"
  echo ""
  echo "Pflicht-Skills: brainstorming → tdd → verification-before-completion | debugging bei Bugs"
  echo "Recherche beim Planen: WebSearch/context7/fetch nutzen — nicht raten"
fi
