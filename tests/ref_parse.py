"""Independent Python reference parser for the folder2md format, plus a port of the ignore matcher.

Deliberately written without looking at core.js: the tests trust the Markdown only through what
the two parsers get back from it.
"""
import base64
import hashlib
import json
import re

MAGIC_RE = re.compile(rb'^folder2md-document: format=1 tool=folder2md/\S+ restore=".*"$')
FENCE_RE = re.compile(rb"^(`{3,})(\S*)$")
MARK_PRE, MARK_SUF = b"<!-- folder2md ", b" -->"


def parse(data: bytes) -> list[dict]:
    """Bytes in -> [{path, kind, sha256, bytes}], or ValueError("md is broken")."""
    try:
        lines = data.split(b"\n")
        if not MAGIC_RE.match(lines[0]):
            raise ValueError
        out, i = [], 1
        while True:
            while i < len(lines) and not (lines[i].startswith(MARK_PRE) and lines[i].endswith(MARK_SUF)):
                i += 1
            if i >= len(lines):
                break
            marker = json.loads(lines[i][len(MARK_PRE):-len(MARK_SUF)])
            i += 1
            while not lines[i]:
                i += 1
            fence = FENCE_RE.match(lines[i]).group(1)  # AttributeError when it is not a fence
            i += 1
            body = []
            while lines[i] != fence:  # IndexError at EOF
                body.append(lines[i])
                i += 1
            i += 1
            if marker["kind"] == "text":
                raw = b"\n".join(body)
            elif marker["kind"] == "binary":
                raw = base64.b64decode(b"".join(body), validate=True)
            else:
                raise ValueError
            if "sha256" in marker and hashlib.sha256(raw).hexdigest() != marker["sha256"]:
                raise ValueError
            out.append({"path": marker["path"], "kind": marker["kind"], "sha256": marker.get("sha256"), "bytes": raw})
        if not out:
            raise ValueError
        return out
    except Exception:
        raise ValueError("md is broken") from None


def glob_to_re(glob: str) -> re.Pattern:
    """`*` -> `.*`, `?` -> `.`, `[...]` passed through, everything else escaped; anchored."""
    out = "^"
    for ch in glob:
        out += ".*" if ch == "*" else "." if ch == "?" else ch if ch in "[]" else re.escape(ch)
    return re.compile(out + "$")


def load_ignores(ignores_js: str) -> list[re.Pattern]:
    """The patterns inside the IGNORES_TEXT template literal of ignores.js."""
    text = re.search(r"IGNORES_TEXT = `([^`]*)`", ignores_js).group(1)
    pats = []
    for line in text.split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.endswith("/"):
            line = line[:-1]
        try:
            pats.append(glob_to_re(line))
        except re.error:
            pass
    return pats


def is_ignored(path: str, pats: list[re.Pattern]) -> bool:
    """A hit on any path component, file or directory, skips the entry."""
    return any(p.match(c) for c in path.split("/") for p in pats)


def is_dotted(path: str) -> bool:
    return any(c.startswith(".") for c in path.split("/"))
