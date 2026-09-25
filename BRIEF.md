# BRIEF.md — folder2md (static web app, PWA)

Instructions for Claude Code. This file is the task; `CLAUDE.md` is repo conventions; `README.md` is user-facing docs. Read all three, then build.

## Goal

One static web page, no server, no build step, no framework, no npm: `index.html` + `style.css` + `app.js` + `core.js` + `ignores.js`, plus the PWA files below. Plain `<script src>` tags (no `type="module"`: Chrome blocks ES modules on `file://`). Runs from `file://`, `python3 -m http.server`, and GitHub Pages; installable as a PWA when served over HTTPS.

Two directions, auto-detected from what the user drops or picks:

- **folder2md** — a folder (recursively), or a single `.zip`, → one Markdown file, auto-downloaded. Text files verbatim in fenced blocks, binary files base64 in fenced blocks.
- **md2folder** — a single text file whose first line is the magic line → a `.zip` of the restored tree, auto-downloaded. If the md holds exactly one file, download that file directly instead of a zip.

Keep it simple. No corner-case engineering.

## Repo

- Start from the template as-is (`.claude/settings.json`, `/wrapup`, `PROGRESS.md`, `.gitignore`, `.gitattributes`, `LICENSE` = AGPL-3.0). Rewrite `README.md` for the app (usage, browser support, hosting on GitHub Pages, the format below). Extend `CLAUDE.md` with the run/test commands, per its own convention.
- `pyproject.toml` exists only for the test harness; the app has no dependencies.

```
index.html
style.css
app.js                 # DOM: drop zone, pickers, checkboxes, theme, downloads, SW registration
core.js                # pure functions, no DOM: buildMd, parseMd, sniff, fenceFor, treeText, zipRead, zipWrite
manifest.webmanifest
sw.js
icons/icon-192.png, icons/icon-512.png     # generated once with Pillow (uv run python), committed
ignores.js             # always-skipped paths, gitignore syntax inside one template literal (see below)
tests/test_e2e.py      # Playwright (Python) harness
tests/ref_parse.py     # independent Python reference parser of the format (≈40 lines)
tests/gen_icons.py     # the Pillow one-off
tests/fixtures/        # my fixtures: *.zip and/or plain directories
pyproject.toml         # [dependency-groups] dev = ["pytest>=8", "playwright", "pytest-playwright", "pillow"]
```

`core.js` exposes `window.folder2md = { buildMd, parseMd, zipRead, zipWrite, sniff, isIgnored, ... }` so tests can call it in-page.

`ignores.js` is the given `ignores.txt` wrapped as data a classic script can load on `file://` (Chrome blocks `fetch()` of sibling files there, so JSON is out):

```js
// ignores.js — always-skipped paths. gitignore syntax: one pattern per line, `#` comments, blank lines ignored.
// Edit this file directly; core.js parses it at load.
const IGNORES_TEXT = `
# VCS
.git/

# macOS
.DS_Store
...            (the rest of ignores.txt, verbatim, groups and comments kept)
`;
```

`core.js` parses `IGNORES_TEXT` into patterns at load. Matching: strip a trailing `/`; glob → regex (`*` → `.*`, `?` → `.`, `[...]` passed through, everything else escaped); anchored; tested against **every path component**, file or directory. A hit anywhere in the path skips the entry. That is the whole ignore engine. All URLs in `index.html`, `manifest.webmanifest` and `sw.js` are relative (`./`), never absolute, so the same files work at `file://`, `localhost` and `https://<user>.github.io/folder2md/`.

## UI

