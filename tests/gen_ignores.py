"""One-off: wrap ignores.txt as ignores.js.  Run after editing ignores.txt: uv run python tests/gen_ignores.py

A classic script is the only way to ship the list for file:// (Chrome blocks fetch() of sibling files there).
The `.git/` group is added on top; everything else is ignores.txt verbatim, groups and comments kept.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HEADER = """\
// ignores.js — always-skipped paths. gitignore syntax: one pattern per line, `#` comments, blank lines ignored.
// Generated from ignores.txt by tests/gen_ignores.py (which adds the .git/ group); core.js parses it at load.
const IGNORES_TEXT = `
# VCS
.git/

"""

if __name__ == "__main__":
    text = (ROOT / "ignores.txt").read_text(encoding="utf-8")
    assert "`" not in text and "${" not in text, "ignores.txt must not contain backticks or ${"
    if not text.endswith("\n"):
        text += "\n"
    (ROOT / "ignores.js").write_text(HEADER + text + "`;\n", encoding="utf-8")
    print("wrote ignores.js from", len(text.splitlines()), "lines of ignores.txt")
