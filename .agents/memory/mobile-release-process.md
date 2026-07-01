---
name: Mobile app release process (Expo/EAS)
description: How to build/submit the expo-mobile app to TestFlight and push OTA updates, incl. non-obvious gotchas.
---

# expo-mobile release process

The workspace has an authenticated Expo session via the `EXPO_TOKEN` secret (account `jed4`), so `eas` commands CAN be run from here non-interactively — no interactive login needed. Run them from `expo-mobile/` with `EAS_NO_VCS=1` prefixed.

## Channels / profiles
- TestFlight builds have historically used the **`preview`** profile → EAS Update channel **`preview`**. The field workers' installed TestFlight app listens on the `preview` channel.
- Therefore over-the-air updates for them must target `eas update --branch preview` (NOT production).
- `production` profile exists too (android apk, channel `production`) but isn't the one on workers' phones.

## Over-the-air (OTA) updates — the fast path (JS/RN-only changes)
- `eas update --branch preview --message "..."` pushes instantly; installed app applies it on the *next* launch (config has `fallbackToCacheTimeout: 0`, so it downloads in background then applies on relaunch → "open twice").
- **Only works if the installed build was built WITH `expo-updates` + the `updates.url` config.** Builds predating that config can't receive OTA and need one fresh store build first.
- runtimeVersion policy = `appVersion`, so OTA only reaches installed builds whose `version` matches. **Keep `version` constant** (e.g. 1.0.1) for OTA to land; only bump `version` when a change needs a new native build.

## Full build + TestFlight submit — needed for native changes or version bumps
- `appVersionSource` is `local` with no autoIncrement, so **`ios.buildNumber` and `android.versionCode` in app.config.js must be bumped manually** for each new store upload (Apple rejects a duplicate build number). Bump both together.
- Command: `eas build -p ios --profile preview --auto-submit --non-interactive` (auto-submit uses the Apple ID/ascAppId in `eas.json` submit config).
- Build runs ~20–30 min on Expo's servers. Workers then open the **TestFlight** app and tap Update.

## Gotcha: long builds must run in a WORKFLOW, not a background shell job
- **Why:** bash `nohup`/`setsid` background jobs get reaped when the tool call ends — a build launched that way dies mid-upload and never reaches the cloud.
- **How to apply:** configure a `console` workflow (no waitForPort) whose command is the `eas build ...` line; it persists for the full build. Monitor with `eas build:list --platform ios --limit 2 --non-interactive`.
