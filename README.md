# Claude Code Template

A starter repository preconfigured for [Claude Code](https://claude.com/claude-code): settings, a session-handoff workflow, ignore rules, and LF line endings from the first commit.

## What's included

| File | Purpose |
|------|---------|
| `.claude/settings.json` | Claude Code settings (`model: opus`, `effortLevel: xhigh`), a permission allowlist, and a `SessionStart` hook that prints `PROGRESS.md` into context. |
| `.claude/commands/wrapup.md` | `/wrapup` — writes a session handoff to `PROGRESS.md`, then commits. |
| `PROGRESS.md` | Session handoff maintained by `/wrapup`. |
| `.gitignore` | OS cruft, Python/Node build artifacts, editor files. |
| `.gitattributes` | LF line endings; binary file types. |
| `LICENSE` | Project license. |

## Usage

1. Click **Use this template** on GitHub, or clone the repo.
2. Delete what you don't need and start building.
3. Adjust `.claude/settings.json` to taste ([settings docs](https://docs.claude.com/en/docs/claude-code/settings)). Personal overrides go in `.claude/settings.local.json`, which is gitignored.

## Development setup (Debian 13)

`docker` is assumed installed. Base toolchain:

```bash
sudo apt install -y git gh python3 python3-venv python3-pip python3-dev build-essential curl jq
```

`python3-dev` and `build-essential` are only needed for Python packages built from source.

`uv` is not packaged for Debian; install it with the standalone installer (needs `curl` from above). It puts `uv` and `uvx` in `~/.local/bin`, which Debian's default `~/.profile` adds to `PATH` on next login:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Verify: `git --version && gh --version && curl --version && uv --version`.

**More tools.** `sudo` is passwordless, and Claude Code may install whatever a task needs:

```bash
sudo apt update && sudo apt install -y <package>
```

Use `apt` for system tools; keep Python packages in the project venv. Add any lasting dependency to the command above.

**Python.** Debian 13 blocks system-wide `pip install` (PEP 668). Use a venv per project, with `uv` or the standard library:

```bash
uv venv && uv pip install -r requirements.txt    # or: uv sync, if the project has a pyproject.toml
# or
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
```

For a packaged CLI, `sudo apt install -y pipx` then `pipx install .` avoids managing a venv by hand.

**Docker multi-arch (optional, one-time).** Cross-building `linux/amd64` + `linux/arm64` needs QEMU and a `docker-container` builder:

```bash
docker run --privileged --rm tonistiigi/binfmt --install all
docker buildx create --name multiarch --driver docker-container --bootstrap --use
```

On Apple Silicon with OrbStack, emulation is built in, so only the second line is needed.

**Not used.** `node`/`npm` (serve static content with `python3 -m http.server`) and the .NET SDK.

## License

See [LICENSE](LICENSE).
