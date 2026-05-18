# DNS-Architektur & Ausfallsicherheit

Dieses Dokument beantwortet eine sehr berechtigte Frage:

> *"Wenn ich den Home-Server als zentralen DNS-Server für mein LAN
> eintrage und der mal ausfällt, geht zu Hause das ganze Internet weg.
> Wie verhindere ich das?"*

Kurzfassung: **Mach den Home-Server NIEMALS zum einzigen DHCP-DNS-Server
in der Fritz!Box.** Die Fritz!Box kann per DHCP nur **eine** lokale
DNS-IP verteilen — es gibt also keinen automatischen Fallback. Stattdessen
behandelst du `*.homeserver` als *opt-in*-Komfort pro Gerät.

---

## Warum die naheliegende Lösung schlecht ist

```
            ┌──────────────────────────────────────┐
            │  Fritz!Box (DHCP)                    │
            │  → "Dein DNS-Server ist 192.168...127"│
            └──────────────────────────────────────┘
                            │
                            ▼
            ┌──────────────────────────────────────┐
            │  Jedes LAN-Gerät: Smart-TV,         │
            │  IoT-Steckdose, Drucker, Telefon... │
            │  Alle fragen NUR 192.168.178.127    │
            └──────────────────────────────────────┘
                            │
                Home-Server crashed
                            │
                            ▼
            ┌──────────────────────────────────────┐
            │  Komplett-Ausfall:                   │
            │  - Kein YouTube auf dem TV           │
            │  - Heizungssteuerung tot             │
            │  - Familie ist sauer                 │
            └──────────────────────────────────────┘
```

- Die Fritz!Box **kann nur einen** lokalen DNS-Server per DHCP
  verteilen ([AVM Wissensdatenbank][avm-dns], bestätigt in mehreren
  Community-Threads).
- Das "Alternative DNSv4 server"-Feld in der Fritz!Box ist für die
  **Fritz!Box selbst** (externe Auflösung), wird **nicht** an die
  Clients weitergereicht.
- Selbst wenn die Fritz!Box zwei Server verteilen könnte: das
  Fallback-Verhalten von Windows/Linux/macOS-Clients ist nicht
  konsistent (Windows ~1s, Linux ~5s, manche Devices erkennen den
  Ausfall gar nicht oder cachen).

→ Wer den Home-Server zum *einzigen* DNS für alles macht, hängt sein
gesamtes Heimnetz an dessen Uptime.

---

## Die richtige Architektur

```
┌───────────────────────────────────────────────────────────────────┐
│  Fritz!Box bleibt unverändert der DHCP-DNS für alle LAN-Geräte    │
└───────────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
   ┌──────────────────────┐    ┌──────────────────────────┐
   │  Geräte OHNE Bedarf  │    │  Geräte MIT Bedarf an    │
   │  für *.homeserver    │    │  *.homeserver-Hostnames  │
   │  (TV, IoT, Drucker)  │    │  (dein Laptop, Handy)    │
   └──────────────────────┘    └──────────────────────────┘
              │                           │
              ▼                           ▼
       Fritz!Box-DNS               (siehe drei Wege unten)
              │                           │
              ▼                           ▼
            Internet                  *.homeserver
                                      + Internet
```

Wenn der Home-Server ausfällt:
- "Geräte ohne Bedarf" → merken **nichts**, Internet läuft weiter.
- "Geräte mit Bedarf" → `*.homeserver` schlägt fehl, aber Internet
  läuft (je nach gewähltem Weg sofort oder nach kurzem Timeout).

---

## Die drei Wege für deine Power-User-Geräte

### Weg 1: Tailscale Split DNS (empfohlen)

Dein Laptop und dein Handy haben sowieso schon Tailscale, weil du
remote auf den Server willst. Tailscale Split DNS löst beide
Probleme gleichzeitig:

- Auf jedem Tailscale-Client zusätzlich `*.homeserver`-Auflösung.
- Funktioniert auch zu Hause am LAN, weil Tailscale automatisch direkt
  über das LAN routet, wenn beide Peers im selben Netz sind.
- Fritz!Box bleibt unangetastet.
- Home-Server down → Tailscale-Client fragt für `*.homeserver` ins
  Leere (NXDOMAIN nach kurzem Timeout), alle anderen DNS-Queries
  laufen ganz normal über die Fritz!Box.

