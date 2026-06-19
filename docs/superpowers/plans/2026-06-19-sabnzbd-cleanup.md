# SABnzbd-Cleanup — incomplete auf SSD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SABnzbd entpackt auf einer lokalen SSD-PVC statt auf dem SMB-Mount, sodass `complete/` nach erfolgreichem *arr-Import dauerhaft rückstandsfrei bleibt (keine RAR-/`_UNPACK_`-Leichen mehr).

**Architecture:** Eine neue local-path-PVC `sabnzbd-incomplete` (100Gi, RWO) wird ausschließlich im SABnzbd-Pod unter `/incomplete-downloads` gemountet. Download/Repair/Unpack laufen lokal auf SSD; nur das fertige Medium wird auf den SMB-Mount `complete/` geschrieben, von wo *arr per Same-FS-Move in die Bibliothek importiert. SABnzbd- und *arr-Aufräum-Settings werden per UI gesetzt und in `docs/21-media-stack.md` dokumentiert.

**Tech Stack:** Helm (lokales Chart `argocd/apps/media/`), ArgoCD, k3s local-path-provisioner, csi-driver-smb, SABnzbd/Sonarr/Radarr (linuxserver.io).

---

## File Structure

- `argocd/apps/media/values.yaml` — neuer `incomplete:`-Block (enabled/storageClass/size).
- `argocd/apps/media/templates/storage.yaml` — neue PVC `sabnzbd-incomplete` (conditional auf `incomplete.enabled`).
- `argocd/apps/media/templates/sabnzbd.yaml` — zusätzlicher volumeMount + volume (conditional).
- `docs/21-media-stack.md` — neuer Abschnitt „Aufräumen / Cleanup".

Verifikation erfolgt über `helm template` / `helm lint` (kein Unit-Test-Framework im Repo); jede Code-Task schreibt zuerst den fehlschlagenden Render-Check.

---

### Task 1: incomplete-PVC + Werte hinzufügen

**Files:**
- Modify: `argocd/apps/media/values.yaml`
- Modify: `argocd/apps/media/templates/storage.yaml`

- [ ] **Step 1: Render-Check schreiben/ausführen, der fehlschlägt**

Run:
```bash
helm template media argocd/apps/media | grep -q 'name: sabnzbd-incomplete' \
  && echo FOUND || echo MISSING
```
Expected: `MISSING` (PVC existiert noch nicht).

- [ ] **Step 2: `incomplete:`-Block in `values.yaml` ergänzen**

In `argocd/apps/media/values.yaml` direkt **nach** dem `config:`-Block (Zeile ~33–34, nach `storageClass: local-path`) einfügen:

```yaml
# SABnzbd temp/unpack folder on the node SSD (NOT on SMB). Unpacking over CIFS
# is slow and leaves stuck _UNPACK_ folders on pod restarts; doing it on local
# local-path storage keeps complete/ on SMB clean. SAB's "Temporary Download
# Folder" must be pointed at /incomplete-downloads in the UI (see docs/21).
incomplete:
  enabled: true
  storageClass: local-path
  size: 100Gi
```

- [ ] **Step 3: PVC-Template in `storage.yaml` ergänzen**

Am **Ende** von `argocd/apps/media/templates/storage.yaml` anhängen:

```yaml
---
{{- if .Values.incomplete.enabled }}
# SABnzbd temp/unpack space on the node SSD (local-path), SABnzbd-only.
# Keeps RAR repair/unpack off the SMB mount so complete/ stays clean.
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: sabnzbd-incomplete
  labels:
    {{- include "media.labels" "sabnzbd" | nindent 4 }}
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: {{ .Values.incomplete.storageClass }}
  resources:
    requests:
      storage: {{ .Values.incomplete.size }}
{{- end }}
```

- [ ] **Step 4: Render-Check ausführen, der jetzt besteht**

Run:
```bash
helm template media argocd/apps/media | grep -q 'name: sabnzbd-incomplete' \
  && echo FOUND || echo MISSING
```
Expected: `FOUND`.

- [ ] **Step 5: Conditional verifizieren (enabled:false rendert keine PVC)**

Run:
```bash
helm template media argocd/apps/media --set incomplete.enabled=false \
  | grep -c 'name: sabnzbd-incomplete'
```
Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add argocd/apps/media/values.yaml argocd/apps/media/templates/storage.yaml
git commit -m "feat(media): add local-path PVC for SABnzbd incomplete/unpack"
```

---

### Task 2: incomplete-Volume in den SABnzbd-Pod mounten

**Files:**
- Modify: `argocd/apps/media/templates/sabnzbd.yaml`

- [ ] **Step 1: Render-Check schreiben/ausführen, der fehlschlägt**

Run:
```bash
helm template media argocd/apps/media \
  | grep -q 'mountPath: /incomplete-downloads' && echo FOUND || echo MISSING
