# Convenience targets for the home-server playbook.
# Run `make help` to see what's available.

ANSIBLE_DIR := ansible
INVENTORY   := $(ANSIBLE_DIR)/inventory/hosts.yml
PLAYBOOK    := $(ANSIBLE_DIR)/site.yml
VAULT_OPTS  ?= --ask-vault-pass
NAS_PLAYBOOK := $(ANSIBLE_DIR)/ugreen-nas.yml

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help.
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z0-9_-]+:.*?## / {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: deps
deps: ## Install required Ansible Galaxy collections.
	ansible-galaxy collection install -r $(ANSIBLE_DIR)/requirements.yml

.PHONY: ping
ping: ## Verify Ansible can reach the server.
	ansible -i $(INVENTORY) homeserver -m ping

.PHONY: check
check: ## Dry-run the full playbook (no changes applied).
	ansible-playbook -i $(INVENTORY) $(PLAYBOOK) --check --diff $(VAULT_OPTS)

.PHONY: install
install: deps ## Provision the home server end-to-end.
	ansible-playbook -i $(INVENTORY) $(PLAYBOOK) $(VAULT_OPTS)

.PHONY: common host-dns tailscale k3s argocd scanner semaphore semaphore-targets semaphore-bootstrap semaphore-bootstrap-local nas nas-check
common: ## Run only the `common` role (base OS, firewall, packages).
	ansible-playbook -i $(INVENTORY) $(PLAYBOOK) --tags common $(VAULT_OPTS)

host-dns: ## Run only the `host_dns` role (retire dnsmasq, point host resolver at Pi-hole).
	ansible-playbook -i $(INVENTORY) $(PLAYBOOK) --tags host_dns $(VAULT_OPTS)

tailscale: ## Run only the `tailscale` role (VPN).
	ansible-playbook -i $(INVENTORY) $(PLAYBOOK) --tags tailscale $(VAULT_OPTS)

k3s: ## Run only the `k3s` role (Kubernetes + Helm).
	ansible-playbook -i $(INVENTORY) $(PLAYBOOK) --tags k3s $(VAULT_OPTS)

argocd: ## Run only the `argocd` role (GitOps controller).
	ansible-playbook -i $(INVENTORY) $(PLAYBOOK) --tags argocd $(VAULT_OPTS)

scanner: ## Run only the `scanner` role (Fujitsu + scanbd + SMB mount).
	ansible-playbook -i $(INVENTORY) $(PLAYBOOK) --tags scanner $(VAULT_OPTS)

semaphore: ## Bootstrap Semaphore Secret on the home-server.
	ansible-playbook -i $(INVENTORY) $(PLAYBOOK) --tags semaphore-secrets $(VAULT_OPTS)

semaphore-targets: ## Push Semaphore SSH key to all managed targets.
	ansible-playbook -i $(INVENTORY) $(PLAYBOOK) --tags semaphore-targets $(VAULT_OPTS)

semaphore-bootstrap: ## Provision Projects/Inventories/Templates in Semaphore via API.
	ansible-playbook -i $(INVENTORY) $(PLAYBOOK) --tags semaphore-bootstrap $(VAULT_OPTS)

semaphore-bootstrap-local: ## Bootstrap Semaphore natively on the home server (no SSH).
	ansible-playbook -i $(INVENTORY) $(PLAYBOOK) \
	    --connection local \
	    --extra-vars "ansible_host=127.0.0.1 ansible_user=$$(whoami)" \
	    --tags semaphore-bootstrap $(VAULT_OPTS)

nas: ## Deploy all services on the UGREEN NAS.
	ansible-playbook -i $(INVENTORY) $(NAS_PLAYBOOK) $(VAULT_OPTS)

nas-check: ## Dry-run the NAS playbook (no changes applied).
	ansible-playbook -i $(INVENTORY) $(NAS_PLAYBOOK) --check --diff $(VAULT_OPTS)

.PHONY: lint
lint: ## Lint YAML, Ansible, and ALL Helm charts.
	yamllint -c .yamllint ansible/ argocd/
	ansible-lint $(ANSIBLE_DIR)/
	@if command -v helm >/dev/null; then \
	    for chart in argocd/apps/*/; do \
	        [ -f "$${chart}Chart.yaml" ] || continue; \
	        if grep -q '^dependencies:' "$${chart}Chart.yaml"; then \
	            echo "==> helm dependency build $${chart}"; \
	            helm dependency build "$${chart}" || helm dependency update "$${chart}"; \
	        fi; \
	        echo "==> helm lint $${chart}"; \
	        helm lint "$${chart}"; \
	    done; \
	else \
	    echo "helm not installed — skipping chart lint"; \
	fi

.PHONY: render-bootstrap
render-bootstrap: ## Regenerate argocd/bootstrap/root-applicationset.yaml from the role template.
	ansible-playbook $(ANSIBLE_DIR)/render-bootstrap.yml --connection local $(VAULT_OPTS)

.PHONY: vault-edit
vault-edit: ## Edit the vault-encrypted vars file.
	ansible-vault edit $(ANSIBLE_DIR)/group_vars/all.yml

.PHONY: clean
clean: ## Remove cached collections and temp artifacts.
	rm -rf ~/.ansible/collections/ansible_collections/{ansible,community,kubernetes}
