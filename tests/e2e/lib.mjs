// Helpers of the end-to-end tests: the fake Teams server, the packages under test and the browsers.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Browser, Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import edge from 'selenium-webdriver/edge.js';
import firefox from 'selenium-webdriver/firefox.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const FIREFOX_ID = 'teams-auto-presence@stanislas-poisson.fr';
export const FIREFOX_UUID = 'a1b2c3d4-0000-4000-8000-000000000001';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits until check() returns something truthy, and returns it.
export async function waitFor(check, { timeout = 90_000, interval = 250, message = 'condition' } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await check();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for ${message}${last instanceof Error ? ` (${last.message})` : ''}`);
}

// ---------------------------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------------------------

export function version() {
  return JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).version;
}

// The zip built by build.sh, which is the package that goes to the stores.
export function zipFor(browser) {
  const name = browser === 'firefox' ? `teams-auto-presence-${version()}-firefox.zip` : `teams-auto-presence-${version()}.zip`;
  const zip = path.join(root, 'dist', name);
  if (!fs.existsSync(zip)) {
    execFileSync('bash', [path.join(root, 'build.sh')], { stdio: 'inherit' });
  }
  return zip;
}

// Unzips a package. With withLocalhost, the manifest and the list of addresses of the popup also have
// http://localhost, so that the extension works on the fake Teams page. Nothing else is changed.
export function unpack(zip, { withLocalhost = false } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tap-ext-')));
  execFileSync('unzip', ['-q', zip, '-d', dir]);

  if (withLocalhost) {
    const file = path.join(dir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    manifest.host_permissions.push('http://localhost/*');
    for (const script of manifest.content_scripts) {
      script.matches.push('http://localhost/*');
    }
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2));

    // The popup looks for the Teams tabs with its own list of addresses.
    const popup = path.join(dir, 'popup.js');
    const source = fs.readFileSync(popup, 'utf8');
    const patched = source.replace('const TEAMS_URLS = [', "const TEAMS_URLS = ['http://localhost/*', ");
    if (patched === source) throw new Error('TEAMS_URLS not found in popup.js');
    fs.writeFileSync(popup, patched);
  }
  return dir;
}

// Firefox installs a zip, not a folder.
export function zipDir(dir) {
  const zip = `${dir}.zip`;
  execFileSync('zip', ['-q', '-r', zip, '.'], { cwd: dir });
  return zip;
}

// ---------------------------------------------------------------------------------------------
// Fake Teams
// ---------------------------------------------------------------------------------------------

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Fake Teams</title></head>
<body>
<p id="ready">waiting</p>
<script>
  // The extension reads the URL to know it is on Teams, so the path carries the host name.
  const base = location.origin + '/teams.microsoft.com';

  // What Teams does: a request with the session headers.
  window.__traffic = () => fetch(base + '/api/ping', {
    headers: { 'x-skypetoken': 'fake-skype-token', 'x-ms-endpoint-id': 'endpoint-1', 'x-ms-session-id': 'session-1' },
  });

  // What a click in the presence menu of Teams does.
  window.__manualPresence = () => fetch(base + '/ups/global/v1/me/forceavailability/', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-skypetoken': 'fake-skype-token' },
    body: JSON.stringify({ availability: 'Busy' }),
  });

  window.__traffic().then(() => { document.getElementById('ready').textContent = 'ready'; });
</script>
</body></html>`;

export async function startFakeTeams() {
  // The presence calls received, from the extension or from the page.
  const presenceCalls = [];

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');

      if (req.url.includes('/ups/global/v1/me/forceavailability/') && req.method === 'PUT') {
        presenceCalls.push({ headers: req.headers, body: body ? JSON.parse(body) : null });
        res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
        return;
      }
      if (req.url.startsWith('/teams.microsoft.com/')) {
        res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
        return;
      }
      if (req.url === '/teams.html') {
        res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
        return;
      }
      res.writeHead(404).end();
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    url: `http://localhost:${port}/teams.html`,
    presenceCalls,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// ---------------------------------------------------------------------------------------------
// Browsers
// ---------------------------------------------------------------------------------------------

// The id Chromium gives to an unpacked extension: the hash of its path, written with the letters a-p.
function chromiumId(dir) {
  const hash = crypto.createHash('sha256').update(dir).digest('hex').slice(0, 32);
  return [...hash].map((char) => String.fromCharCode('a'.charCodeAt(0) + parseInt(char, 16))).join('');
}

// chromedriver starts the browser with --disable-extensions by default: excludeSwitches removes it.
const CHROMIUM_ARGS = (dir) => [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-sync',
  '--window-size=1280,900',
  `--load-extension=${dir}`,
  // Recent Chrome and Edge ignore --load-extension unless this feature is disabled.
  '--disable-features=DisableLoadExtensionCommandLineSwitch',
];

// The release asset that Selenium Manager could not download, as the error reports it.
const GECKODRIVER_ASSET = /https:\/\/github\.com\/mozilla\/geckodriver\/releases\/download\/(v[\d.]+)\/(geckodriver-v[\d.]+-([\w-]+)\.tar\.gz)/;
const GECKODRIVER_MIRROR = 'https://registry.npmmirror.com/-/binary/geckodriver';

// GitHub Releases answers 504 now and then, and Selenium Manager has no other source for geckodriver (its mirror option needs a
// geckodriver-support.json that the mirrors do not have). Downloads the very same asset from a mirror and hands it to Selenium
// Manager through a temporary folder, used by this retry only (nothing is kept in the usual cache of the machine), and returns
// true. Returns false when the error is not that download.
async function useGeckodriverMirror(error) {
  const match = GECKODRIVER_ASSET.exec(`${error?.message ?? ''} ${error?.cause?.message ?? ''}`);
  if (!match) return false;
  const [, version, asset, platform] = match;
  const url = `${GECKODRIVER_MIRROR}/${version}/${asset}`;
  console.log(`[e2e] geckodriver ${version} cannot be downloaded from GitHub, trying ${url}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`the mirror answers ${response.status} for ${url}`);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'geckodriver-'));
  const archive = path.join(work, asset);
  fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  execFileSync('tar', ['-xzf', archive, '-C', work]);
  const binary = path.join(work, 'geckodriver');
  fs.chmodSync(binary, 0o755);
  // What was downloaded must be a geckodriver of the version asked for, before it is trusted.
  const reported = execFileSync(binary, ['--version'], { encoding: 'utf8' });
  if (!reported.startsWith(`geckodriver ${version.slice(1)} `)) {
    throw new Error(`the file of the mirror is not geckodriver ${version}: ${reported.split('\n')[0]}`);
  }
  // <folder>/geckodriver/<platform>/<version without the v>/geckodriver, the layout that Selenium Manager reads before it downloads.
  const cache = path.join(work, 'selenium');
  const target = path.join(cache, 'geckodriver', platform, version.slice(1));
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(binary, path.join(target, 'geckodriver'));
  process.env.SE_CACHE_PATH = cache;
  console.log(`[e2e] geckodriver ${version} comes from the mirror, in ${target}`);
  return true;
}

// Starts Firefox. When Selenium Manager cannot download geckodriver from GitHub, retries once with the mirror.
async function buildFirefox() {
  const build = async () => {
    const options = new firefox.Options()
      .addArguments('-headless')
      .setPreference('extensions.webextensions.uuids', JSON.stringify({ [FIREFOX_ID]: FIREFOX_UUID }));
    // geckodriver needs --allow-system-access to open the pages of the extension from the browser interface.
    const service = new firefox.ServiceBuilder().addArguments('--allow-system-access');
    return new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options).setFirefoxService(service).build();
  };
  try {
    return await build();
  } catch (error) {
    if (!(await useGeckodriverMirror(error))) throw error;
    return build();
  }
}

// Starts the browser with the extension loaded, and returns the driver and the base URL of its pages.
async function launchOnce(browser, { dir, zip }) {
  if (browser === 'firefox') {
    const driver = await buildFirefox();
    await driver.manage().setTimeouts({ pageLoad: 60_000, script: 60_000 });
    await driver.installAddon(zip, true);
    return { driver, base: `moz-extension://${FIREFOX_UUID}/` };
  }

  const builder = new Builder();
  if (browser === 'edge') {
    const options = new edge.Options().addArguments(...CHROMIUM_ARGS(dir)).excludeSwitches('disable-extensions');
    // Selenium Manager downloads its own build, as it does on a machine without Edge.
    options.setBrowserVersion('stable');
    builder.forBrowser(Browser.EDGE).setEdgeOptions(options);
  } else {
    const options = new chrome.Options().addArguments(...CHROMIUM_ARGS(dir)).excludeSwitches('disable-extensions');
    if (process.env.BROWSER_BINARY) {
      options.setChromeBinaryPath(process.env.BROWSER_BINARY);
    } else {
      // Chrome for Testing, downloaded by Selenium Manager: the Chrome of the runner ignores --load-extension.
      options.setBrowserVersion('stable');
    }
    builder.forBrowser(Browser.CHROME).setChromeOptions(options);
  }
  const driver = await builder.build();
  const base = `chrome-extension://${chromiumId(dir)}/`;

  // The renderer of a freshly started Chromium can be stuck on its first page, mostly Edge on a runner.
  // The first page is loaded here, with a short limit, so that the caller starts the browser again if it fails.
  try {
    await driver.manage().setTimeouts({ pageLoad: 30_000, script: 30_000 });
    await driver.get(`${base}options.html`);
    await driver.executeScript('return document.readyState');
  } catch (error) {
    await driver.quit().catch(() => {});
    throw error;
  }

  await driver.manage().setTimeouts({ pageLoad: 60_000, script: 60_000 });
  return { driver, base };
}

// Opens a page of the extension in a new tab, selects it and returns its handle. Marionette refuses
// to navigate to a moz-extension address, so Firefox opens the tab from its own interface.
export async function openPage(driver, browser, url) {
  if (browser !== 'firefox') {
    // The first page of a freshly started Chromium can be slow to load: a tab that times out is closed and replaced.
    for (let attempt = 1; ; attempt += 1) {
      const previous = await driver.getWindowHandle();
      await driver.switchTo().newWindow('tab');
      const handle = await driver.getWindowHandle();
      try {
        await driver.get(url);
        return handle;
      } catch (error) {
        console.log(`[e2e] ${url} did not load (attempt ${attempt}/3): ${error.message}`);
        await driver.close().catch(() => {});
        await driver.switchTo().window(previous);
        if (attempt >= 3) throw error;
      }
    }
  }

  const known = await driver.getAllWindowHandles();
  await driver.setContext(firefox.Context.CHROME);
  await driver.executeScript(
    `const tab = gBrowser.addTab(arguments[0], { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
     gBrowser.selectedTab = tab;`,
    url,
  );
  await driver.setContext(firefox.Context.CONTENT);

  const handle = await waitFor(async () => (await driver.getAllWindowHandles()).find((h) => !known.includes(h)), { message: 'the new tab' });
  await driver.switchTo().window(handle);
  return handle;
}

// A browser sometimes does not start on a busy runner: each attempt has a time limit and a new one follows.
export async function launch(browser, options, { attempts = 3, timeout = 90_000 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    console.log(`[e2e] starting ${browser} (attempt ${attempt}/${attempts})`);
    const started = launchOnce(browser, options);
    let timer;
    try {
      const result = await Promise.race([
        started,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${browser} did not start in ${timeout / 1000}s`)), timeout); }),
      ]);
      console.log(`[e2e] ${browser} started`);
      return result;
    } catch (error) {
      // A browser that starts late is closed.
      started.then(({ driver }) => driver.quit()).catch(() => {});
      console.log(`[e2e] ${error.message}`);
      if (attempt >= attempts) throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
