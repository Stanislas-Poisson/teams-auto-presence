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
