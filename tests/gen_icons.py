"""One-off: draw icons/icon-192.png and icons/icon-512.png with Pillow.  Run: uv run python tests/gen_icons.py"""
from pathlib import Path

from PIL import Image, ImageDraw

ACCENT = "#0969da"
ROOT = Path(__file__).resolve().parents[1]


def draw(size: int) -> Image.Image:
    im = Image.new("RGBA", (size, size), ACCENT)  # full-bleed background: safe for "maskable"
    d = ImageDraw.Draw(im)
    s = size
    x0, y0, x1, y1 = s * 0.22, s * 0.30, s * 0.78, s * 0.72  # folder inside the central 60% (maskable safe zone)
    d.rounded_rectangle([x0, y0, x0 + s * 0.24, y0 + s * 0.12], radius=s * 0.03, fill="white")  # tab
    d.rounded_rectangle([x0, y0 + s * 0.07, x1, y1], radius=s * 0.04, fill="white")  # body
    for k, width in enumerate((0.40, 0.30, 0.22)):  # three "text lines": the Markdown inside the folder
        y = y0 + s * 0.17 + k * s * 0.10
        d.rounded_rectangle([x0 + s * 0.08, y, x0 + s * 0.08 + s * width, y + s * 0.045], radius=s * 0.02, fill=ACCENT)
    return im


if __name__ == "__main__":
    out = ROOT / "icons"
    out.mkdir(exist_ok=True)
    big = draw(512)
    big.save(out / "icon-512.png", optimize=True)
    big.resize((192, 192), Image.LANCZOS).save(out / "icon-192.png", optimize=True)
    print("wrote", sorted(p.name for p in out.iterdir()))
