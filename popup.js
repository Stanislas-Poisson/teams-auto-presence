const NS = 'teams-auto-presence';

const TEAMS_URLS = ['https://teams.microsoft.com/*', 'https://teams.live.com/*'];

const STATUS_LABELS = {
  available:    'Available',
  busy:         'Busy',
  doNotDisturb: 'Do not disturb',
  beRightBack:  'Be right back',
  away:         'Away',
  offline:      'Offline',
};

const targetEl       = document.getElementById('target');
const lastAppliedEl  = document.getElementById('lastApplied');
const tokenDotEl     = document.getElementById('tokenDot');
const tokenTextEl    = document.getElementById('tokenText');
const pauseBannerEl  = document.getElementById('pauseBanner');
const resumeBtn      = document.getElementById('resume');
const debugEl        = document.getElementById('debug');
const statusEl       = document.getElementById('status');
const accessBannerEl = document.getElementById('accessBanner');
const grantAccessBtn = document.getElementById('grantAccess');

function statusLabel(key) {
  return key ? (STATUS_LABELS[key] || key) : '-';
}

function render({ runtimeState, debug }) {
  const state = runtimeState || {};

  targetEl.textContent      = statusLabel(state.target);
  lastAppliedEl.textContent = statusLabel(state.lastApplied);

  tokenDotEl.classList.toggle('captured', !!state.skypeTokenCaptured);
  tokenTextEl.textContent = state.skypeTokenCaptured ? 'captured' : 'not captured';

  pauseBannerEl.classList.toggle('visible', !!state.paused);
  resumeBtn.disabled = !state.paused;

  debugEl.checked = !!debug;
}

function load() {
  chrome.storage.local.get({ runtimeState: null, debug: false }, render);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.runtimeState || changes.debug) // Chromium grants the host permissions when the extension is installed. Firefox (Manifest V3)
// leaves them to the user: say so, and ask with a click (the browser needs a user gesture).
function checkAccess() {
  chrome.permissions.contains({ origins: TEAMS_URLS }, (granted) => {
    accessBannerEl.classList.toggle('visible', !granted);
  });
}

grantAccessBtn.addEventListener('click', () => {
  chrome.permissions.request({ origins: TEAMS_URLS }, (granted) => {
    accessBannerEl.classList.toggle('visible', !granted);

    if (granted) {
      statusEl.textContent = 'Access granted: reload your Teams tab.';
      setTimeout(() => { statusEl.textContent = ''; }, 4000);
    }
  });
});

checkAccess();
load();
});

debugEl.addEventListener('change', () => {
  chrome.storage.local.set({ debug: debugEl.checked });
});

resumeBtn.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ url: TEAMS_URLS });
  if (tabs.length === 0) {
    statusEl.textContent = 'No Teams tab open.';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
    return;
  }
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { ns: NS, type: 'action', name: 'resumeAutomation' });
  }
  statusEl.textContent = 'Resume sent.';
  setTimeout(() => { statusEl.textContent = ''; }, 2000);
});

document.getElementById('openOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Chromium grants the host permissions when the extension is installed. Firefox (Manifest V3)
// leaves them to the user: say so, and ask with a click (the browser needs a user gesture).
function checkAccess() {
  chrome.permissions.contains({ origins: TEAMS_URLS }, (granted) => {
    accessBannerEl.classList.toggle('visible', !granted);
  });
}

grantAccessBtn.addEventListener('click', () => {
  chrome.permissions.request({ origins: TEAMS_URLS }, (granted) => {
    accessBannerEl.classList.toggle('visible', !granted);

    if (granted) {
      statusEl.textContent = 'Access granted: reload your Teams tab.';
      setTimeout(() => { statusEl.textContent = ''; }, 4000);
    }
  });
});

checkAccess();
load();
