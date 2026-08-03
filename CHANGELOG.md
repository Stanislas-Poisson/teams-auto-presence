# Changelog

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
