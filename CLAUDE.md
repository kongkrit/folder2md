# CLAUDE.md

Guidance for Claude Code in this repository.

## What this is

A **Claude Code template** — a starting point for new projects, not an application. It holds only configuration and licensing files; application code gets added alongside them.

## Layout

- `.claude/settings.json` — committed settings (`model: opus`, `effortLevel: xhigh`), permission allowlist, and a `SessionStart` hook that prints `PROGRESS.md` into context. Personal overrides go in the gitignored `.claude/settings.local.json`, never here.
- `.claude/commands/wrapup.md` — `/wrapup`: writes a session handoff to `PROGRESS.md`, then commits.
- `PROGRESS.md` — session handoff maintained by `/wrapup`.
- `.gitignore`, `.gitattributes` — ignore rules; LF line endings and binary file types.
- `README.md`, `LICENSE` — human-facing overview and license.

## Conventions

- LF line endings everywhere; never introduce CRLF.
- New languages or toolchains extend `.gitignore` and `.gitattributes` — no parallel ignore files. Keep new entries consistent with existing ones.
- Respect the [LICENSE](LICENSE) when adding dependencies.
- As the template becomes a real project, add build, test, and run commands here.

## Development environment

- **Debian 13 (trixie)** with `docker` installed. Base tooling via `apt`: `git`, `gh`, `python3`, `python3-venv`, `python3-pip`, `python3-dev`, `build-essential`, `curl`, `jq`; plus `uv` from its standalone installer into `~/.local/bin` (commands in the [README](README.md#development-setup-debian-13)).
- **Install missing tools yourself:** `sudo apt install -y <package>` (`sudo apt update` first if not found). Use `apt` for system tools only. If the project will keep relying on a new tool, add it to the README's install command.
- **Never `pip install` system-wide** (PEP 668). Use a per-project venv:

  ```bash
  uv venv && uv pip install -r requirements.txt    # or: uv sync
  # or: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
  ```
- `node`/`npm` and .NET are not used; serve static content with `python3 -m http.server`. Multi-arch Docker builds need a one-time QEMU + buildx setup (see README).
