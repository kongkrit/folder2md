# PROGRESS

Session handoff for this project. Written by `/wrapup`; auto-loaded into context at session start.

## What we did
- 2026-09-26: built folder2md from `BRIEF.md`: `index.html`, `style.css`, `app.js` (DOM), `core.js` (pure functions, also imported by `sw.js`), `ignores.js`, `sw.js`, `manifest.webmanifest`, `icons/` (from `tests/gen_icons.py`), `.nojekyll`.
- Test harness: `pyproject.toml` + `uv.lock`; `tests/test_e2e.py` (Playwright, headless Chromium, `python3 -m http.server` on a free port, fresh context per test); `tests/ref_parse.py` (independent parser plus a port of the ignore matcher); fixtures `junk.zip` (deflated, all the ignorable junk), `flat.zip` (STORE, no common root), `plain/`, `single/`, written by `tests/gen_fixtures.py`.
- Rewrote `README.md` (usage, browser support, GitHub Pages, install, format) and extended `CLAUDE.md` (layout, commands, conventions). Added `.pytest_cache/` and `test-results/` to `.gitignore`.
- `ignores.txt` arrived after the first commit; `ignores.js` is now generated from it by `tests/gen_ignores.py` (`.git/` group on top, then the txt verbatim). Its list is shorter than the template `.gitignore`: `dist/`, `build/`, `output/`, `*.tmp` are no longer skipped.
- Decisions where the brief left gaps: ignore patterns are tested against every path component including the root; `sw.js` reads `VERSION` from `core.js` via `importScripts`, so the version lives in one place; `./ignores.js` is in the precache list.

## Current state
- `uv run pytest -q`: 30 passed, 5 skipped. The skips are expected: the zip test on the two directory fixtures, the dot-rule test on the three fixtures without dotted paths.
- Verified in headless Chromium: the service worker precaches the nine shell URLs and the page reloads offline with a clean console; `file://` works with no service-worker registration; the theme toggle persists across reload.
- First build committed on `main` (a024c71); the ignores.txt rebuild is uncommitted, pending `/wrapup`. Not pushed; GitHub Pages not enabled yet.

## Next steps
- Manual smoke, once each (Playwright cannot drop directories): from `file://` in Chrome, Firefox and Safari, drag-and-drop a folder, then drop the resulting `.md` back and diff the unzipped tree against the original. Record the outcome here.
- Push, enable GitHub Pages (Settings → Pages → `main`, `/ (root)`), install as a PWA in desktop Chrome and iOS Safari, confirm it opens offline. Record here.
- Open a generated `.md` on GitHub and confirm the tree renders at the top with highlighted source blocks and the magic line on line 1.

## Open questions
- The root folder name is a path component, so a dropped folder named `dist` or `build` is skipped entirely. Keep the literal reading of the brief, or exempt the root?
