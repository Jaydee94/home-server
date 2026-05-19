# Design: Semaphore Vault Password Integration

## Overview

Semaphore currently cannot run the home-server playbooks because it has no access to the
Ansible Vault password. This spec describes adding a `login_password` key to the Semaphore
bootstrap role that carries the vault password, wired to every template via `vault_key_id`.

## Architecture

```
group_vars/all.yml (vault-encrypted)
  └── semaphore_vault_password
        │
        ▼
semaphore_bootstrap role (make semaphore)
  ├── Key Store: "vault-password" (type: login_password)
  │     └── password: {{ semaphore_vault_password }}
  └── Templates: vault_key_id → vault-password key ID
```

The vault password is stored once, encrypted with Ansible Vault, in `group_vars/all.yml`.
During bootstrap it is decrypted in-memory and pushed to Semaphore's key store via the REST
API. Semaphore uses it at job-run time by setting `ANSIBLE_VAULT_PASSWORD_FILE` internally.

## Components

### 1. `group_vars/all.yml` (manual step)

The user adds:
```yaml
semaphore_vault_password: !vault |
  $ANSIBLE_VAULT;1.1;AES256
  ...
```

This is the same password used with `--ask-vault-pass` when running `make install`.

### 2. `defaults/main.yml` — third default key

```yaml
semaphore_default_keys:
  - name: semaphore-ssh-key
    type: ssh
    login: jaydee
  - name: git-none
    type: none
  - name: vault-password        # NEW
    type: login_password
```

The `semaphore_vault_password` variable is referenced directly in `key.yml` for this type;
no extra field is needed in the key spec.

### 3. `tasks/key.yml` — `login_password` block

New task block appended after the existing `none` key task:

```yaml
- name: Create login_password key (vault password) in project {{ project_spec.name }}
  ansible.builtin.uri:
    url: "{{ semaphore_api_base }}/api/project/{{ project_id }}/keys"
    method: POST
    body_format: json
    body:
      name: "{{ key_spec.name }}"
      type: login_password
      project_id: "{{ project_id | int }}"
      login_password:
        login: ""
        password: "{{ semaphore_vault_password }}"
    headers:
      Cookie: "{{ semaphore_cookie }}"
    status_code: [200, 201, 204]
  no_log: true
  register: sem_vaultkey_create
  failed_when: false
  when:
    - not key_exists
    - key_spec.type == "login_password"

- name: Fail with HTTP details if vault key creation failed
  ansible.builtin.fail:
    msg: >-
      Vault key creation returned HTTP {{ sem_vaultkey_create.status }}:
      {{ sem_vaultkey_create.msg | default('') }}
  when:
    - not key_exists
    - key_spec.type == "login_password"
    - sem_vaultkey_create is not skipped
    - sem_vaultkey_create.status not in [200, 201, 204]
```

### 4. `tasks/template.yml` — `vault_key_id`

The template creation body gains:
```yaml
vault_key_id: >-
  {{ (project_key_map[template_spec.vault_key] | default(None)) | int
     if template_spec.vault_key is defined else None }}
```

### 5. `defaults/main.yml` — template specs updated

Both templates get `vault_key: vault-password`:
```yaml
templates:
  - name: "Deploy Home Server"
    playbook: ansible/site.yml
    inventory: homeservers
    vault_key: vault-password
    description: "..."
  - name: "Deploy ugreen-paperless"
    playbook: ugreen-paperless.yml
    inventory: ugreen-nas
    vault_key: vault-password
    description: "..."
```

## Data Flow

1. `make semaphore` → Ansible decrypts `semaphore_vault_password` from vault
2. Bootstrap role creates `vault-password` key via `POST /api/project/{id}/keys`
3. Bootstrap role creates templates with `vault_key_id` pointing to that key
4. When Semaphore runs a job, it resolves `vault_key_id` → writes password to a temp file → sets `ANSIBLE_VAULT_PASSWORD_FILE` → Ansible decrypts vault variables normally

## Error Handling

- `login_password` key creation uses the same `failed_when: false` + visible fail pattern
  as the SSH key fix applied earlier in this session
- `vault_key_id` falls back to `None` (omitted) if `template_spec.vault_key` is not defined,
  so templates without vault needs are unaffected

## Idempotency

- Key creation is guarded by the existing `key_exists` check (name match)
- Template creation is guarded by the existing `template_exists` check
- Re-running `make semaphore` is safe

## Manual Step Required

After implementation, the user runs:
```bash
ansible-vault encrypt_string 'the-vault-password' --name 'semaphore_vault_password'
# paste output into ansible/group_vars/all.yml
```
