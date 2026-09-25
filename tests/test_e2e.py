"""End-to-end tests. Playwright drives the page served by `python3 -m http.server`; ref_parse.py checks the output.

Fixtures: every tests/fixtures/*.zip and every tests/fixtures/*/ directory. No golden Markdown files:
the generated document is checked only through what the two parsers get back from it.
"""
import io
import re
import socket
import subprocess
import sys
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path

import pytest
from PIL import Image
from playwright.sync_api import Page, expect

import ref_parse

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
IGNORES = ref_parse.load_ignores((ROOT / "ignores.js").read_text(encoding="utf-8"))
MAGIC_RE = re.compile(rb'^folder2md-document: format=1 tool=folder2md/\S+ restore=".*"$')

ZIPS = sorted(p.stem for p in FIXTURES.glob("*.zip")) if FIXTURES.is_dir() else []
DIRS = sorted(p.name for p in FIXTURES.iterdir() if p.is_dir()) if FIXTURES.is_dir() else []
NAMES = ZIPS + DIRS


# ---------------------------------------------------------------- fixtures

@dataclass
class Fixture:
    name: str
    root: str
    files: dict[str, bytes]  # every file as "<root>/...", before any filtering
    dir: Path                # fed to the webkitdirectory input
    zip: Path | None         # fed to the file input (zip fixtures only)

    def expected(self, dots: bool) -> dict[str, bytes]:
        """The same two rules as the app: the ignore list always, the dot rule unless the checkbox is on."""
        return {p: b for p, b in self.files.items()
                if not ref_parse.is_ignored(p, IGNORES) and (dots or not ref_parse.is_dotted(p))}

    def skipped(self, dots: bool) -> set[str]:
        return set(self.files) - set(self.expected(dots))


@pytest.fixture(scope="session", params=NAMES)
def fix(request, tmp_path_factory) -> Fixture:
    name = request.param
    if name not in ZIPS:
        d = FIXTURES / name
        files = {f"{name}/{p.relative_to(d).as_posix()}": p.read_bytes() for p in sorted(d.rglob("*")) if p.is_file()}
        return Fixture(name, name, files, d, None)
    zpath = FIXTURES / f"{name}.zip"
    with zipfile.ZipFile(zpath) as zf:
        raw = {i.filename: zf.read(i) for i in zf.infolist() if not i.is_dir()}
    firsts = {n.split("/")[0] for n in raw}
    if len(firsts) == 1 and all("/" in n for n in raw):
        root, files = next(iter(firsts)), raw
    else:
        root, files = name, {f"{name}/{n}": b for n, b in raw.items()}
    out = tmp_path_factory.mktemp(name)  # unzipped copy, so the zip can also be fed as a folder
    for p, b in files.items():
        (out / p).parent.mkdir(parents=True, exist_ok=True)
        (out / p).write_bytes(b)
    return Fixture(name, root, files, out / root, zpath)


@pytest.fixture(scope="session")
def site():
    """`python3 -m http.server` on a free port in the repo root. 127.0.0.1 is a secure context, so the SW runs."""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    proc = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "-d", str(ROOT)],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(200):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                break
        except OSError:
            time.sleep(0.05)
    else:
        proc.kill()
        raise RuntimeError("http.server did not start")
    yield f"http://127.0.0.1:{port}/"
    proc.terminate()
    proc.wait(timeout=5)


@pytest.fixture(autouse=True)
def no_page_errors(page: Page):
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    yield
    assert not errors, errors


# ---------------------------------------------------------------- helpers

def open_page(page: Page, site: str, *, sha: bool = False, dots: bool = False) -> None:
    page.goto(site)
    page.locator("#sha").set_checked(sha)
    page.locator("#dots").set_checked(dots)


def run_input(page: Page, selector: str, path: Path) -> tuple[str, bytes]:
    """Feed a path to a file input and return (suggested filename, downloaded bytes)."""
    with page.expect_download() as info:
        page.locator(selector).set_input_files(str(path))
    d = info.value
    return d.suggested_filename, Path(d.path()).read_bytes()


def folder_to_md(page: Page, site: str, fix: Fixture, *, sha: bool, dots: bool = False) -> tuple[str, bytes]:
    open_page(page, site, sha=sha, dots=dots)
    return run_input(page, "#pick-dir", fix.dir)


def is_text(b: bytes) -> bool:
    if b"\0" in b:
        return False
    try:
        b.decode("utf-8")
        return True
    except UnicodeDecodeError:
        return False


