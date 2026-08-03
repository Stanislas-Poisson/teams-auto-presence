"""
Capture real screenshots of the extension's own UI (options.html,
popup.html) for the README and the Chrome Web Store listing.

Unlike devtools-resize-fix (no visible UI at all, hence hand-drawn mockups
in generate.py), these pages are genuine HTML the extension ships - so
real screenshots are both possible and more honest than a mockup. The
catch: chrome.storage / chrome.runtime / chrome.tabs don't exist when a
page is opened as a plain file:// URL (only inside a real extension
context), so options.js / popup.js would throw immediately. A minimal
stub is injected before the page's own scripts run, returning example
data, so the real page code runs unmodified and renders normally.

Usage: python3 store-assets/screenshots.py
Requires: pip install playwright && playwright install chromium
"""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parent.parent

LIGHT_BG = (248, 248, 251)
DARK_SLATE = (23, 23, 30)
SLATE = (139, 143, 156)
CARD_BG = (17, 18, 24)
FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")

EXAMPLE_STORE = {
    "config": {
        "schedule": {
            "workStart": {"h": 8, "m": 45},
            "lunchStart": {"h": 12, "m": 30},
            "lunchEnd": {"h": 13, "m": 30},
            "workEnd": {"h": 16, "m": 45},
        },
        "statusDuringWork": "busy",
        "statusDuringLunch": "away",
        "statusAfterWork": "offline",
    },
    "debug": False,
    "runtimeState": {
        "target": "busy",
        "lastApplied": "busy",
        "paused": False,
        "pausedTargetStatus": None,
        "skypeTokenCaptured": True,
        "updatedAt": 0,
    },
}

CHROME_STUB = f"""
window.chrome = {{
  storage: {{
    local: {{
      get: (defaults, cb) => cb({json.dumps(EXAMPLE_STORE)}),
      set: (obj, cb) => {{ if (cb) cb(); }},
    }},
    onChanged: {{ addListener: () => {{}} }},
  }},
  runtime: {{ openOptionsPage: () => {{}} }},
  tabs: {{ query: async () => [] }},
}};
"""


def capture(page, relative_path: str, out_name: str, *, viewport, selector=None):
    page.set_viewport_size(viewport)
    page.add_init_script(CHROME_STUB)
    page.goto(f"file://{ROOT / relative_path}")
    page.wait_for_timeout(150)  # let load()/render() run past the stubbed callbacks
    out_path = ROOT / "store-assets" / out_name
    if selector:
        # popup.html has no min-height:100vh (real popups shrink to their
        # content) - a full_page/viewport screenshot would leave a lot of
        # dead space below the card, so crop to the actual content box.
        page.locator(selector).screenshot(path=str(out_path))
    else:
        page.screenshot(path=str(out_path), full_page=True)
    print(f"wrote {out_path}")


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    return ImageFont.truetype(str(FONT_DIR / name), size)


def _centered_text(draw, cx, y, text, f, fill):
    bbox = draw.textbbox((0, 0), text, font=f)
    w = bbox[2] - bbox[0]
    draw.text((cx - w / 2, y), text, font=f, fill=fill)


def compose_listing_screenshot(source_name: str, out_name: str, title: str, subtitle: str) -> None:
    """
    The raw UI screenshots (options/popup) are whatever aspect ratio their
    real content is - nowhere near the Chrome Web Store's required
    1280x800 / 640x400 screenshot canvas. This composes each onto a
    branded 1280x800 canvas instead, matching the schedule concept
    screenshot from generate.py, so all listing screenshots look like one
    consistent set.
    """
    w, h = 1280, 800
    canvas = Image.new("RGB", (w, h), LIGHT_BG)
    draw = ImageDraw.Draw(canvas)

    _centered_text(draw, w / 2, 44, title, _font(32, bold=True), DARK_SLATE)
    _centered_text(draw, w / 2, 88, subtitle, _font(18), SLATE)

    shot = Image.open(ROOT / "store-assets" / source_name).convert("RGB")
    max_w, max_h = 980, 600
    ratio = min(max_w / shot.width, max_h / shot.height, 1.0)
    resized = shot.resize((int(shot.width * ratio), int(shot.height * ratio)), Image.LANCZOS)

    pad = 16
    card_w, card_h = resized.width + pad * 2, resized.height + pad * 2
    card_x = (w - card_w) // 2
    card_y = 150
    draw.rounded_rectangle(
        [card_x, card_y, card_x + card_w, card_y + card_h], radius=18, fill=CARD_BG
    )
    canvas.paste(resized, (card_x + pad, card_y + pad))

    out_path = ROOT / "store-assets" / out_name
    canvas.save(out_path)
    print(f"wrote {out_path}")


def build_store_icon() -> None:
    """
    icons/icon128.png has transparent rounded corners (fine for a browser
    toolbar icon) - but the Chrome Web Store's "Store icon" upload
    rejects images with an alpha channel. Flattened onto a white
    background for that one upload slot; the extension's own icon files
    are untouched.
    """
    icon = Image.open(ROOT / "icons" / "icon128.png").convert("RGBA")
    flat = Image.new("RGB", icon.size, (255, 255, 255))
    flat.paste(icon, (0, 0), icon)
    out_path = ROOT / "store-assets" / "store_icon_128.png"
    flat.save(out_path)
    print(f"wrote {out_path}")


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(device_scale_factor=2)

        capture(page, "options.html", "screenshot_options.png", viewport={"width": 760, "height": 900})
        capture(page, "popup.html", "screenshot_popup.png", viewport={"width": 360, "height": 700}, selector=".page")

        browser.close()

    compose_listing_screenshot(
        "screenshot_options.png", "screenshot_options_listing.png",
        "Configure your schedule", "Work hours, lunch break, and target statuses",
    )
    compose_listing_screenshot(
        "screenshot_popup.png", "screenshot_popup_listing.png",
        "Live status at a glance", "Resume automation or toggle debug mode anytime",
    )
    build_store_icon()


if __name__ == "__main__":
    main()