```
Expected: `MISSING`.

- [ ] **Step 2: volumeMount ergänzen**

In `argocd/apps/media/templates/sabnzbd.yaml` den `volumeMounts:`-Block (aktuell Zeilen 60–64) so erweitern:

```yaml
          volumeMounts:
            - name: config
              mountPath: /config
            - name: media
              mountPath: /data
            {{- if .Values.incomplete.enabled }}
            - name: incomplete
              mountPath: /incomplete-downloads
            {{- end }}
```

- [ ] **Step 3: volume ergänzen**

Im selben File den `volumes:`-Block (aktuell Zeilen 65–71) so erweitern:

```yaml
      volumes:
        - name: config
          persistentVolumeClaim:
            claimName: sabnzbd-config
        - name: media
          persistentVolumeClaim:
            claimName: mediastack-data
        {{- if .Values.incomplete.enabled }}
        - name: incomplete
          persistentVolumeClaim:
            claimName: sabnzbd-incomplete
        {{- end }}
```

- [ ] **Step 4: Render-Check ausführen, der jetzt besteht**

Run:
```bash
helm template media argocd/apps/media \
  | grep -q 'mountPath: /incomplete-downloads' && echo FOUND || echo MISSING
```
Expected: `FOUND`.

- [ ] **Step 5: Conditional-Konsistenz prüfen (mount+volume entfallen gemeinsam)**

Run:
```bash
helm template media argocd/apps/media --set incomplete.enabled=false \
  | grep -c -e 'name: incomplete' -e 'claimName: sabnzbd-incomplete'
```
Expected: `0` (kein dangling volumeMount → Pod-Spec bleibt valide).

- [ ] **Step 6: Commit**

```bash
git add argocd/apps/media/templates/sabnzbd.yaml
git commit -m "feat(media): mount SABnzbd incomplete PVC at /incomplete-downloads"
```

---

### Task 3: Lint grün

**Files:** keine (Verifikation)

- [ ] **Step 1: helm lint**

Run:
```bash
helm lint argocd/apps/media
```
Expected: `1 chart(s) linted, 0 chart(s) failed`.

- [ ] **Step 2: yamllint auf das geänderte Chart**

Run:
```bash
yamllint argocd/apps/media/values.yaml argocd/apps/media/templates/storage.yaml \
  argocd/apps/media/templates/sabnzbd.yaml
```
Expected: keine Ausgabe (Exit 0). Falls Zeilenlängen-Warnungen: Kommentare umbrechen.

- [ ] **Step 3: Vollständiger Render ohne Fehler**

Run:
```bash
helm template media argocd/apps/media >/dev/null && echo OK
```
Expected: `OK`.

---

### Task 4: Doku-Abschnitt „Aufräumen / Cleanup"

**Files:**
- Modify: `docs/21-media-stack.md`

- [ ] **Step 1: Abschnitt einfügen**

In `docs/21-media-stack.md` **nach** Abschnitt „## 6. Import-Verhalten (Move, nicht Hardlink)" (vor „## Troubleshooting") einfügen:

````markdown
## 7. Aufräumen / Cleanup (keine RAR-Reste in complete/)

Damit `complete/` nach jedem Import rückstandsfrei bleibt, müssen **drei** Dinge
zusammenspielen — sonst sammeln sich RAR-, par2- und `_UNPACK_`-Reste an.

### Folder-Architektur: Unpack auf SSD, nicht auf SMB

SABnzbd entpackt **nicht** auf dem SMB-Mount (langsam, bricht bei Pod-Restarts ab
→ steckengebliebene `_UNPACK_`-Ordner und Retry-Dubletten), sondern auf einer
lokalen **local-path-SSD-PVC** (`sabnzbd-incomplete`, gemountet als
`/incomplete-downloads`, siehe `values.yaml → incomplete`):

```
Download + par2-Repair + Unpack  →  /incomplete-downloads     (SSD, local-path)
fertiges Medium                  →  /data/downloads/complete   (SMB)
*arr-Import (same-FS move)        →  /data/movies | /data/shows (SMB)
```

In **SABnzbd → Config → Folders**:
- *Temporary Download Folder* = `/incomplete-downloads`
- *Completed Download Folder* = `/data/downloads/complete`

### SABnzbd Post-Processing + Cleanup-Liste

**Config → Switches → Post-Processing**:
- Default-Post-Processing = **+Delete** (entpacken **und** Archive löschen).
- *Direct Unpack* = **an**.

**Config → Switches → Cleanup List**: `nfo,sfv,srr,par2,jpg,nzb,sub,idx`
⚠️ **niemals** `mkv`/`mp4`/`avi` aufnehmen (löscht sonst die Videos). Hinweis:
Die Cleanup-Liste entfernt nur **direkt heruntergeladene** Dateien, keine aus RAR
entpackten — deshalb ist das *arr-Remove unten zwingend ergänzend.

### Sonarr/Radarr: Completed Download Handling

**Settings → Download Clients → SABnzbd**:
- **Category** setzen: Sonarr `tv`, Radarr `movies`.
- *Completed Download Handling → Remove* = **an** — entfernt nach dem Import die
  ganze Job-Hülle (samt par2/nfo-Resten) aus `complete/`.

### Einmaliges Aufräumen des Altbestands

```sh
# 1. SAB-Queue pausieren (UI) und aktive Downloads prüfen, damit nichts
#    Laufendes getroffen wird.
# 2. Steckengebliebene/verwaiste Ordner zählen:
ssh jaydee@192.168.178.127 'sudo kubectl -n media exec deploy/sabnzbd -- \
  sh -c "find /data/downloads/complete -iname \"*.rar\" | wc -l"'
