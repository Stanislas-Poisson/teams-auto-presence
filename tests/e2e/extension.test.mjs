// End-to-end tests: the built packages are loaded in real browsers.
//
//   BROWSER=chrome|edge|firefox npm test      (default: chrome)
//
// 1. install: the package as it goes to the store loads, and its pages work.
// 2. flow: the same package, with http://localhost added to the pages it works on, plays the whole
//    flow against a local fake Teams page.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { By } from 'selenium-webdriver';

import { launch, openPage, startFakeTeams, unpack, waitFor, zipDir, zipFor } from './lib.mjs';

const browser = process.env.BROWSER || 'chrome';

// Reads or writes chrome.storage.local from an extension page.
const storageGet = (driver) => driver.executeAsyncScript(`
  const done = arguments[arguments.length - 1];
  chrome.storage.local.get(null, done);
`);
const storageSet = (driver, values) => driver.executeAsyncScript(`
  const done = arguments[arguments.length - 1];
  chrome.storage.local.set(arguments[0], () => done(true));
`, values);

const text = async (driver, id) => (await driver.findElement(By.id(id)).getText()).trim();
const hasClass = async (driver, id, name) => ((await driver.findElement(By.id(id)).getAttribute('class')) || '').split(/\s+/).includes(name);

describe(`extension in ${browser}`, { timeout: 120_000 }, () => {
  describe('install', () => {
    let driver;
    let base;

    before(async () => {
      const zip = zipFor(browser);
      const dir = unpack(zip);
      ({ driver, base } = await launch(browser, { dir, zip }));
    });
    after(async () => driver?.quit());

    test('the options page loads with the default schedule', async () => {
      await openPage(driver, browser, `${base}options.html`);
      await waitFor(async () => (await driver.findElement(By.id('workStart')).getAttribute('value')) === '08:45', { message: 'the default work start' });

      assert.equal(await driver.findElement(By.id('workEnd')).getAttribute('value'), '16:45');
      assert.equal(await driver.findElement(By.id('statusDuringWork')).getAttribute('value'), 'busy');
      assert.equal(await text(driver, 'error'), '');
    });

    test('the options page saves and resets the configuration', async () => {
      await openPage(driver, browser, `${base}options.html`);
      await waitFor(async () => (await driver.findElement(By.id('workStart')).getAttribute('value')) === '08:45', { message: 'the options page' });

      await driver.executeScript(`
        const select = document.getElementById('statusDuringWork');
        select.value = 'doNotDisturb';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      `);
      await driver.findElement(By.id('save')).click();
      await waitFor(async () => (await storageGet(driver)).config?.statusDuringWork === 'doNotDisturb', { message: 'the saved configuration' });

      await driver.findElement(By.id('reset')).click();
      await waitFor(async () => (await storageGet(driver)).config?.statusDuringWork === 'busy', { message: 'the reset configuration' });
    });

    test('the popup loads and shows that no token was captured', async () => {
      await openPage(driver, browser, `${base}popup.html`);
      await waitFor(async () => (await text(driver, 'tokenText')) === 'not captured', { message: 'the popup' });

      assert.equal(await hasClass(driver, 'pauseBanner', 'visible'), false);
    });
  });

  describe('flow on a fake Teams page', () => {
    let driver;
    let base;
    let teams;
    let teamsTab;
    let popupTab;

    before(async () => {
      teams = await startFakeTeams();
      const zip = zipFor(browser);
      const dir = unpack(zip, { withLocalhost: true });
      const patchedZip = browser === 'firefox' ? zipDir(dir) : zip;
      ({ driver, base } = await launch(browser, { dir, zip: patchedZip }));
    });
    after(async () => {
      await driver?.quit();
      await teams?.close();
    });

    test('the extension asks for the Teams hosts and the page can be reached', async () => {
      // One status for every time slot, so that the test does not depend on the hour or the day.
      await openPage(driver, browser, `${base}options.html`);
      await waitFor(async () => (await driver.findElement(By.id('workStart')).getAttribute('value')) === '08:45', { message: 'the options page' });
      await storageSet(driver, {
        config: {
          schedule: {
            workStart: { h: 8, m: 45 }, lunchStart: { h: 12, m: 30 }, lunchEnd: { h: 13, m: 30 }, workEnd: { h: 16, m: 45 },
          },
          statusDuringWork: 'doNotDisturb',
          statusDuringLunch: 'doNotDisturb',
          statusAfterWork: 'doNotDisturb',
        },
      });

      await driver.switchTo().newWindow('tab');
      teamsTab = await driver.getWindowHandle();
      await driver.get(teams.url);
      await waitFor(async () => (await text(driver, 'ready')) === 'ready', { message: 'the fake Teams page' });
    });

    test('the status of the schedule is forced with the captured token', async () => {
      // The first application comes 8 seconds after the load.
      const call = await waitFor(() => teams.presenceCalls[0], { timeout: 40_000, message: 'the first presence call' });

      assert.deepEqual(call.body, { availability: 'DoNotDisturb' });
      assert.equal(call.headers['x-skypetoken'], 'fake-skype-token');
      assert.equal(call.headers['x-ms-endpoint-id'], 'endpoint-1');
      assert.equal(call.headers['x-ms-session-id'], 'session-1');
    });

    test('the popup shows the token and the status', async () => {
      popupTab = await openPage(driver, browser, `${base}popup.html`);
      await waitFor(async () => (await text(driver, 'tokenText')) === 'captured', { message: 'the token in the popup' });

      assert.equal(await text(driver, 'target'), 'Do not disturb');
      assert.equal(await text(driver, 'lastApplied'), 'Do not disturb');
      assert.equal(await hasClass(driver, 'pauseBanner', 'visible'), false);
    });

    test('a change made in Teams pauses the automation, and the popup resumes it', async () => {
      await driver.switchTo().window(teamsTab);
      await driver.executeScript('window.__manualPresence()');

      await driver.switchTo().window(popupTab);
      await waitFor(async () => hasClass(driver, 'pauseBanner', 'visible'), { message: 'the pause banner' });

      const before = teams.presenceCalls.length;
      await driver.findElement(By.id('resume')).click();

      await waitFor(() => teams.presenceCalls.length > before, { message: 'the presence call after the resume' });
      await waitFor(async () => !(await hasClass(driver, 'pauseBanner', 'visible')), { message: 'the pause banner to go' });
      assert.deepEqual(teams.presenceCalls.at(-1).body, { availability: 'DoNotDisturb' });
    });
  });
});
