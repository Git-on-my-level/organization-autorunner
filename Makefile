SHELL := /usr/bin/env bash

CORE_DIR := core
WEB_UI_DIR := web-ui

CORE_HOST ?= 127.0.0.1
CORE_PORT ?= 8000
WEB_UI_PORT ?= 5173
CORE_BASE_URL ?= http://$(CORE_HOST):$(CORE_PORT)

.DEFAULT_GOAL := help

.PHONY: help install check serve lint test format core-% web-ui-%

help: ## Show available targets
	@awk 'BEGIN {FS = ":.*##"; printf "Targets:\n"} /^[a-zA-Z0-9_.-]+:.*##/ {printf "  %-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install workspace dependencies
	pnpm install

check: ## Run checks in both core and web-ui
	$(MAKE) -C $(CORE_DIR) check
	$(MAKE) -C $(WEB_UI_DIR) check

lint: ## Run lint checks in both core and web-ui
	$(MAKE) -C $(CORE_DIR) lint
	$(MAKE) -C $(WEB_UI_DIR) lint

test: ## Run tests in both core and web-ui
	$(MAKE) -C $(CORE_DIR) test
	$(MAKE) -C $(WEB_UI_DIR) test

format: ## Apply formatting in both core and web-ui
	$(MAKE) -C $(CORE_DIR) fmt
	$(MAKE) -C $(WEB_UI_DIR) format

serve: ## Start core and web-ui dev servers
	@set -euo pipefail; \
	trap 'for pid in $$(jobs -p); do kill "$$pid" 2>/dev/null || true; done' EXIT INT TERM; \
	$(MAKE) -C $(CORE_DIR) serve HOST="$(CORE_HOST)" PORT="$(CORE_PORT)" & \
	core_pid=$$!; \
	OAR_CORE_BASE_URL="$(CORE_BASE_URL)" $(MAKE) -C $(WEB_UI_DIR) serve PORT="$(WEB_UI_PORT)" & \
	ui_pid=$$!; \
	wait $$core_pid $$ui_pid

core-%: ## Pass-through target to core Makefile
	$(MAKE) -C $(CORE_DIR) $*

web-ui-%: ## Pass-through target to web-ui Makefile
	$(MAKE) -C $(WEB_UI_DIR) $*