def check_entries(md: bytes, exp: dict[str, bytes], *, sha: bool) -> None:
    got = {e["path"]: e for e in ref_parse.parse(md)}
    assert set(got) == set(exp)
    for p, b in exp.items():
        assert got[p]["bytes"] == b, p
        assert got[p]["kind"] == ("text" if is_text(b) else "binary"), p
        assert (got[p]["sha256"] is not None) == sha, p


def tree_paths(md: bytes) -> dict[str, int]:
    """Walk the `## Tree` block back into {path: byte count}."""
    text = md.decode("utf-8")
    m = re.search(r"^## Tree\n\n(`{3,})text\n(.*?)\n\1\n", text, re.S | re.M)
    assert m, "no tree block"
    lines = m.group(2).split("\n")
    assert lines[0].endswith("/")
    root, stack, out = lines[0][:-1], [], {}
    for line in lines[1:]:
        lm = re.match(r"^((?:│   |    )*)(?:├── |└── )(.*)$", line)
        assert lm, line
        depth, name = len(lm.group(1)) // 4, lm.group(2)
        del stack[depth:]
        if name.endswith("/"):
            stack.append(name[:-1])
        else:
            fm = re.match(r"^(.*)  \((text|binary), (\d+) bytes\)$", name)
            assert fm, name
            out["/".join([root, *stack, fm.group(1)])] = int(fm.group(3))
    return out


def corrupt(md: bytes) -> bytes:
    """Flip the first byte of the first non-empty content line inside the first fenced block that has one."""
    lines = md.split(b"\n")
    i = 0
    while True:
        while not lines[i].startswith(b"<!-- folder2md "):
            i += 1
        i += 1
        while not lines[i]:
            i += 1
        fence = re.match(rb"^(`{3,})", lines[i]).group(1)
        i += 1
        while lines[i] != fence:
            if lines[i] and lines[i][:1] != b"`":
                lines[i] = (b"Y" if lines[i][:1] == b"X" else b"X") + lines[i][1:]
                return b"\n".join(lines)
            i += 1
        i += 1


# ---------------------------------------------------------------- 1–3: folder2md

def test_folder2md_from_folder_with_checksums(page: Page, site: str, fix: Fixture):
    name, md = folder_to_md(page, site, fix, sha=True)
    assert name == f"{fix.root}.md"
    check_entries(md, fix.expected(dots=False), sha=True)


def test_folder2md_from_folder_without_checksums(page: Page, site: str, fix: Fixture):
    name, md = folder_to_md(page, site, fix, sha=False)
    assert name == f"{fix.root}.md"
    check_entries(md, fix.expected(dots=False), sha=False)


def test_folder2md_from_zip(page: Page, site: str, fix: Fixture):
    if fix.zip is None:
        pytest.skip("directory fixture")
    open_page(page, site, sha=True)
    name, md = run_input(page, "#pick-file", fix.zip)
    assert name == f"{fix.root}.md"
    check_entries(md, fix.expected(dots=False), sha=True)


# ---------------------------------------------------------------- 4: dot rule and ignore list

def test_dot_rule(page: Page, site: str, fix: Fixture):
    if not any(ref_parse.is_dotted(p) for p in fix.files):
        pytest.skip("fixture has no dotted paths")
    ignored = {p for p in fix.files if ref_parse.is_ignored(p, IGNORES)}
    for dots in (False, True):
        _, md = folder_to_md(page, site, fix, sha=False, dots=dots)
        got = {e["path"] for e in ref_parse.parse(md)}
        assert got == set(fix.expected(dots))
        assert not (got & ignored)
        if dots:
            assert any(ref_parse.is_dotted(p) for p in got)
        else:
            assert not any(ref_parse.is_dotted(p) for p in got)


def test_ignore_dialog(page: Page, site: str, fix: Fixture):
    open_page(page, site)
    dialog = page.locator("#ignored")
    page.locator("#view-ignored").click()
    expect(dialog).to_be_visible()
    expect(page.locator("#ignores-text")).to_contain_text(".DS_Store")
    expect(page.locator("#ignores-text")).to_contain_text("node_modules/")
    expect(page.locator("#skipped")).to_have_text("no run yet")
    page.keyboard.press("Escape")
    expect(dialog).to_be_hidden()

    run_input(page, "#pick-dir", fix.dir)
    page.locator("#view-ignored").click()
    expect(dialog).to_be_visible()
    text = page.locator("#skipped").text_content()
    exp = fix.skipped(dots=False)
    if exp:
        assert set(text.split("\n")) == exp
    else:
        assert text == "nothing skipped"


# ---------------------------------------------------------------- 5: document shape

