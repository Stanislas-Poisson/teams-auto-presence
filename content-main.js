/**
 * Teams Auto Presence - MAIN world script
 *
 * Runs in the page's real JS context ("world": "MAIN" in manifest.json),
 * not the extension's isolated content-script world. A classic
 * (isolated-world) content script gets its own copy of window.fetch, so
 * overriding it there never intercepts the page's own fetch calls.
 * Running natively in the MAIN world means `window` here IS the page's
 * window, so no bridging is required to reach the real fetch.
 *
 * The tradeoff: MAIN-world scripts have no access to chrome.* APIs
 * (no chrome.storage, no chrome.runtime). Configuration and quick
 * actions (pause/resume, debug toggle) come from content-isolated.js
 * (which does have chrome.storage access) via window.postMessage,
 * namespaced under NS to avoid colliding with Teams' own postMessage
 * traffic between its iframes.
 *
 * No-Azure-AD strategy:
 * - Intercept native fetch() to capture the x-skypetoken as soon as it goes by
 * - Call PUT /ups/global/v1/me/forceavailability/ directly with that token
 * - Every 90s: simulate activity to block Teams' own switch to "Away"
 * - Every 60s: unconditionally re-apply the target status (force=true),
 *   without trusting a local cache. Teams can silently override the forced
 *   status internally (heartbeat/trouter, invisible in the fetch logs)
 *   without the script knowing otherwise - so it reconfirms via the API on
 *   every cycle rather than skipping the call when the last known value
 *   already matches the target.
 * - Automatic pause on manual change: any forceavailability PUT captured by
 *   the interceptor that isn't ours (our own calls always go through
 *   _origFetch directly, never through the wrapped fetch) is a manual
 *   choice made by the user (Teams' own presence menu). In that case the
 *   script stops re-forcing until the schedule slot changes (automatic
 *   resume on the next target change, or manual resume via the popup).
 *
 * Configuration: the extension's Options page (chrome://extensions ->
 * Teams Auto Presence -> Details -> Extension options), schedule and
 * target statuses. Quick actions (resume automation, debug mode): the
 * extension's popup (toolbar icon).
 *
 * Schedule (4 time boundaries):
 *   before workStart              -> "outside hours" status
 *   workStart..lunchStart         -> "during work" status
 *   lunchStart..lunchEnd          -> "during lunch" status
 *   lunchEnd..workEnd             -> "during work" status
 *   after workEnd                 -> "outside hours" status
 *   weekend (Saturday/Sunday)     -> "outside hours" status all day
 *
 * API discovered via HAR (internal endpoint, not the public Microsoft
 * Graph API):
 *   PUT https://teams.live.com/ups/global/v1/me/forceavailability/
 *   Body Busy    : {"availability":"Busy"}
 *   Body Offline : {"availability":"Offline","activity":"OffWork"}
 * The other 4 statuses (available/doNotDisturb/beRightBack/away) reuse
 * the documented Microsoft Graph enum values (same backend), not
 * individually verified via HAR.
 */

