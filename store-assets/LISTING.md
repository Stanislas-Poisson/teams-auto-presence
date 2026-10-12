# Store listings

Everything the stores ask for, to fill a listing by copy and paste. The package is the zip of
`./build.sh`: `teams-auto-presence-X.Y.Z.zip` for Chrome, Edge and Opera, and
`teams-auto-presence-X.Y.Z-firefox.zip` for Firefox. The zips are also attached to each GitHub release.

The limits of the forms change: check them when you submit.

## Texts

**Name**

```
Teams Auto Presence
```

**Short description** (the manifest `description`, 108 characters)

```
Automatically switches your Teams presence status on a configurable schedule (work / lunch / outside hours).
```

**Long description**

```
Teams Auto Presence sets your Microsoft Teams presence status for you, following a schedule you choose, instead of Teams' own idle detection.

What it does
- Switches your status on a daily schedule: during work, during the lunch break, and outside hours.
- Weekends use the "outside hours" status all day.
- Supports the six statuses of Teams: Available, Busy, Do not disturb, Be right back, Away and Offline.
- Re-applies the status every minute, because Teams can silently override it.
- Keeps Teams from switching you to Away when you are inactive.
- Pauses itself when you change your status by hand in Teams, and resumes at the next schedule change or when you click "Resume automation" in the popup.

How to use it
1. Install the extension and open the options page to set your hours and the three statuses.
2. Open Teams on the web (teams.microsoft.com or teams.live.com) and keep the tab open.
3. The popup shows the current target, the last status applied and whether the automation is paused.

Privacy
- It works only on teams.microsoft.com and teams.live.com.
- It reads the authentication headers of Teams' own requests, in memory, to call the presence endpoint of Teams. Nothing is stored except your schedule, and nothing is sent anywhere else.
- No analytics, no tracker, no remote code.
- Open source (MIT).

Note: the extension changes the status your colleagues see based on a schedule rather than your real activity. Use it in line with the policies of your organization.
```

**Search terms** (Edge asks for a few)

```
teams, presence, status, schedule, away, availability
```

## Fields

| Field | Value |
|---|---|
| Category (Chrome, Edge, Opera) | Productivity |
| Category (Firefox) | Social & Communication |
| Language | English |
| Homepage | https://github.com/Stanislas-Poisson/teams-auto-presence |
| Support | https://github.com/Stanislas-Poisson/teams-auto-presence/issues |
| Privacy policy | https://github.com/Stanislas-Poisson/teams-auto-presence/blob/main/PRIVACY.md |
| License | MIT |
| Price | Free |
| Data collected | None |
| Remote code | No |

## Chrome Web Store: privacy tab

**Single purpose**

```
Switch the Microsoft Teams presence status on a schedule chosen by the user.
```

**Permission justifications**

```
storage: keeps the schedule, the three statuses and the debug option chosen by the user, and the current state shown in the popup.
Host permissions (teams.microsoft.com, teams.live.com): the content scripts run only on Teams. They read the authentication headers of Teams' own requests and call the presence endpoint of Teams to apply the status.
Remote code: none. All the code is in the package.
```

## Notes for the reviewers

```
The extension only works on a signed-in Teams web tab (teams.microsoft.com or teams.live.com), so a Teams account is needed to see it act. Without one, the options page and the popup can still be opened and checked.
To see it work: open the options page, set the three statuses, open Teams on the web, wait about 10 seconds, then open the popup: the token shows "captured" and the last applied status is the target. Change the status by hand in Teams: the popup shows the pause banner.
No build step: the submitted package is the source. Source and tests: https://github.com/Stanislas-Poisson/teams-auto-presence
Firefox: the host permissions are granted by the user. Open the popup and click "Allow access to Teams", then reload the Teams tab.
```

## Images

| Use | File | Size | Store |
|---|---|---|---|
| Icon | `icons/icon128.png` | 128x128 | all (also read from the manifest) |
| Logo | `store-assets/store_logo_300.png` | 300x300 | Edge |
| Screenshot 1 | `store-assets/screenshot_schedule.png` | 1280x800 | all |
| Screenshot 2 | `store-assets/screenshot_options_listing.png` | 1280x800 | all |
| Screenshot 3 | `store-assets/screenshot_popup_listing.png` | 1280x800 | all |
| Small promo tile | `store-assets/small_promo_tile.png` | 440x280 | Chrome, Edge (optional) |
| Marquee promo tile | `store-assets/marquee_promo.png` | 1400x560 | Chrome, Edge (optional) |

`store_icon_128.png` is the 128x128 icon without transparency, for the forms that refuse an alpha channel. The images are made by `generate.py` and `screenshots.py`. `store_logo_300.png` is the icon scaled up to 300x300: redraw it from a vector source when there is one.

## Stores

| Store | Package | Account | Update |
|---|---|---|---|
| Chrome Web Store | Chromium zip | Chrome Web Store developer account | Listed: https://chromewebstore.google.com/detail/teams-auto-presence/ccecckoeekjnndicanahkpoblpgdocel |
| Microsoft Edge Add-ons | Chromium zip | Microsoft Partner Center | Issue #4 |
| Firefox Add-ons (AMO) | Firefox zip | addons.mozilla.org | Issue #6 |
| Opera add-ons | Chromium zip | addons.opera.com | Not planned yet |

Brave, Vivaldi and Arc install the Chrome Web Store listing. Safari needs a Mac and an Apple developer account: not planned.

## Updating a listing

The first listing of each store is made by hand with the texts above. After that, a new version can be sent by hand (upload the zip of the release) or by the API of the store:

| Store | API | Secrets |
|---|---|---|
| Chrome Web Store | Chrome Web Store API (OAuth refresh token) | client id, client secret, refresh token, extension id |
| Microsoft Edge Add-ons | Edge Add-ons publish API | client id, API key, product id |
| Firefox Add-ons | AMO API, with `web-ext sign --channel=listed` | JWT issuer and secret |

Nothing is automated yet: it needs the tokens of the stores, to be made with the regeneration of all the tokens.

## Before each submission

1. The `ci` check is green on `main`, and the GitHub release of the version is published.
2. One manual check of the zip on Edge and on Firefox with a real Teams account (the CI cannot sign in to Teams).
3. The version of `manifest.json` and the top of `CHANGELOG.md` match.
4. Upload the zip of the release, never a local build.
