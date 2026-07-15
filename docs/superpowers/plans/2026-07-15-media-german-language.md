# Plan: Media-Stack — Deutsch erzwingen + Bestand nachträglich auf Deutsch

Datum: 2026-07-15

## Problem

Der Media-Stack (Sonarr/Radarr via Prowlarr/SABnzbd) lud teils englische
Releases, weil keinerlei Sprach-Logik konfiguriert war. Gewünscht: **strikt
Deutsch** (kein Englisch-Fallback), rückwirkendes Upgrade des Bestands,
Qualitäten 720p/1080p/4K, GitOps-reproduzierbar.

## Entscheidung

**Recyclarr als CronJob** im Media-Chart (`argocd/apps/media/`), der die
offiziellen TRaSH-Guide-German-Templates nach Sonarr + Radarr synct:

- Includes: `sonarr-v4-{custom-formats,quality-profile}-uhd-bluray-web-german`
  + `sonarr-quality-definition-series`; Radarr analog
  (`radarr-*-uhd-bluray-web-german`, `radarr-quality-definition-movie`).
- Profil „UHD Bluray + WEB (GER)" mit gemergter Quality-Gruppe („Merged QPs"),
  erweitert auf 2160p+1080p+720p (dokumentierte Upstream-Alternative) — der
  German-CF-Score entscheidet über Upgrades, nicht die Auflösung.
- Striktheit: `min_format_score: 10000` (Upstream-Option „skip English
  Releases") — englisch-only Releases sind nicht grabbar.
- API-Keys aus dem bestehenden SealedSecret `media-api-keys` via `!env_var`.
- Image `ghcr.io/recyclarr/recyclarr:8.6.0`, gepinnt + Renovate-Kommentar
  (Regex-CustomManager verifiziert).

Bestands-Upgrade + Restschritte (Profil-Zuweisung, Seerr-Default, Mass-Search,
Jellyfin-Audiosprache, Indexer-Check) sind manuelle UI-Schritte —
dokumentiert in `docs/21-media-stack.md`, Abschnitt 9.

## Verworfene Alternative

Manuelle UI-Konfiguration nach TRaSH-Guide: kein neues Deployment, aber nicht
reproduzierbar (geht bei Config-PVC-Verlust verloren) und driftet — Recyclarr
passt zur GitOps-Philosophie des Repos.

## Quellen

- TRaSH-Guides „How to set up Quality Profiles (German)":
  https://trash-guides.info/Sonarr/sonarr-setup-quality-profiles-german-en/
  (Merged-Qualities-Prinzip; „Minimum Custom Format Score = 10k" für
  German-only; Upgrade-Until-Score 35k)
- Recyclarr Quick-Setup-Templates: https://recyclarr.dev/guide/guide-configs/
- Template-Quelltexte (Stand 2025-09-07):
  https://github.com/recyclarr/config-templates —
  `sonarr/templates/german-uhd-bluray-web-v4.yml`,
  `radarr/templates/german-uhd-bluray-web.yml` (inkl. auskommentierter
  Alternative „Merged QPs 2160p/1080p/720p" und `min_format_score`-Knopf)
- Recyclarr Env-Var-Substitution (`!env_var`, seit v4.3.0):
  https://recyclarr.dev/reference/env-vars/
- Recyclarr Docker-Tags (kein `latest` mehr, Major-Tags):
  https://github.com/recyclarr/recyclarr (README, Release v8.6.0 2026-04-26)
