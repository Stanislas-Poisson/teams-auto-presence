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

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parent.parent

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


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(device_scale_factor=2)

        capture(page, "options.html", "screenshot_options.png", viewport={"width": 760, "height": 900})
        capture(page, "popup.html", "screenshot_popup.png", viewport={"width": 360, "height": 700}, selector=".page")

        browser.close()


if __name__ == "__main__":
    main()