# 3. _UNPACK_- und Dubletten-Ordner löschen (nach Sichtprüfung):
ssh jaydee@192.168.178.127 'sudo kubectl -n media exec deploy/sabnzbd -- \
  sh -c "rm -rf /data/downloads/complete/_UNPACK_* "'
# 4. Restliche bereits importierte Hüllen entfernen und SAB-History leeren (UI).
```
````

- [ ] **Step 2: Markdown-Lint/Sichtprüfung**

Run:
```bash
yamllint -d relaxed docs/21-media-stack.md 2>/dev/null; echo "review done"
```
(`docs/` ist nicht im yamllint-Scope — Schritt dient nur der Sichtprüfung, dass
die Code-Fences sauber geschlossen sind.)

- [ ] **Step 3: Commit**

```bash
git add docs/21-media-stack.md
git commit -m "docs(media): document SABnzbd cleanup + SSD-incomplete layout"
```

---

### Task 5: Deploy + Post-Deploy-Verifikation (Runbook)

**Files:** keine (operativ — nach Merge auf `main`, ArgoCD synct automatisch)

- [ ] **Step 1: PR mergen, ArgoCD-Sync abwarten (~3 min)**

Run:
```bash
ssh jaydee@192.168.178.127 'sudo kubectl -n media get pvc sabnzbd-incomplete'
```
Expected: `STATUS: Bound`.

- [ ] **Step 2: Mount im Pod prüfen**

Run:
```bash
ssh jaydee@192.168.178.127 'sudo kubectl -n media exec deploy/sabnzbd -- \
  df -h /incomplete-downloads'
```
Expected: ein Eintrag für `/incomplete-downloads` (local-path, nicht CIFS).

- [ ] **Step 3: SAB-UI konfigurieren**

Folders → Temporary Download Folder = `/incomplete-downloads`;
Switches → pp default = +Delete, Direct Unpack = an,
Cleanup List = `nfo,sfv,srr,par2,jpg,nzb,sub,idx`. Speichern.

- [ ] **Step 4: *arr-UI konfigurieren**

Sonarr (Category `tv`) und Radarr (Category `movies`): Completed Download
Handling → Remove = an.

- [ ] **Step 5: Altbestand einmalig aufräumen** (siehe Doku-Abschnitt 7).

- [ ] **Step 6: End-to-End-Test**

Einen Test-Download über Sonarr/Radarr anstoßen und prüfen:
```bash
# Unpack passiert auf SSD:
ssh jaydee@192.168.178.127 'sudo kubectl -n media exec deploy/sabnzbd -- \
  ls -la /incomplete-downloads'
# Nach Import: keine RARs mehr in complete/:
ssh jaydee@192.168.178.127 'sudo kubectl -n media exec deploy/sabnzbd -- \
  sh -c "find /data/downloads/complete -iname \"*.rar\" | wc -l"'
```
Expected: während Download Aktivität in `/incomplete-downloads`; nach Import
RAR-Count `0` und Job-Hülle weg.

---

## Self-Review

- **Spec-Coverage:** Architektur-Änderung (Task 1+2), SAB-Settings (Task 4+5),
  *arr-Settings (Task 4+5), Altbestand-Cleanup (Task 4+5), Doku (Task 4),
  Verifikation (Task 3+5). Alle Spec-Abschnitte abgedeckt.
- **Placeholder-Scan:** keine TBD/TODO; alle Code-Blöcke vollständig.
- **Konsistenz:** PVC-Name `sabnzbd-incomplete`, Volume-Name `incomplete`,
  mountPath `/incomplete-downloads`, Values-Key `incomplete.{enabled,storageClass,size}`
  durchgängig identisch in Task 1/2/5.
- **Edge Case `incomplete.enabled: false`:** Task 1 Step 5 + Task 2 Step 5 prüfen,
  dass PVC **und** Mount/Volume gemeinsam entfallen (kein dangling volumeMount).
