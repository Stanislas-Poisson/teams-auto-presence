# Changelog

## 1.1.2 - 2026-10-12

- Fix: the configuration could be lost when the MAIN script loaded after the isolated one (seen on Firefox): the schedule ran with the default configuration. The MAIN script now asks for the configuration when it is ready.
- The CI loads the packages in Chrome, Edge and Firefox and plays the flow against a fake Teams page (`tests/e2e`).

## 1.1.1 - 2026-10-12

- Fix: the popup registered one more click listener on the access button at each state change (a block was pasted inside the storage listener). Each click sent one permission request per listener.

## 1.1.0 - 2026-10-06

- The CI checks both zips (and that only the Firefox one carries the add-on id), lints the Firefox package with web-ext, and the release writes one checksum per zip.

- Firefox: `build.sh` makes a Firefox zip (`teams-auto-presence-X.Y.Z-firefox.zip`)
  next to the Chromium one, from the same sources, with the add-on id, the minimum
  version (142) and the data collection declaration (none) added to the manifest
  (`manifest.firefox.json`). The package passes `web-ext lint` without a warning.
- The popup asks for the permission to work on Teams when the browser has not
  granted it (Firefox leaves the host permissions to the user).
- The options page is declared with `options_ui` (opens in a tab), understood by
  Chromium and Firefox. The status list of the options page is built with the DOM
  instead of `innerHTML`.
- README: install steps for Edge, Opera, Brave and Firefox.

## 1.0.0 - 2026-08-03

- Initial release: Manifest V3 extension that automatically switches
  your Teams presence status on a configurable schedule (work / lunch /
  outside hours).
- Fetch interception runs in a native `"world": "MAIN"` content script
  (`content-main.js`), directly in the page's real JS context.
  `content-isolated.js` bridges `chrome.storage` in and runtime state
  out via `window.postMessage`.
- Configuration UI: `options.html` for the schedule/status settings,
  `popup.html` for live status and quick actions (resume automation,
  debug toggle).
- 60s forced re-application, 90s anti-idle ping, automatic pause on
  manual status change in Teams, resume on the next schedule change.
