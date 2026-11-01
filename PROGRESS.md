# PROGRESS

Session handoff, written by `/wrapup` and auto-loaded at session start. Covers the work after `d2ee07d`; earlier handoffs: `git log -p -- PROGRESS.md`.

## What we did
- `/wrapup` now writes only the work since the previous handoff instead of a running history. Its base is derived from git as the last commit that touched `PROGRESS.md` (`git log -1 --format=%h -- PROGRESS.md`), not stored in the file: a commit cannot contain its own hash, and a stored hash would go stale after a rebase. The intro line names the base for readers only. "What we did" is replaced each run; "Next steps" and "Open questions" carry over what is still open. `allowed-tools` gained read-only `git log`, `git diff`, `git status`, `git show`; `git push` still prompts.
- `CLAUDE.md` layout entries for `/wrapup` and `PROGRESS.md` updated to match.
- Same change applied to `~/claude-code-template` (`.claude/commands/wrapup.md`, which keeps its "Do not push.", plus the matching `CLAUDE.md` lines and `README.md` table rows). Left uncommitted there; its base would be `c36a101`.
- This handoff is the first run of the new `/wrapup`.

## Current state
- `uv run pytest -q`: 31 passed, 5 skipped (last run at d9140cf; nothing since touches the app or tests).
- `main` committed and pushed with this handoff; GitHub Pages serves 0.1.1 at https://kongkrit.github.io/folder2md/.
- Live Preview works in the VS Code Remote session (`.vscode/settings.json`, confirmed by the user).
- The Safari dot-file note is verified only in Chromium with a spoofed Safari UA, plus screenshots; not yet seen in real Safari.

## Next steps
- Real Safari: header shows 0.1.1; the note toggles with the checkbox; a Finder-compressed zip of a folder with `.claude/`, `.gitignore`, `.gitattributes` keeps all three with the box on. Record here.
- Manual smoke, once each (Playwright cannot drop directories): from `file://` in Chrome and Firefox, drag-and-drop a folder, drop the resulting `.md` back, diff the unzipped tree against the original. Safari folder drops lose dot files by design; smoke it with a folder without them, or via zip.
- Install as a PWA from Brave on macOS and in iOS Safari, confirm it opens offline; confirm the Windows install reaches 0.1.1. Record here.
- Open a generated `.md` on GitHub and confirm the tree renders at the top with highlighted source blocks and the magic line on line 1.
- `~/claude-code-template`: commit (and push) the `/wrapup` rewrite when the user asks.

## Open questions
- The root folder name is a path component, so a dropped folder named `node_modules` or `.venv`, or any dot-named folder with the checkbox off, is skipped entirely. Keep the literal reading of the brief, or exempt the root?
