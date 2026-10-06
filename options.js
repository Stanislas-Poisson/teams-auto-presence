// Kept in sync by hand with content-main.js / content-isolated.js - no build
// step in this extension to share a single source of truth between them.
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

const STATUS_OPTIONS = [
  { value: 'available',    label: 'Available' },
  { value: 'busy',         label: 'Busy' },
  { value: 'doNotDisturb', label: 'Do not disturb' },
  { value: 'beRightBack',  label: 'Be right back' },
  { value: 'away',         label: 'Away' },
  { value: 'offline',      label: 'Offline' },
];

const els = {
  workStart:  document.getElementById('workStart'),
  lunchStart: document.getElementById('lunchStart'),
  lunchEnd:   document.getElementById('lunchEnd'),
  workEnd:    document.getElementById('workEnd'),
  statusDuringWork:  document.getElementById('statusDuringWork'),
  statusDuringLunch: document.getElementById('statusDuringLunch'),
  statusAfterWork:   document.getElementById('statusAfterWork'),
  status: document.getElementById('status'),
  error:  document.getElementById('error'),
};

for (const select of [els.statusDuringWork, els.statusDuringLunch, els.statusAfterWork]) {
  select.replaceChildren(...STATUS_OPTIONS.map(o => new Option(o.label, o.value)));
}

function fmtHM(t) {
  return `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`;
}

function parseHM(str) {
  const [h, m] = str.split(':').map(Number);
  return { h, m };
}

function toMinutes(t) {
  return t.h * 60 + t.m;
}

function load() {
  chrome.storage.local.get({ config: DEFAULTS }, ({ config }) => {
    els.workStart.value  = fmtHM(config.schedule.workStart);
    els.lunchStart.value = fmtHM(config.schedule.lunchStart);
    els.lunchEnd.value   = fmtHM(config.schedule.lunchEnd);
    els.workEnd.value    = fmtHM(config.schedule.workEnd);
    els.statusDuringWork.value  = config.statusDuringWork;
    els.statusDuringLunch.value = config.statusDuringLunch;
    els.statusAfterWork.value   = config.statusAfterWork;
  });
}

function save() {
  els.error.textContent = '';

  const schedule = {
    workStart:  parseHM(els.workStart.value),
    lunchStart: parseHM(els.lunchStart.value),
    lunchEnd:   parseHM(els.lunchEnd.value),
    workEnd:    parseHM(els.workEnd.value),
  };

  if (Object.values(schedule).some(t => Number.isNaN(t.h) || Number.isNaN(t.m))) {
    els.error.textContent = 'Please fill in all 4 times.';
    return;
  }

  if (!(toMinutes(schedule.workStart) < toMinutes(schedule.lunchStart) &&
        toMinutes(schedule.lunchStart) < toMinutes(schedule.lunchEnd) &&
        toMinutes(schedule.lunchEnd) < toMinutes(schedule.workEnd))) {
    els.error.textContent = 'The 4 times must be in chronological order (start < lunch start < lunch end < end).';
    return;
  }

  const config = {
    schedule,
    statusDuringWork:  els.statusDuringWork.value,
    statusDuringLunch: els.statusDuringLunch.value,
    statusAfterWork:   els.statusAfterWork.value,
  };

  chrome.storage.local.set({ config }, () => {
    els.status.textContent = 'Saved.';
    setTimeout(() => { els.status.textContent = ''; }, 1500);
  });
}

document.getElementById('save').addEventListener('click', save);

document.getElementById('reset').addEventListener('click', () => {
  chrome.storage.local.set({ config: DEFAULTS }, load);
});

load();