def test_document_shape(page: Page, site: str, fix: Fixture):
    _, md = folder_to_md(page, site, fix, sha=False)
    assert MAGIC_RE.match(md.split(b"\n", 1)[0])
    exp = fix.expected(dots=False)
    tree = tree_paths(md)
    assert set(tree) == set(exp)
    assert tree == {p: len(b) for p, b in exp.items()}


# ---------------------------------------------------------------- 6–7: md2folder

def test_md2folder_round_trip(page: Page, site: str, fix: Fixture, tmp_path: Path):
    md_name, md = folder_to_md(page, site, fix, sha=True)
    md_path = tmp_path / md_name
    md_path.write_bytes(md)
    exp = fix.expected(dots=False)

    open_page(page, site)
    name, data = run_input(page, "#pick-file", md_path)
    if len(exp) == 1:
        (path, content), = exp.items()
        assert name == path.rsplit("/", 1)[-1]
        assert data == content
    else:
        assert name == f"{fix.root}.zip"
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            assert zf.testzip() is None
            assert all(i.compress_type == zipfile.ZIP_STORED for i in zf.infolist())
            assert {i.filename: zf.read(i) for i in zf.infolist()} == exp


def test_broken_md(page: Page, site: str, fix: Fixture, tmp_path: Path):
    _, md = folder_to_md(page, site, fix, sha=True)
    bad = corrupt(md)
    assert bad != md
    with pytest.raises(ValueError, match="md is broken"):
        ref_parse.parse(bad)

    bad_path = tmp_path / "broken.md"
    bad_path.write_bytes(bad)
    open_page(page, site)
    downloads = []
    page.on("download", lambda d: downloads.append(d))
    page.locator("#pick-file").set_input_files(str(bad_path))
    expect(page.locator("#status")).to_contain_text("md is broken")
    expect(page.locator("#status")).to_have_class(re.compile(r"\berror\b"))
    page.wait_for_timeout(300)
    assert not downloads


# ---------------------------------------------------------------- 8: PWA shape, plus theme and file://

def test_pwa_shape(page: Page, site: str):
    r = page.request.get(site + "manifest.webmanifest")
    assert r.ok
    manifest = r.json()
    assert manifest["name"] == "folder2md" and manifest["start_url"] == "./" and manifest["display"] == "standalone"
    index = (ROOT / "index.html").read_text(encoding="utf-8")
    assert f'<meta name="theme-color" content="{manifest["theme_color"]}">' in index
    for icon in manifest["icons"]:
        ir = page.request.get(site + icon["src"].removeprefix("./"))
        assert ir.ok and ir.headers["content-type"] == "image/png"
        w, h = (int(n) for n in icon["sizes"].split("x"))
        assert Image.open(io.BytesIO(ir.body())).size == (w, h)
    assert page.request.get(site + "sw.js").ok

    page.goto(site)
    state = page.evaluate("() => navigator.serviceWorker.ready.then(r => r.active ? r.active.state : null)")
    assert state in ("activating", "activated")
    expect(page.locator("#version")).to_have_text(re.compile(r"^\d+\.\d+\.\d+$"))


def test_theme_toggle_persists(page: Page, site: str):
    page.goto(site)
    html = page.locator("html")
    expect(html).not_to_have_attribute("data-theme", re.compile("."))
    page.locator("#theme").click()
    first = html.get_attribute("data-theme")
    assert first in ("light", "dark")
    page.reload()
    expect(html).to_have_attribute("data-theme", first)
    assert page.evaluate("localStorage.getItem('theme')") == first
    page.locator("#theme").click()
    expect(html).to_have_attribute("data-theme", "dark" if first == "light" else "light")


def test_file_protocol(page: Page, tmp_path: Path):
    """Chrome blocks fetch() and ES modules on file://; classic scripts must still make the page work there."""
    src = tmp_path / "tree"
    (src / "sub").mkdir(parents=True)
    (src / "a.txt").write_bytes(b"alpha\n")
    (src / "sub" / "b.bin").write_bytes(b"\x00\xff\x00")
    page.goto((ROOT / "index.html").as_uri())
    assert page.evaluate("typeof folder2md") == "object"
    name, md = run_input(page, "#pick-dir", src)
    assert name == "tree.md"
    check_entries(md, {"tree/a.txt": b"alpha\n", "tree/sub/b.bin": b"\x00\xff\x00"}, sha=False)
    registrations = page.evaluate(
        "() => 'serviceWorker' in navigator"
        " ? navigator.serviceWorker.getRegistrations().then(r => r.length, () => 0) : 0")
    assert registrations == 0