| Element | Behaviour |
|---|---|
| Header | title, version, theme toggle (☀/☾). Theme = CSS variables on `:root[data-theme]`; default follows `prefers-color-scheme`; toggle persists to `localStorage("theme")`. |
| Drop zone | accepts a dropped folder or a dropped file. Folder → recurse with `webkitGetAsEntry()` / `createReader()`. More than one top-level item dropped → error "drop one folder, one .zip, or one .md". |
| "Choose folder" | hidden `<input type="file" webkitdirectory>`; paths from `file.webkitRelativePath`. |
| "Choose file" | hidden `<input type="file">`, for a `.zip` or an `.md`. |
| Checkbox "Include dot files and folders" | default **unchecked**. Does not override the ignore list. |
| Checkbox "Add SHA-256 checksums" | default **unchecked**; folder2md only. |
| Button "View ignored files" | opens a native `<dialog>` with two `<pre>` blocks: `IGNORES_TEXT` verbatim (always), and "Skipped in last run" listing the actual paths dropped by the ignore list or the dot rule (after a run; "no run yet" before). Close button, Esc closes. |
| Status line | mode detected, file count, bytes, skipped count; errors in red. |

Auto-detect, in this order:

1. Exactly one file AND it decodes as UTF-8 AND line 1 matches the magic regex → **md2folder**.
2. Exactly one file AND it starts with bytes `50 4B 03 04` (or its name ends `.zip`) → `zipRead` it, then **folder2md** on the entries. Root = the common first path segment if every entry has the same one, else the zip's stem (entries get prefixed with it).
3. Otherwise → **folder2md** on the files as given. Root = top folder name (`webkitRelativePath` first segment, or the dropped directory's `name`); a single non-zip, non-md file is a one-file folder2md with root = the file's stem.

The `.zip` unzip happens only in case 2. A `.zip` sitting inside a folder is an ordinary binary entry, never expanded.

Downloads: `Blob` + `URL.createObjectURL` + `<a download>.click()`. folder2md → `<root>.md`. md2folder → `<root>.zip` (root = first path segment of the entries), or the single file under its own basename.

Note in the README: browsers show an "Upload N files to this site?" confirmation on folder pick; nothing leaves the machine.

## Output format

Line 1, exactly (regex `^folder2md-document: format=1 tool=folder2md/\S+ restore=".*"$`):

```
folder2md-document: format=1 tool=folder2md/0.1.0 restore="drop this file on folder2md"
```

Then:

````markdown

# folder2md: web

Generated by folder2md 0.1.0. Restore by dropping this file on folder2md.

## Tree

```text
web/
├── SIMMONTH.md  (text, 4551 bytes)
├── assets/
│   └── logo.png  (binary, 41220 bytes)
└── src/
    ├── app.js  (text, 15703 bytes)
    └── sim.js  (text, 8802 bytes)
```

---

## web/SIMMONTH.md

<!-- folder2md {"path":"web/SIMMONTH.md","kind":"text"} -->

```md
...file bytes, verbatim...

```

---

## web/assets/logo.png

<!-- folder2md {"path":"web/assets/logo.png","kind":"binary","sha256":"<hex64>"} -->

```base64
iVBORw0KGgo...
```
````

Rules:

| Item | Rule |
|---|---|
| entries | files only, sorted by path (code-unit order), POSIX separators, path starts with `<root>/`. |
| always skipped | every pattern in `ignores.js` (`.git/`, OS junk, Python/Node build and dependency dirs, `output/`, `*.tmp`, …), regardless of the checkbox. |
| dot rule | any path with a component starting with `.` (`.gitattributes`, `.claude/settings.json`, `.github/workflows/x.yml`) is skipped unless "Include dot files and folders" is checked. `.git/` stays out either way because it is in `ignores.js`. |
| anything else | kept. No other exclude UI. |
| text vs binary | `new TextDecoder("utf-8", {fatal: true}).decode(bytes)` succeeds and `bytes.indexOf(0) === -1` → text; else binary. No extension logic. |
| tree | `## Tree` block, fenced `text`, `tree(1)` glyphs (`├── `, `│   `, `└── `, `    `). Root line `<root>/`. Directories derived from the paths (no entries of their own), sorted with files at each level, dirs suffixed `/`. Each file line ends with `  (kind, N bytes)`. |
| marker | one HTML comment per entry, single line: `<!-- folder2md {json} -->`, `JSON.stringify` of `{path, kind}` plus `sha256` only when the checkbox is on. |
| fence | backticks, length `max(3, longest backtick run in the content + 1)`. Info string = file extension without the dot, lowercased, empty if none; `base64` for binary. |
| text body | write the raw bytes, then exactly one `\n`, then the closing fence. Always one added newline, whether or not the content ends in one. No decoding, no line-ending changes: the md is assembled as an array of `Uint8Array` / string parts and passed to `Blob` as-is. |
| binary body | standard base64, 76-column lines each ending `\n`, then the closing fence. |
| checksum | SHA-256 hex via `crypto.subtle.digest("SHA-256", bytes)`, of the original bytes. |

## md2folder parse (`core.js parseMd`, and `tests/ref_parse.py` in Python)

Bytes in, split on `0x0A`, one pass top to bottom:

1. Line 0 must match the magic regex.
2. Find the next marker line; `JSON.parse` it.
3. The next non-empty line must be a fence (`^(`{3,})(\S*)$`); collect lines until a line equals the fence backticks exactly.
4. `text` → join the collected lines with `\n` (this undoes the one added newline exactly). `binary` → base64-decode the concatenation of the lines.
5. If the marker has `sha256`, compute and compare; if absent, skip.
6. Emit `{path, bytes}`. Repeat from 2 until EOF.

Any failure at any step → throw `"md is broken"`. Don't recover, resync, or explain.

## Zip (`core.js zipRead` / `zipWrite`), no library

- `zipWrite(entries)`: STORE only (method 0), flag bit 11 set (UTF-8 names), CRC-32 (table-based), local headers + central directory + EOCD. No ZIP64: don't handle > 4 GB or > 65535 entries. Fixed DOS time is fine.
- `zipRead(bytes)`: find EOCD (`06054b50`) scanning back from the end, walk the central directory, read each local header for the data offset. Method 0 → slice; method 8 → `new Blob([slice]).stream().pipeThrough(new DecompressionStream("deflate-raw"))`. Skip names ending `/`. Any other method, encryption, or a missing signature → error "unsupported zip". Names decoded as UTF-8.

## PWA

- `manifest.webmanifest`: `name`/`short_name` "folder2md", `start_url: "./"`, `scope: "./"`, `display: "standalone"`, `background_color`/`theme_color` matching the light theme, `icons` 192 and 512 PNG (`purpose: "any maskable"`).
- `index.html`: `<link rel="manifest" href="./manifest.webmanifest">`, `<meta name="theme-color">`, `<link rel="icon">`, `<link rel="apple-touch-icon" href="./icons/icon-192.png">`.
- `sw.js`: cache-first for the app shell (`./`, `./index.html`, `./style.css`, `./app.js`, `./core.js`, `./manifest.webmanifest`, both icons). Cache name carries the version (`folder2md-0.1.0`); on `install` → `skipWaiting()`, on `activate` → delete other caches then `clients.claim()`. Nothing else: no runtime caching, no push, no sync.
- `app.js`: `if (location.protocol.startsWith("http") && "serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js")`. Never on `file://`.
- Bump the version string in one place (`core.js`) and it propagates to the magic line, the H1 line, the UI, and the cache name.
- Hosting: GitHub Pages from the repo root of `main`. README documents that install needs HTTPS or localhost.
- Deferred, Chromium-only, not now: `file_handlers`, `share_target`, `launch_handler`.

## Tests

Harness: `uv sync`, `uv run playwright install --with-deps chromium` (once), `uv run pytest -q`. A session fixture starts `python3 -m http.server <free port>` in the repo root and Playwright opens `http://localhost:<port>/` (localhost is a secure context, so the real SW path is exercised; each test gets a fresh browser context so no cached shell leaks between tests).

Fixtures: every `tests/fixtures/*.zip` and every `tests/fixtures/*/` directory. For a zip fixture, the harness also unzips it into `tmp_path` so it can be fed as a folder. Expected entry set = fixture files minus `ignores.js` matches minus dotted paths (unless the checkbox under test is on). Parametrize by fixture name; skip if none. Keep at least one fixture that contains `.git/`, `.DS_Store`, `__MACOSX/`, `__pycache__/`, `node_modules/`, a `*.tmp`, a top-level dot file, and a dot folder with a plain file inside it.

Per fixture:

1. **folder2md from folder, checksums on.** `set_input_files(dir)` on the `webkitdirectory` input, checksum checked, `expect_download()` → md bytes. `tests/ref_parse.py` (independent of the JS) → entry set and every entry's bytes equal the fixture's; checksums verified there.
2. **folder2md from folder, checksums off.** Same, unchecked → ref parser succeeds (skips verification), bytes equal.
3. **folder2md from zip.** `set_input_files(fixture.zip)` on the file input → md → ref parser → same assertions as 1. (Zip fixtures only.)
4. **Dot rule.** Two runs on fixtures that contain dotted paths: checkbox off → no dotted paths; on → dotted paths present. In both, every `ignores.js` match (`.git/`, `.DS_Store`, `__MACOSX/`, `Thumbs.db`, `__pycache__/`, `node_modules/`, `dist/`, `*.tmp`, …) is absent. Expected sets computed in Python with the same two rules (a ~15-line Python port of the glob matcher, in `ref_parse.py`).
4b. **Ignore dialog.** Clicking "View ignored files" opens the `<dialog>`; it contains `.DS_Store` and `node_modules/`; after a run it lists the paths actually skipped, matching the Python expectation.
5. **Document shape.** Line 0 matches the magic regex; the `## Tree` block, walked back into paths, equals the entry set.
6. **md2folder round trip.** `set_input_files(a.md)` on the file input → `expect_download()` → zip → `zipfile` in Python → entries and bytes equal the fixture's. For a fixture with exactly one file, the download is that file, not a zip.
7. **Broken md.** Corrupt one byte inside the first fenced block of the checksummed md → the page shows `md is broken` and no download fires; `ref_parse.py` raises too.
8. **PWA shape.** `manifest.webmanifest` parses, its icons exist, `sw.js` is fetchable, and after load `navigator.serviceWorker.ready` resolves on localhost.

Do NOT write golden-file tests for the md itself: no stored expected `.md`, no hashing or diffing of generated Markdown. The Markdown is checked only through what the two parsers get back from it.

Manual smoke, once each, recorded in `PROGRESS.md`: drag-and-drop a folder in Chrome, Firefox, Safari (Playwright cannot drop directories); install as PWA from GitHub Pages in Chrome and iOS Safari.

## Non-goals (deliberate, don't add)

- Any server, bundler, framework, npm, or zip library. Web workers. Deflate on output. ZIP64. Exclude UI beyond the one checkbox and the read-only ignore dialog, in-app editing of the ignore list, negation (`!`) or anchored (`/foo`) gitignore patterns, size guards, symlinks, empty directories, mtime/mode, line-ending repair, format-version negotiation, progress bars, multi-item drops, mobile layout polish, `file_handlers`/`share_target`.

## Done when

- `uv run pytest -q` is green on every fixture.
- From `file://` in Chrome, Firefox, Safari: folder drop → md downloads and renders on GitHub with the tree at the top and every source file readable in a highlighted block, magic line on line 1; dropping that md → zip downloads and unzips to the same tree byte-for-byte; theme toggle works and persists.
- Served from GitHub Pages: installs as a PWA in Chrome (desktop) and iOS Safari, opens offline.
- `README.md` describes usage, browser support, hosting and the format; `CLAUDE.md` lists the commands; `/wrapup` run.
