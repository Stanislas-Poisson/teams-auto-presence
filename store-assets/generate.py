"""
Generate the marketing images needed for the Chrome Web Store listing
(and GitHub's social preview).

Outputs (all flat RGB, no alpha channel - required by the Web Store for
screenshots and promo tiles):
- screenshot_schedule.png 1280x800  (store listing screenshot, required)
- small_promo_tile.png     440x280  (store listing, optional)
- marquee_promo.png       1400x560  (store listing, optional)
- github_social_preview.png 1280x640 (GitHub repo Settings > Social preview)

Real screenshots of the actual popup/options UI are produced separately
by screenshots.py (needs Playwright + a stubbed chrome.* API, since these
are genuine extension pages, unlike devtools-resize-fix which has no
visible UI to screenshot at all).

Usage: python3 store-assets/generate.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PURPLE = (98, 100, 167)
PURPLE_DARK = (66, 68, 122)
DARK_SLATE = (23, 23, 30)
SLATE = (139, 143, 156)
LIGHT_BG = (248, 248, 251)
WHITE = (255, 255, 255)
GREEN = (55, 214, 122)
RED = (196, 49, 75)
YELLOW = (255, 170, 68)
GREY = (138, 136, 134)

FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
SUPERSAMPLE = 2


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    return ImageFont.truetype(str(FONT_DIR / name), size * SUPERSAMPLE)


def centered_text(draw, cx, y, text, f, fill):
    bbox = draw.textbbox((0, 0), text, font=f)
    w = bbox[2] - bbox[0]
    draw.text((cx - w / 2, y), text, font=f, fill=fill)


def draw_clock_icon(draw, cx, cy, scale, color=WHITE, dot_color=GREEN):
    # Classic "ten past ten" watch-hand angle - reads unambiguously as a
    # clock at any size, unlike a plain 12+3 right angle which some
    # renders (esp. thick strokes at large scale) misread as the letter L.
    import math

    r = 20 * scale
    width = max(1, int(2.2 * scale))

    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=width)

    hour_angle = math.radians(-125)   # ~10 o'clock
    minute_angle = math.radians(-35)  # ~2 o'clock
    hour_len = r * 0.5
    minute_len = r * 0.68

    draw.line(
        [cx, cy, cx + hour_len * math.cos(hour_angle), cy + hour_len * math.sin(hour_angle)],
        fill=color, width=width,
    )
    draw.line(
        [cx, cy, cx + minute_len * math.cos(minute_angle), cy + minute_len * math.sin(minute_angle)],
        fill=color, width=width,
    )

    joint_r = width * 0.6
    draw.ellipse([cx - joint_r, cy - joint_r, cx + joint_r, cy + joint_r], fill=color)

    dot_r = r * 0.36
    dot_cx, dot_cy = cx + r * 0.78, cy + r * 0.78
    draw.ellipse(
        [dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r],
        fill=dot_color,
        outline=PURPLE_DARK,
        width=max(1, int(width * 0.6)),
    )


def build_schedule_screenshot() -> Image.Image:
    w, h = 1280 * SUPERSAMPLE, 800 * SUPERSAMPLE
    img = Image.new("RGB", (w, h), LIGHT_BG)
    draw = ImageDraw.Draw(img)

    centered_text(draw, w / 2, 56 * SUPERSAMPLE, "Teams Auto Presence", font(42, bold=True), DARK_SLATE)
    centered_text(
        draw,
        w / 2,
        114 * SUPERSAMPLE,
        "Automatically switches your Teams status on a schedule",
        font(20),
        SLATE,
    )

    # Day timeline: outside hours / work / lunch / work / outside hours.
    segments = [
        ("Outside hours", "-- 08:45", GREY),
        ("Work", "08:45 - 12:30", RED),
        ("Lunch break", "12:30 - 13:30", YELLOW),
        ("Work", "13:30 - 16:45", RED),
        ("Outside hours", "16:45 --", GREY),
    ]

    bar_y = 340 * SUPERSAMPLE
    bar_h = 140 * SUPERSAMPLE
    margin = 100 * SUPERSAMPLE
    bar_w = w - margin * 2
    weights = [1.0, 1.6, 0.9, 1.6, 1.0]
    total_weight = sum(weights)

    x = margin
    for (label, time_range, color), weight in zip(segments, weights):
        seg_w = bar_w * (weight / total_weight)
        draw.rectangle([x, bar_y, x + seg_w, bar_y + bar_h], fill=color)

        cx = x + seg_w / 2
        centered_text(draw, cx, bar_y + bar_h + 24 * SUPERSAMPLE, label, font(17, bold=True), DARK_SLATE)
        centered_text(draw, cx, bar_y + bar_h + 54 * SUPERSAMPLE, time_range, font(14), SLATE)

        draw_clock_icon(draw, cx, bar_y + bar_h / 2, 0.7 * SUPERSAMPLE, color=WHITE, dot_color=color)

        x += seg_w

    draw.rounded_rectangle([margin, bar_y, w - margin, bar_y + bar_h], radius=0, outline=WHITE, width=0)

    caption_y = bar_y + bar_h + 120 * SUPERSAMPLE
    centered_text(
        draw,
        w / 2,
        caption_y,
        "Fully configurable schedule and statuses - resumes on its own after a manual change",
        font(18),
        SLATE,
    )

    return img.resize((1280, 800), Image.LANCZOS)


def build_promo(
    width: int,
    height: int,
    *,
    title_size: int,
    subtitle_size: int,
    icon_scale: float,
    subtitle: str,
) -> Image.Image:
    w, h = width * SUPERSAMPLE, height * SUPERSAMPLE
    img = Image.new("RGB", (w, h), PURPLE)
    draw = ImageDraw.Draw(img)

    icon_cx = w * 0.16
    draw_clock_icon(draw, icon_cx, h / 2, icon_scale * SUPERSAMPLE)

    text_x = w * 0.28
    centered_block_y = h / 2
    title_f = font(title_size, bold=True)
    subtitle_f = font(subtitle_size)

    title = "Teams Auto Presence"

    title_bbox = draw.textbbox((0, 0), title, font=title_f)
    title_h = title_bbox[3] - title_bbox[1]
    subtitle_bbox = draw.textbbox((0, 0), subtitle, font=subtitle_f)
    gap = 14 * SUPERSAMPLE

    block_h = title_h + gap + (subtitle_bbox[3] - subtitle_bbox[1])
    start_y = centered_block_y - block_h / 2

    draw.text((text_x, start_y), title, font=title_f, fill=WHITE)
    draw.text((text_x, start_y + title_h + gap), subtitle, font=subtitle_f, fill=(224, 224, 240))

    return img.resize((width, height), Image.LANCZOS)


def main() -> None:
    out_dir = Path(__file__).parent

    full_subtitle = "Automatic Teams status on a schedule"
    short_subtitle = "Automatic Teams status"

    build_schedule_screenshot().save(out_dir / "screenshot_schedule.png")
    build_promo(
        440, 280, title_size=22, subtitle_size=13, icon_scale=1.3, subtitle=short_subtitle
    ).save(out_dir / "small_promo_tile.png")
    build_promo(
        1400, 560, title_size=48, subtitle_size=26, icon_scale=2.6, subtitle=full_subtitle
    ).save(out_dir / "marquee_promo.png")
    build_promo(
        1280, 640, title_size=44, subtitle_size=24, icon_scale=2.4, subtitle=full_subtitle
    ).save(out_dir / "github_social_preview.png")

    for name in ("screenshot_schedule.png", "small_promo_tile.png", "marquee_promo.png", "github_social_preview.png"):
        print(f"wrote {out_dir / name}")


if __name__ == "__main__":
    main()
