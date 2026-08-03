"""
Regenerate the extension icons (icons/icon16.png, icon48.png, icon128.png).

Clock face (the schedule) with a presence dot (the automated status) on a
rounded square background. Hands are set at the classic "ten past ten"
watch angle - a plain 12+3 right angle reads fine inside a small circle,
but at icon/promo scale with thick strokes it can be misread as the
letter L, so the hands are angled instead. No external assets, no
network - just Pillow primitives, so anyone can rebuild the icons
deterministically.

Usage: python3 icons/generate.py
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

BACKGROUND = (98, 100, 167, 255)   # #6264A7 - Teams purple
FOREGROUND = (255, 255, 255, 255)
DOT = (55, 214, 122, 255)          # presence dot, "available" green
DOT_OUTLINE = (22, 24, 34, 255)
SIZES = (16, 48, 128)
SUPERSAMPLE = 8


def draw_icon(size: int) -> Image.Image:
    canvas_size = size * SUPERSAMPLE
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    radius = int(canvas_size * 0.22)
    draw.rounded_rectangle(
        [(0, 0), (canvas_size - 1, canvas_size - 1)],
        radius=radius,
        fill=BACKGROUND,
    )

    cx = cy = canvas_size / 2
    r = canvas_size / 2 - canvas_size * 0.22
    width = max(1, int(canvas_size * 0.05))

    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=FOREGROUND, width=width)

    hour_angle = math.radians(-125)
    minute_angle = math.radians(-35)
    hour_len = r * 0.5
    minute_len = r * 0.68

    draw.line(
        [cx, cy, cx + hour_len * math.cos(hour_angle), cy + hour_len * math.sin(hour_angle)],
        fill=FOREGROUND, width=width,
    )
    draw.line(
        [cx, cy, cx + minute_len * math.cos(minute_angle), cy + minute_len * math.sin(minute_angle)],
        fill=FOREGROUND, width=width,
    )

    joint_r = width * 0.6
    draw.ellipse([cx - joint_r, cy - joint_r, cx + joint_r, cy + joint_r], fill=FOREGROUND)

    dot_r = canvas_size * 0.16
    dot_cx = dot_cy = canvas_size - dot_r * 0.9
    draw.ellipse(
        [dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r],
        fill=DOT,
        outline=DOT_OUTLINE,
        width=max(1, int(canvas_size * 0.04)),
    )

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    out_dir = Path(__file__).parent
    for size in SIZES:
        icon = draw_icon(size)
        out_path = out_dir / f"icon{size}.png"
        icon.save(out_path)
        print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
