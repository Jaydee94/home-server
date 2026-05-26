# Active Context

## Aktueller Branch
claude/open-issues-batch-pr-rNHG0

## Aktueller Fokus
Batch-Bearbeitung der offenen Review-Issues aus Epic #34 in einem gemeinsamen PR
(#35, #37, #38, #39, #40, #42, #43, #44, #45). #36 und #41 waren bereits
geschlossen.

## Erledigt in diesem Branch
- #35 Scanner-Healthcheck: nicht-invasive USB-Presence-Probe via `lsusb -d
      <vendor>:<product>` statt `sudo -u saned scanimage -L` (sudo scheitert an
      NoNewPrivileges, scanimage an LIBUSB_ERROR_BUSY). `usbutils` ergänzt.
- #37 Tailscale: Codename dynamisch via `ansible_distribution_release`
      (overridebar `tailscale_repo_codename`). 26.04 = resolute, von Tailscale
      publiziert.
- #38 Doppelte ip_forward-sysctl aus tailscale entfernt — `common` ist Owner.
- #39 dnsmasq: systemd-resolved-Drop-in (DNS=static, FallbackDNS=gateway,
      Domains=~.) + Stub-Symlink statt direktem /etc/resolv.conf-Overwrite.
- #40 ArgoCD-Bootstrap: Single source = .j2-Template; committed manifest ist
      generiertes Artefakt (`make render-bootstrap`); revision HEAD -> main.
- #42 CI-Lint-Pipeline `.github/workflows/lint.yml` + `make lint` über ALLE
      Charts (helm dependency build bei Charts mit deps).
- #43 pre-tool.sh liest PreToolUse-Daten als stdin-JSON via jq
      (.tool_name/.tool_input.command) statt nicht-existenter Env-Vars;
      Redirection-Regex schliesst 2>&1 aus; Regressionstests ergänzt.
- #44 no_log in semaphore_secrets (admin-pw, AEK, SSH-privkey); ArgoCD-Passwort-
      debug redigiert (Retrieval-Kommando, Flag argocd_show_initial_password).
- #45 Hygiene: swapoff gated, swap.target ohne Loop, modprobe-Loop,
      auto_upgrade|bool in dnsmasq/scanner, Inventory-Kommentar 24.04->26.04,
      totes autoscaling im whoami-Chart entfernt.

## Investigation-Ergebnisse
- Headlamp `token-secret.yaml`: bewusst angelegtes langlebiges SA-Token
      (k8s >=1.24 erzeugt keine Token-Secrets automatisch) -> behalten.
- Makefile `clean`: Collection-Pfade {ansible,community,kubernetes} decken
      requirements.yml (ansible.posix, community.general, kubernetes.core) ab
      -> keine Änderung nötig.

## Offene Fragen / Blocker
- helm lokal nicht installiert -> `helm lint` der Charts nur via CI verifizierbar.
