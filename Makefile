SHELL := /bin/bash
.DEFAULT_GOAL := help

SHA := $(shell git rev-parse --short HEAD 2>/dev/null || echo "dev")
KIND_CLUSTER := roundtrip
HELM_RELEASE := roundtrip
HELM_NAMESPACE := default

SERVICES := gateway orders-service processing-service

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.PHONY: install
install: ## Install all dependencies
	yarn install --immutable

.PHONY: build-ts
build-ts: ## Compile all TypeScript
	yarn build

.PHONY: typecheck
typecheck: ## Typecheck all workspaces
	yarn typecheck

.PHONY: test
test: ## Run unit tests
	yarn test

.PHONY: build
build: ## Build all Docker images tagged with git SHA
	@for svc in $(SERVICES); do \
		echo "Building $$svc:sha-$(SHA)"; \
		docker build -t $$svc:sha-$(SHA) -f $$svc/Dockerfile . ; \
	done

.PHONY: kind-up
kind-up: ## Create kind cluster and deploy everything
	@echo "Creating kind cluster '$(KIND_CLUSTER)'..."
	kind create cluster --name $(KIND_CLUSTER) --wait 60s 2>/dev/null || true
	@echo "Loading images into kind..."
	@for svc in $(SERVICES); do \
		kind load docker-image $$svc:sha-$(SHA) --name $(KIND_CLUSTER); \
	done
	@echo "Adding Helm repos..."
	helm repo add nats https://nats-io.github.io/k8s/helm/charts/ 2>/dev/null || true
	helm repo update
	@echo "Building Helm dependencies..."
	helm dependency build charts/roundtrip
	@echo "Installing Helm release..."
	helm upgrade --install $(HELM_RELEASE) charts/roundtrip \
		-f charts/roundtrip/values-kind.yaml \
		--set global.image.tag=sha-$(SHA) \
		--namespace $(HELM_NAMESPACE) \
		--wait --timeout 180s
	@echo "Cluster is ready."

.PHONY: e2e
e2e: ## Run e2e smoke tests against the kind cluster
	@bash scripts/e2e-test.sh

.PHONY: kind-down
kind-down: ## Delete the kind cluster
	kind delete cluster --name $(KIND_CLUSTER)

.PHONY: clean
clean: ## Remove build artifacts
	yarn clean
