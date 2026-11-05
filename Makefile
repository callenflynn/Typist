SHELL := /bin/sh
.DEFAULT_GOAL := help

.PHONY: help install dev build check typecheck test rust-check tauri-dev package-arch clean

help:
	@printf '%s\n' \
		'make install       Install dependencies with Bun' \
		'make dev           Start the Vite shell (no file access)' \
		'make tauri-dev     Start the desktop app' \
		'make check         Typecheck and build the frontend' \
		'make test          Run the frontend unit tests' \
		'make rust-check    Typecheck the Rust side' \
		'make build         Build the desktop binary' \
		'make package-arch  Build the Arch Linux package with makepkg' \
		'make clean         Remove generated build output'

install:
	bun install --frozen-lockfile

dev:
	bun run dev

typecheck:
	bun run typecheck

test:
	bun test tests

check:
	bun run typecheck
	bun run build

rust-check:
	cargo check --manifest-path src-tauri/Cargo.toml

tauri-dev:
	bunx tauri dev

build:
	bunx tauri build --bundles none

package-arch:
	@if [ "$$(id -u)" -eq 0 ]; then echo 'Do not run makepkg as root.' >&2; exit 1; fi
	makepkg -C -f -p packaging/arch/PKGBUILD

clean:
	rm -rf dist src-tauri/target
