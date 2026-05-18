---
name: project-os-ubuntu26
description: Host OS is Ubuntu 26.04 LTS, not 24.04 — relevant for Ansible role assumptions and docs
metadata:
  type: project
---

Host runs Ubuntu 26.04 LTS.

**Why:** User confirmed directly; CLAUDE.md was previously referencing 24.04 from the README.

**How to apply:** When writing or reviewing Ansible tasks, package names, or documentation that mention the OS version, use Ubuntu 26.04 LTS.
