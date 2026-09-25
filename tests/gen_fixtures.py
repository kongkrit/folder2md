"""One-off: write the test fixtures under tests/fixtures.  Run: uv run python tests/gen_fixtures.py

junk.zip   deflated, everything under junk/: text, binary, CRLF, empty and fence-heavy files, dotted paths,
           and every kind of always-ignored junk. It must be a zip: git refuses `.git/` components and
           .gitignore hides the rest, so it cannot be a plain directory in the repo.
flat.zip   STORE only, no common root, so the root falls back to the zip's stem.
plain/     a small ordinary tree, committed as files.
single/    exactly one file, so md2folder downloads the file itself instead of a zip.
"""
import struct
import zipfile
import zlib
from pathlib import Path

FIX = Path(__file__).resolve().parent / "fixtures"


def png(w: int = 4, h: int = 4, rgb=(9, 105, 218)) -> bytes:
    """A tiny valid RGB PNG, built by hand."""
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


JUNK = {
    "junk/README.md": b"# junk\n\nA fenced block:\n\n```py\nprint(1)\n```\n\nand ```` four ```` backticks.\n",
    "junk/src/main.py": b"def main():\n    print('h\xc3\xa9llo')\n\n\nif __name__ == '__main__':\n    main()\n",
    "junk/src/data.bin": bytes(range(256)) * 3,
    "junk/notes.txt": b"no trailing newline",
    "junk/crlf.txt": b"line one\r\nline two\r\n",
    "junk/empty.txt": b"",
    "junk/deep/a/b/c.txt": b"deep\n",
    "junk/photo.png": png(),
    "junk/Makefile": b"all:\n\t@echo ok\n",
    "junk/UPPER.TXT": b"upper\n",
    # dotted: kept only when "Include dot files and folders" is on
    "junk/.hidden": b"top-level dot file\n",
    "junk/.config/settings.toml": b"[x]\ny = 1\n",
    # always ignored, checkbox or not (the expected sets are computed from ignores.js, so this grouping is only a hint)
    "junk/.git/HEAD": b"ref: refs/heads/main\n",
    "junk/.git/objects/ab/cdef": b"\x00\x01",
    "junk/.DS_Store": b"\x00\x00\x00\x01Bud1",
    "junk/__MACOSX/._README.md": b"\x00\x05\x16\x07",
    "junk/src/__pycache__/main.cpython-313.pyc": b"\x00\x00pyc",
    "junk/node_modules/left-pad/index.js": b"module.exports = s => s;\n",
    "junk/Thumbs.db": b"\xd0\xcf\x11\xe0",
    # build-ish names that are NOT in ignores.txt, so they must be kept
    "junk/scratch.tmp": b"tmp\n",
    "junk/dist/bundle.js": b"!function(){}();\n",
    "junk/output/result.csv": b"a,b\n",
}
FLAT = {"a.txt": b"alpha\n", "b/c.txt": b"gamma\n"}
PLAIN = {
    "plain/README.md": b"# plain\n\nThree files, nothing to skip.\n",
    "plain/src/app.js": b"console.log(`template ${1 + 1}`);\n",
    "plain/assets/logo.png": png(8, 8, (207, 34, 46)),
}
SINGLE = {"single/hello.txt": b"hello, world\n"}


def write_zip(path: Path, files: dict[str, bytes], compression: int) -> None:
    with zipfile.ZipFile(path, "w", compression) as zf:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = compression
            zf.writestr(info, data)


def write_dir(files: dict[str, bytes]) -> None:
    for name, data in files.items():
        p = FIX / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)


if __name__ == "__main__":
    FIX.mkdir(parents=True, exist_ok=True)
    write_zip(FIX / "junk.zip", JUNK, zipfile.ZIP_DEFLATED)
    write_zip(FIX / "flat.zip", FLAT, zipfile.ZIP_STORED)
    write_dir(PLAIN)
    write_dir(SINGLE)
    print("wrote", sorted(p.name for p in FIX.iterdir()))
