# Contributing to Teams Auto Presence

Thank you for contributing! This project is a Chrome/Chromium extension (Manifest V3) that keeps your Microsoft Teams presence in line with a schedule you define.

## Git Workflow

- **Base Branch:** Always create your branches off of and target `develop` for your pull requests.
- **Branch Naming:** One branch per issue, for example `feature/#12-short-name`.
- **Pull requests:** The `ci` check must be green to merge. Merges use a merge commit.
- **Commit Format:** Use the format `type(scope): #ticket subject`:
  - Example: `docs(community): #2 add the community files`

## Try your change

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select the repository folder.
3. After each edit, click the reload button of the extension.
4. Open Teams in a tab and open the popup or the options page of the extension to check your change.

## Test in the browsers

The CI loads the packages in Chrome, Edge and Firefox and plays the flow against a fake Teams page: install, configuration, capture of the token, forced presence call, pause after a change made in Teams, resume. To run it on your machine (Node 20 or more, and the browser):

```sh
cd tests/e2e
npm ci
BROWSER=chrome npm test    # or edge, or firefox
```

The test uses the zips of `dist/` (it builds them when they are missing). For the flow, a copy of the package also matches `http://localhost`: it is the only difference with the package of the stores. What the tests cannot do is to sign in to the real Teams: do one manual check on Edge and Firefox before a release.

## Build the package

```sh
./build.sh
```

The zip is written in `dist/`, named after the version in `manifest.json`.

## Icons

The icons are generated with Python and Pillow. Run this only if you change the design:

```sh
python3 icons/generate.py
```