(function () {
  'use strict';

  const NS = 'teams-auto-presence';

  /* ==============================
   * DEFAULT CONFIG
   * Kept in sync by hand with content-isolated.js / options.js - no build
   * step in this extension to share a single source of truth between them.
   * ============================== */

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

  const PRESENCE_API = '/ups/global/v1/me/forceavailability/';

  // The 6 native statuses in Teams' presence menu. Key = short identifier
  // used in the config and in logs, never the display name (which can
  // change with the UI language).
  const PAYLOADS = {
    available:    { availability: 'Available' },
    busy:         { availability: 'Busy' },
    doNotDisturb: { availability: 'DoNotDisturb' },
    beRightBack:  { availability: 'BeRightBack' },
    away:         { availability: 'Away' },
    offline:      { availability: 'Offline', activity: 'OffWork' },
  };

  // Fixed headers observed in the HAR.
  const STATIC_HEADERS = {
    'content-type':              'application/json',
    'behavioroverride':          'redirectAs404',
    'x-ms-client-user-agent':   'Teams-V2-Web',
    'x-ms-client-type':         'cdlworker',
    'x-ms-client-consumer-type':'teams4life',
    'x-ms-client-caller':       'TeamsClient:setPresenceAvailability',
  };

  const CHECK_INTERVAL    = 60_000;   // check + forced re-application
  const ACTIVITY_INTERVAL = 90_000;   // anti-idle ping

  /* ==============================
   * STATE
   * ============================== */

  let config           = DEFAULTS;
  let debugEnabled      = false;

  let skypeToken    = null;
  let endpointId    = null;
  let sessionId     = null;
  let clientVersion = null;
  let lastApplied   = null;
  let baseUrl       = null;

  // Automatic pause when a manual change is detected (see the fetch
  // interceptor below). pausedTargetStatus keeps the schedule's target at
  // the moment of pausing: as long as the target doesn't change, the
  // manual choice is respected. As soon as it changes (new time slot),
  // automatic resume kicks back in.
  let paused             = false;
  let pausedTargetStatus = null;

  /* ==============================
   * LOGGER
   * ============================== */

  function nowStamp() {
    const d   = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  const log   = msg => console.log(`[AutoPresence] ${nowStamp()} ${msg}`);
  const warn  = msg => console.warn(`[AutoPresence] ${nowStamp()} ${msg}`);
  const debug = (...args) => { if (debugEnabled) console.log('[AutoPresence:DEBUG]', nowStamp(), ...args); };

  /* ==============================
   * BRIDGE TO content-isolated.js (chrome.storage / popup actions)
   * ============================== */

  function broadcastState() {
    window.postMessage({
      ns: NS,
      type: 'state',
      payload: {
        target:             targetStatus(),
        lastApplied,
        paused,
        pausedTargetStatus,
        skypeTokenCaptured: !!skypeToken,
        updatedAt:          Date.now(),
      },
    }, window.location.origin);
  }

  function resumeAutomation() {
    paused             = false;
    pausedTargetStatus = null;
    log('Resume requested (popup), re-applying immediately.');
    checkAndApply();
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.ns !== NS) return;

    if (msg.type === 'config') {
      config = {
        schedule: { ...DEFAULTS.schedule, ...(msg.payload.config?.schedule || {}) },
        statusDuringWork:  msg.payload.config?.statusDuringWork  ?? DEFAULTS.statusDuringWork,
        statusDuringLunch: msg.payload.config?.statusDuringLunch ?? DEFAULTS.statusDuringLunch,
        statusAfterWork:   msg.payload.config?.statusAfterWork   ?? DEFAULTS.statusAfterWork,
      };
      debugEnabled = !!msg.payload.debugEnabled;
      debug('Config received via the bridge —', config, `debug: ${debugEnabled}`);
      return;
    }

    if (msg.type === 'action' && msg.name === 'resumeAutomation') {
      resumeAutomation();
    }
  });

  /* ==============================
   * FETCH INTERCEPTOR
   * Captures auth headers on any Teams request.
   * Here `window.fetch` IS the page's real fetch (world: MAIN).
   * ============================== */

  const _origFetch = window.fetch.bind(window);

  // Describes the payload of an external presence change (native Teams) for
  // the log message, without trying to match it back to a PAYLOADS key
  // (the reverse mapping wouldn't add anything over a clear log line).
  function describeManualPayload(body) {
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : null;
      if (!parsed?.availability) return 'unknown';
      return parsed.activity ? `${parsed.availability}/${parsed.activity}` : parsed.availability;
    } catch {
      return 'unknown';
    }
  }

  // Any forceavailability PUT captured here is necessarily external
  // (native Teams, e.g. a manual click in the presence menu): our own
  // calls go through _origFetch directly, never through this wrapped fetch.
  function handleManualPresenceChange(body) {
    paused = true;
    pausedTargetStatus = targetStatus();
    log(
      `Manual change detected (Teams sent ${describeManualPayload(body)}), ` +
      'pausing auto re-application until the next schedule change or manual resume.'
    );
    broadcastState();
  }

  window.fetch = function (input, init = {}) {
    try {
      const url     = typeof input === 'string' ? input : input?.url || '';
      const headers = init?.headers || (typeof input === 'object' ? input.headers : {});
      const method  = (init?.method || (typeof input === 'object' ? input.method : null) || 'GET').toUpperCase();

      if (url.includes('teams.live.com') || url.includes('teams.microsoft.com')) {
        if (!baseUrl) {
          try {
            const u = new URL(url);
            baseUrl = `${u.protocol}//${u.host}`;
          } catch {}
        }

        const get = name => {
          if (!headers) return null;
          if (typeof headers.get === 'function') return headers.get(name);
          if (typeof headers === 'object')       return headers[name] || null;
          return null;
        };

        const tok = get('x-skypetoken');
        const eid = get('x-ms-endpoint-id');
        const sid = get('x-ms-session-id');
        const ver = get('x-ms-client-version');

        debug(`fetch intercepted — ${url}`, `x-skypetoken present: ${!!tok}`);

        if (tok && tok !== skypeToken) {
          skypeToken = tok;
          log('skypetoken captured/refreshed.');
        }
        if (eid) endpointId    = eid;
        if (sid) sessionId     = sid;
        if (ver) clientVersion = ver;

        if (method === 'PUT' && url.includes(PRESENCE_API)) {
          const body = init?.body ?? (typeof input === 'object' ? input.body : null);
          debug('External presence PUT intercepted —', url, 'body:', body);
          handleManualPresenceChange(body);
        }
      }
    } catch (e) {
      debug('Fetch interceptor error —', e.message);
    }

    return _origFetch(input, init);
  };

  /* ==============================
   * SCHEDULE LOGIC
   * ============================== */

  function toMinutes(t) {
    return t.h * 60 + t.m;
  }

  function targetStatus() {
    const now = new Date();

    const day = now.getDay();
    if (day === 0 || day === 6) return config.statusAfterWork;

    const mins       = now.getHours() * 60 + now.getMinutes();
    const workStart  = toMinutes(config.schedule.workStart);
    const lunchStart = toMinutes(config.schedule.lunchStart);
    const lunchEnd    = toMinutes(config.schedule.lunchEnd);
    const workEnd    = toMinutes(config.schedule.workEnd);

    if (mins < workStart)  return config.statusAfterWork;
    if (mins < lunchStart) return config.statusDuringWork;
    if (mins < lunchEnd)   return config.statusDuringLunch;
    if (mins < workEnd)    return config.statusDuringWork;
    return config.statusAfterWork;
  }

  /* ==============================
   * PRESENCE API CALL
   * ============================== */

  async function setPresence(status) {
    if (!PAYLOADS[status]) {
      warn(`Unknown status "${status}", check the configuration (valid keys: ${Object.keys(PAYLOADS).join(', ')}).`);
      return false;
    }
    if (!skypeToken) {
      warn('No skypetoken yet — waiting for the first Teams request.');
      return false;
    }
    if (!baseUrl) {
      warn('baseUrl not resolved.');
      return false;
    }

    const url     = `${baseUrl}${PRESENCE_API}`;
    const payload = PAYLOADS[status];

    const headers = {
      ...STATIC_HEADERS,
      'x-skypetoken': skypeToken,
    };
    if (endpointId)    headers['x-ms-endpoint-id']   = endpointId;
    if (sessionId)     headers['x-ms-session-id']    = sessionId;
    if (clientVersion) headers['x-ms-client-version'] = clientVersion;
    headers['x-ms-correlation-id'] = crypto.randomUUID();
    headers['x-ms-request-id']     = '';
    headers['x-ms-object-id']      = '';

    debug(`PUT call ${url}`, `payload: ${JSON.stringify(payload)}`, `endpointId: ${endpointId}`, `sessionId: ${sessionId}`);

    try {
      const resp = await _origFetch(url, {
        method:  'PUT',
        headers,
        body:    JSON.stringify(payload),
      });

      if (resp.ok) {
        log(`Status set: ${status} (${resp.status})`);
        lastApplied = status;
        return true;
      } else {
        warn(`API call failed: ${resp.status} ${resp.statusText}`);
        if (resp.status === 401 || resp.status === 403) {
          skypeToken = null;
          warn('Invalid token, waiting for Teams to renew it.');
        }
        return false;
      }
    } catch (err) {
      warn(`Network error: ${err.message}`);
      return false;
    }
  }

  /* ==============================
   * LOOPS
   * ============================== */

  async function checkAndApply() {
    const target = targetStatus();

    if (paused) {
      if (target === pausedTargetStatus) {
        log(`Paused (manual change), current target: ${target}, nothing to do.`);
        broadcastState();
        return;
      }
      log(`Automatic resume — schedule change (new target: ${target}), ending pause.`);
      paused             = false;
      pausedTargetStatus = null;
    }

    log(`Check — target: ${target}, last applied: ${lastApplied ?? 'none'}`);
    await setPresence(target);
    broadcastState();
  }

  function simulateActivity() {
    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: Math.floor(Math.random() * window.innerWidth),
      clientY: Math.floor(Math.random() * window.innerHeight),
    }));
  }

  /* ==============================
   * INIT
   * ============================== */

  function init() {
    const s = config.schedule;
    log(
      `Started — ${String(s.workStart.h).padStart(2,'0')}:${String(s.workStart.m).padStart(2,'0')}-` +
      `${String(s.lunchStart.h).padStart(2,'0')}:${String(s.lunchStart.m).padStart(2,'0')} and ` +
      `${String(s.lunchEnd.h).padStart(2,'0')}:${String(s.lunchEnd.m).padStart(2,'0')}-` +
      `${String(s.workEnd.h).padStart(2,'0')}:${String(s.workEnd.m).padStart(2,'0')}: ${config.statusDuringWork}, ` +
      `lunch break: ${config.statusDuringLunch}, outside hours/weekend: ${config.statusAfterWork} ` +
      '(default config, waiting for the extension config).'
    );

    // First application after 8s (lets Teams authenticate, emit requests,
    // and gives content-isolated.js's bridge time to deliver the real
    // config stored in chrome.storage).
    setTimeout(checkAndApply, 8_000);

    setInterval(checkAndApply, CHECK_INTERVAL);
    setInterval(simulateActivity, ACTIVITY_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