**Setup**: einmaliger Admin-Console-Schritt, beschrieben in
[docs/08-semaphore.md → Zugriff über Tailscale](08-semaphore.md#zugriff-über-tailscale-einmaliger-admin-schritt).

**Verfügbarkeit**: macOS, Windows, Linux, iOS, Android — überall wo
Tailscale läuft, was praktisch jedes moderne Gerät ist.

### Weg 2: Pro Gerät manuell zweiten DNS-Server eintragen

Wenn ein bestimmtes Gerät kein Tailscale haben soll (z.B. ein
Familien-Tablet), trägst du dort manuell zwei DNS-Server in den
WLAN-Einstellungen ein:

- **Primär**: `192.168.178.127` (Home-Server / dnsmasq)
- **Sekundär**: `192.168.178.1` (Fritz!Box)

Verhalten:
- Home-Server up → `*.homeserver` und alles andere laufen schnell
  über dnsmasq (Internet-Queries forwarded an die Fritz!Box).
- Home-Server down → das Gerät timed out nach ~5 s und nutzt
  automatisch die Fritz!Box. `*.homeserver` schlägt fehl, alles
  andere geht normal.

**Wo eingetragen?**
- macOS: *Systemeinstellungen → Netzwerk → WLAN → Details → DNS*
- Windows: *Netzwerk- und Internet-Einstellungen → WLAN →
  Hardwareeigenschaften → DNS-Server-Zuweisung → Bearbeiten*
- Linux (NetworkManager): `nmcli con modify <verbindung> ipv4.dns
  "192.168.178.127 192.168.178.1"` + `ipv4.ignore-auto-dns yes`
- iOS: *Einstellungen → WLAN → Netzwerk → DNS konfigurieren →
  Manuell*
- Android: *WLAN-Einstellungen → Erweitert → IP-Einstellungen →
  Statisch* (oder über Private-DNS-Funktion, abhängig von Version)

### Weg 3: `/etc/hosts`-Einträge (Linux/macOS) bzw. `hosts`-Datei (Windows)

Für einzelne, langlebige Hostnamen — wenn du es ganz statisch willst:

```
192.168.178.127  semaphore.homeserver argocd.homeserver headlamp.homeserver
```

Vorteil: funktioniert auch wenn der dnsmasq down ist (das ist halt
eine lokale Datei, kein Netzwerk-Lookup).
Nachteil: musst du auf jedem Gerät pflegen und bei jedem neuen
Service ergänzen.

---

## Was passiert eigentlich am Home-Server selbst?

Der Home-Server hat zwei DNS-Einträge in seiner `/etc/resolv.conf`:

```
nameserver 192.168.178.127   # dnsmasq (sich selbst)
nameserver 192.168.178.1     # Fritz!Box (Fallback)
```

→ Eigene Auflösung läuft schnell über das lokale dnsmasq. Falls dnsmasq
crasht, fällt der Server selbst nach ~5 s auf die Fritz!Box zurück und
bleibt funktional.

---

## Was ist mit der "Local DNS server"-Option in der Fritz!Box?

```
Fritz!Box → Heimnetz → Netzwerk → Netzwerkeinstellungen →
"Lokaler DNS-Server"
```

**Lass das Feld leer.** Wenn du dort `192.168.178.127` einträgst,
verteilt die Fritz!Box den Home-Server als einzigen DNS-Server an alle
LAN-Geräte per DHCP — genau das Single-Point-of-Failure-Szenario, das
wir vermeiden wollen.

---

## TL;DR Entscheidungsbaum

```
Brauche ich *.homeserver auf diesem Gerät?
 │
 ├── Nein → nichts tun. Fritz!Box-DNS reicht.
 │
 └── Ja → Hat das Gerät Tailscale?
      │
      ├── Ja → Tailscale Split DNS aktivieren (1× im Tailscale-Admin)
      │
      └── Nein → DNS-Server am Gerät manuell auf
                 192.168.178.127 + 192.168.178.1 setzen
```

[avm-dns]: https://en.fritz.com/service/knowledge-base/dok/FRITZ-Box-7590/165_Configuring-different-DNS-servers-in-the-FRITZ-Box/
