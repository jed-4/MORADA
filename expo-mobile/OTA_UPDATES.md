# Over-the-air (OTA) updates — release flow

BuildPro Mobile ships JS-only changes to installed phones with **EAS Update**
(`expo-updates`), so most fixes no longer need an App Store / TestFlight
resubmission.

## How it works

- `expo-updates` (~29, SDK 54 compatible) is embedded in the native build.
- On launch `App.tsx` calls `checkForOtaUpdate()` (`src/lib/updates.ts`):
  it checks the update channel, downloads any newer JS bundle in the
  background, and reloads the app to apply it. It is a **no-op in development
  and Expo Go** (`Updates.isEnabled === false`) and never throws.
- Config lives in `app.config.js`:
  - `updates.url` → `https://u.expo.dev/<eas projectId>` (the existing EAS project).
  - `runtimeVersion.policy: "appVersion"` — a published update only reaches
    native builds whose `version` matches.
- `eas.json` maps build profiles to channels: `preview` → `preview`,
  `production` → `production`.

## Shipping changes

### 1. First time (and any native/SDK change) — one native build

A native build is still required to embed/upgrade the updates runtime, change
native config, or bump `runtimeVersion` (the `version` field). The owner runs
this with their Apple/Expo credentials:

```bash
cd expo-mobile
eas build --profile production --platform ios   # or android / preview
# then submit to the store (owner only)
```

The current build carries `version: 1.0.1` (iOS buildNumber 7,
Android versionCode 7).

### 2. After that — JS-only changes, no resubmission

For any JS/TS-only change (e.g. the timesheet "Business (Overhead)" option),
publish an update to the matching channel:

```bash
cd expo-mobile
eas update --channel production --message "Describe the change"
# or --channel preview for the preview build
```

Installed phones on the matching `runtimeVersion` pick it up on next launch.

## Important

- **`runtimeVersion` must match.** If you change `version` in `app.config.js`,
  existing installs will NOT receive updates published for the new runtime
  until they install the new native build. Only bump `version` when a change
  actually requires a new native build.
- The very first build with `expo-updates` still requires a store submission by
  the owner — OTA only takes over for JS-only changes after that build is live.
