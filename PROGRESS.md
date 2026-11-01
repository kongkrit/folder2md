# PROGRESS

Session handoff for this project. Written by `/wrapup`; auto-loaded into context at session start.

## What we did
- 2026-09-26: built folder2md from `BRIEF.md`: `index.html`, `style.css`, `app.js` (DOM), `core.js` (pure functions, also imported by `sw.js`), `ignores.js`, `sw.js`, `manifest.webmanifest`, `icons/` (from `tests/gen_icons.py`), `.nojekyll`.
- Test harness: `pyproject.toml` + `uv.lock`; `tests/test_e2e.py` (Playwright, headless Chromium, `python3 -m http.server` on a free port, fresh context per test); `tests/ref_parse.py` (independent parser plus a port of the ignore matcher); fixtures `junk.zip` (deflated, all the ignorable junk), `flat.zip` (STORE, no common root), `plain/`, `single/`, written by `tests/gen_fixtures.py`.
- Rewrote `README.md` (usage, browser support, GitHub Pages, install, format) and extended `CLAUDE.md` (layout, commands, conventions). Added `.pytest_cache/` and `test-results/` to `.gitignore`.
- `ignores.txt` arrived after the first commit; `ignores.js` is now generated from it by `tests/gen_ignores.py` (`.git/` group on top, then the txt verbatim). Its list is shorter than the template `.gitignore`: `dist/`, `build/`, `output/`, `*.tmp` are no longer skipped.
- Decisions where the brief left gaps: ignore patterns are tested against every path component including the root; `sw.js` reads `VERSION` from `core.js` via `importScripts`, so the version lives in one place; `./ignores.js` is in the precache list.
- Between sessions (no handoff written): header subtitle (5015c4a), opaque apple-touch-icon PNGs for iOS (d0d6957), README link to uv's install docs (6bc8473). Pushed, GitHub Pages enabled.
- 2026-11-01: Safari drops dot files from folders. A folder dropped in macOS Safari lost `.claude/`, `.gitignore`, `.gitattributes` with the checkbox on. Not an app bug: WebKit filters names starting with `.` before the page sees them, in both drag-and-drop (`DOMFileSystem.cpp`, `listDirectoryWithMetadata`) and the `webkitdirectory` picker (`DirectoryFileListCreator.cpp`); `isHiddenFile` is "name starts with `.`" on Unix. Same on every iOS browser. Zips keep dot files.
- 2026-11-01: added `#dots-note` under the options, shown only when the UA is WebKit-only (`AppleWebKit/` without `Chrome/`) and `#dots` is checked: "Safari leaves out dot files when reading a folder. Zip the folder and drop the .zip to keep them." Checkbox stays enabled (graying it out would break the zip workaround; a hover tooltip fails on iPad). README Browser support bullet, `test_safari_dot_note` (Chromium with a Safari UA), `VERSION` 0.1.1. Committed d9140cf, pushed.
- 2026-11-01: VS Code Live Preview fails in this Remote session: with `livePreview.useIntegratedBrowser` (default `true`) it opens `http://127.0.0.1:3000/...` in the integrated browser on the local machine, and its server answers 401 to any Host but `localhost:3000` or the forwarded URI. Fix: `"livePreview.useIntegratedBrowser": false` in Remote settings (not applied), or `python3 -m http.server 8000` plus the Ports panel.

## Current state
- `uv run pytest -q`: 31 passed, 5 skipped. The skips are expected: the zip test on the two directory fixtures, the dot-rule test on the three fixtures without dotted paths.
- `main` pushed and clean; GitHub Pages serves 0.1.1 at https://kongkrit.github.io/folder2md/.
- The Safari note is verified only in Chromium with a spoofed Safari UA, plus screenshots (light, dark, 375 px); not yet seen in real Safari.
- The user has used the PWA in macOS Safari, plans to reinstall it from Brave (main browser), and has it on a Windows machine pending the 0.1.1 update (self-updates on launch, then reload).

## Next steps
- Real Safari: header shows 0.1.1; the note toggles with the checkbox; a Finder-compressed zip of a folder with `.claude/`, `.gitignore`, `.gitattributes` keeps all three with the box on. Record here.
- Manual smoke, once each (Playwright cannot drop directories): from `file://` in Chrome and Firefox, drag-and-drop a folder, drop the resulting `.md` back, diff the unzipped tree against the original. Safari folder drops lose dot files by design now; smoke it with a folder without them, or via zip.
- Install as a PWA from Brave on macOS and in iOS Safari, confirm it opens offline; confirm the Windows install reaches 0.1.1. Record here.
- Open a generated `.md` on GitHub and confirm the tree renders at the top with highlighted source blocks and the magic line on line 1.

## Open questions
- The root folder name is a path component, so a dropped folder named `node_modules` or `.venv`, or any dot-named folder with the checkbox off, is skipped entirely. Keep the literal reading of the brief, or exempt the root?
