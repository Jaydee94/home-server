# Wildcard-DNS für *.homeserver — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle `*.homeserver`-Namen per Wildcard-Eintrag auf den Home-Server auflösen, sodass neue ArgoCD-Apps mit Ingress ohne manuellen DNS-Schritt erreichbar sind.

**Architecture:** dnsmasq erhält einen einzigen `address=/homeserver/<server-ip>`-Eintrag statt der bisherigen Schleife über `dnsmasq_hosts`. Traefik/k3s routet per Ingress-Hostname. Die Variable `dnsmasq_hosts` in `group_vars/all.yml` entfällt vollständig.

**Tech Stack:** Ansible, Jinja2, dnsmasq, dig (Verifikation)

---

### Task 1: dnsmasq-Template auf Wildcard umstellen

**Files:**
- Modify: `ansible/roles/dnsmasq/templates/dnsmasq.conf.j2`

- [ ] **Schritt 1: Aktuellen Template-Inhalt als Referenz notieren**

  Aktuelle Sektion (Zeilen 2–12):
  ```
  # Explizite DNS-Einträge für *.homeserver, erreichbar aus LAN und Tailnet.
  # Neue Services in group_vars/all.yml unter dnsmasq_hosts eintragen.

  # Upstream DNS: Fritz!Box
  no-resolv
  server={{ network_gateway }}

  # Pro Service ein expliziter DNS-Eintrag → {{ network_static_ip }}
  {% for host in dnsmasq_hosts %}
  address=/{{ host }}.homeserver/{{ network_static_ip }}
  {% endfor %}
  ```

- [ ] **Schritt 2: Template anpassen**

  `ansible/roles/dnsmasq/templates/dnsmasq.conf.j2` — vollständiger neuer Inhalt:
  ```
  # Managed by Ansible — do not edit manually.
  # Wildcard-DNS: alle *.homeserver-Namen → network_static_ip
  # Neue Services brauchen keinen manuellen Eintrag mehr.

  # Upstream DNS: Fritz!Box
  no-resolv
  server={{ network_gateway }}

  # Wildcard: *.homeserver und homeserver selbst → statische Server-IP
  address=/homeserver/{{ network_static_ip }}

  # bind-dynamic statt bind-interfaces, damit dnsmasq die tailscale0-Adresse
  # automatisch übernimmt, sobald tailscaled startet (kein Restart nötig).
  # - LAN-Clients fragen über die statische LAN-IP
  # - Tailnet-Clients fragen über die 100.x.y.z-Adresse von tailscale0
  # - systemd-resolved bleibt auf 127.0.0.53 unangetastet (lo wird excluded)
  bind-dynamic
  listen-address={{ network_static_ip }}
  interface=tailscale0
  except-interface=lo

  domain-needed
  bogus-priv
  ```

- [ ] **Schritt 3: Commit**

  ```bash
  git add ansible/roles/dnsmasq/templates/dnsmasq.conf.j2
  git commit -m "feat(dnsmasq): Wildcard-DNS *.homeserver statt expliziter Einträge"
  ```

---

### Task 2: `dnsmasq_hosts` aus group_vars entfernen

**Files:**
- Modify: `ansible/group_vars/all.yml`

- [ ] **Schritt 1: dnsmasq_hosts-Block entfernen**

  Den folgenden Block (ca. Zeilen 67–79) vollständig löschen:
  ```yaml
  # ---- dnsmasq DNS entries ----------------------------------
  # Jeder Eintrag wird als <name>.homeserver → network_static_ip aufgelöst.
  # Neuen Service hinzufügen: Name eintragen, `make install --tags dnsmasq` ausführen.
  dnsmasq_hosts:
    - headlamp
    - argocd
    - semaphore
    - grafana
    - kubeseal-webgui
    - gotify
  ```

- [ ] **Schritt 2: Lint prüfen**

  ```bash
  make lint
  ```
  Erwartete Ausgabe: keine Fehler. Falls `ansible-lint` über unbenutzte Variable klagt — prüfen ob `dnsmasq_hosts` noch irgendwo referenziert wird:
  ```bash
  grep -r "dnsmasq_hosts" ansible/
  ```
  Erwartete Ausgabe: keine Treffer (Variable ist jetzt vollständig entfernt).

- [ ] **Schritt 3: Commit**

  ```bash
  git add ansible/group_vars/all.yml
  git commit -m "chore(dnsmasq): dnsmasq_hosts entfernen, Wildcard macht Einträge obsolet"
  ```

---

### Task 3: Deployen und verifizieren

**Files:** keine Code-Änderungen

- [ ] **Schritt 1: Ansible-Rolle deployen**

  ```bash
  make dnsmasq
  ```
  Erwartete Ausgabe: `PLAY RECAP` ohne `failed` oder `unreachable`.

- [ ] **Schritt 2: Wildcard-Auflösung prüfen (bekannte Hosts)**

  ```bash
  dig grafana.homeserver @192.168.178.127 +short
  dig gotify.homeserver @192.168.178.127 +short
  ```
  Erwartete Ausgabe jeweils: `192.168.178.127`

- [ ] **Schritt 3: Wildcard-Auflösung prüfen (neuer fiktiver Host)**

  ```bash
  dig neuapp.homeserver @192.168.178.127 +short
  ```
  Erwartete Ausgabe: `192.168.178.127` — der Wildcard greift auch für nicht existierende Services.

- [ ] **Schritt 4: Tailnet-Auflösung prüfen (optional, falls Tailscale aktiv)**

  ```bash
  dig grafana.homeserver @100.x.y.z +short   # 100.x.y.z = Tailscale-IP des Home-Servers
  ```
  Erwartete Ausgabe: `192.168.178.127`

- [ ] **Schritt 5: Push**

  ```bash
  git push
  ```

---

### Fertig

Nach Task 3 sind alle `*.homeserver`-Namen automatisch per DNS erreichbar. Neue ArgoCD-Apps mit Ingress-Host `<name>.homeserver` funktionieren ohne weiteren Schritt.
