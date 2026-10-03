SHELL := /bin/sh
.DEFAULT_GOAL := help

APP := typist
PM := $(shell if command -v bun >/dev/null 2>&1; then printf bun; elif command -v pnpm >/dev/null 2>&1; then printf pnpm; else printf npm; fi)
TAURI := $(if $(filter bun,$(PM)),bunx tauri,$(if $(filter pnpm,$(PM)),pnpm exec tauri,npx tauri))

.PHONY: help install dev build check typecheck tauri-dev package-arch clean

help:
	@printf '%s\n' \
		'make install       Install frontend dependencies' \
		'make dev           Start the Vite web preview' \
		'make tauri-dev     Start the desktop app in development mode' \
		'make check         Run TypeScript checks and the production build' \
		'make build         Build the desktop binary' \
		'make package-arch  Build the Arch Linux package with makepkg' \
		'make clean         Remove generated build output'

install:
	@if command -v bun >/dev/null 2>&1; then bun install --frozen-lockfile; \
	elif command -v pnpm >/dev/null 2>&1; then pnpm install; \
	else npm install; fi

dev: install
	$(PM) run dev

typecheck: install
	$(PM) run typecheck

check: install
	$(PM) run typecheck
	$(PM) run build

tauri-dev: install
	$(TAURI) dev

build: install
	$(TAURI) build --bundles none

package-arch:
	@if [ "$$(id -u)" -eq 0 ]; then echo 'Do not run makepkg as root.' >&2; exit 1; fi
	makepkg -C -f -p packaging/arch/PKGBUILD

clean:
	rm -rf dist src-tauri/target
