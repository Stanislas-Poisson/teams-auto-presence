/**
 * Teams Auto Presence - ISOLATED world bridge
 *
 * Runs in the extension's normal (isolated) content-script world, so it
 * has chrome.storage / chrome.runtime access, unlike content-main.js
 * (world: MAIN, no chrome.* APIs). Its only job is to shuttle data
 * across that boundary via window.postMessage, namespaced under NS:
 *
 *   chrome.storage (config, debug flag)  --> content-main.js  (type: 'config')
 *   popup.js quick actions (chrome.runtime message) --> content-main.js (type: 'action')
 *   content-main.js runtime state --> chrome.storage (read by popup.js) (type: 'state')
 */

(function () {
  'use strict';

  const NS = 'teams-auto-presence';

  // Kept in sync by hand with content-main.js / options.js - no build step
  // in this extension to share a single source of truth between them.
  const DEFAULTS = {
    schedule: {
      workStart:  { h: 8,  m: 45 },
      lunchStart: { h: 12, m: 30 },
      lunchEnd:   { h: 13, m: 30 },
      workEnd:    { h: 16, m: 45 },
    },
    statusDuringWork:  'busy',
    statusDuringLunch: 'away',
    statusAfterWork:   'offline',
  };

  function broadcastConfig() {
    chrome.storage.local.get({ config: DEFAULTS, debug: false }, ({ config, debug }) => {
      window.postMessage({ ns: NS, type: 'config', payload: { config, debugEnabled: debug } }, window.location.origin);
    });
  }

  // Initial sync on page/frame load.
  broadcastConfig();

  // Any change from options.html or popup.html (debug toggle) is reflected
  // immediately in the MAIN world, without waiting for content-main.js's
  // next 60s cycle.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.config || changes.debug) broadcastConfig();
  });

  // One-off actions sent by popup.js (e.g. "Resume automation").
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.ns !== NS || msg.type !== 'action') return;
    window.postMessage({ ns: NS, type: 'action', name: msg.name }, window.location.origin);
  });

  // Current state reported by content-main.js (current target, last applied
  // status, pause) - persisted to chrome.storage so popup.js can read it
  // directly without a round trip through an active tab.
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.ns !== NS || msg.type !== 'state') return;
    chrome.storage.local.set({ runtimeState: msg.payload });
  });

})();
