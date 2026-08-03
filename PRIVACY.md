# Privacy Policy - Teams Auto Presence

Last updated: 2026-08-03

**Teams Auto Presence does not collect, transmit, or share any user data
with the developer or any third party.** Everything it does happens
locally in your browser, between you and Microsoft's own Teams servers,
which your browser already talks to every time you use Teams.

## What the extension does

- Runs only on `teams.microsoft.com` and `teams.live.com` (declared via
  `host_permissions` - no other site is touched).
- Reads the headers of Teams' own network requests on those pages
  (`x-skypetoken`, `x-ms-endpoint-id`, `x-ms-session-id`,
  `x-ms-client-version`) to capture the short-lived authentication token
  Teams already uses for its own presence calls. Response bodies are
  never read; only specific request headers are extracted.
- Uses that token to call Microsoft's own presence endpoint
  (`PUT .../ups/global/v1/me/forceavailability/`) on a timer, so your
  visible status follows the schedule you configure (work / lunch /
  outside hours) instead of Teams' own idle-detection.
- Simulates a small amount of mouse activity periodically, purely to
  stop Teams' own inactivity timer from overriding the status the
  schedule just set.
- Detects when you change your status by hand in Teams' own menu, and
  pauses automatic re-application until the next scheduled change (or
  until you resume it yourself from the popup).

## What it does not do

- It does not read message content, calendar data, contacts, files, or
  any other Teams data - only the four auth headers listed above, and
  only from outgoing requests.
- It does not use analytics, trackers, or any remote code.
- It does not transmit anything to the developer or to any server other
  than Microsoft's own Teams backend (`teams.microsoft.com` /
  `teams.live.com`), which is the same backend the Teams web app itself
  talks to.
- It does not request access to any site other than the two Teams
  domains above (no broad "read your data on all websites").

## What it stores locally

Everything lives in `chrome.storage.local` (this machine/profile only,
never synced to a Microsoft or Google account, cleared if you remove the
extension):

- **Configuration** - the 4 schedule times and the 3 target statuses you
  set on the options page.
- **Debug flag** - on/off, from the popup toggle.
- **Runtime state** - the currently computed target status, the last
  status actually applied, and whether the automation is paused. Read by
  the popup to show live status. No page content, no token value, no
  message data.

The auth token itself (`x-skypetoken` and related headers) is kept only
in memory for the lifetime of the tab - never written to
`chrome.storage`, never logged unless you turn on debug mode (in which
case it only appears in your own browser's console on the Teams tab,
never sent anywhere).

## Permissions used

- **`storage`** - to save your schedule/status configuration and the
  small runtime state described above.
- **`host_permissions` on `teams.microsoft.com` / `teams.live.com`** -
  required to run the content scripts that read the auth headers and
  call the presence endpoint. Scoped to exactly these two domains, no
  others.

## A note on intended use

This extension changes what your Teams status shows to colleagues,
based on a schedule instead of your actual activity. Whether that's
appropriate is between you and your employer/organization - use it in
line with whatever policies apply to you.

## Source code

The full source is public and MIT-licensed:
https://github.com/Stanislas-Poisson/teams-auto-presence

## Contact

Questions or concerns: open an issue at
https://github.com/Stanislas-Poisson/teams-auto-presence/issues
