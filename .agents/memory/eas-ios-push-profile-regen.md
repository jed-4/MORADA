---
name: EAS iOS push capability & profile regeneration
description: Why iOS EAS builds keep failing on missing aps-environment, and the exact steps to force a fresh push-enabled provisioning profile.
---

# iOS EAS build: push notifications / aps-environment failures

Symptom: `XCODE_BUILD_ERROR` — "Provisioning profile ... doesn't support the Push Notifications capability / doesn't include the aps-environment entitlement" even after enabling push and regenerating the profile.

## Two independent root causes (both must be fixed)

1. **Push capability was never actually persisted on the Apple App ID.**
   - eas-cli's `configure-build` / capability sync reports "Enabled: Push Notifications" but under **ASC API-key auth** it silently skips writing some capabilities (log: "Skipping capability identifier syncing because the current Apple authentication session is not using Cookies"). The capability does NOT stick.
   - **Verify at the source of truth**, not the eas log: `GET /v1/bundleIds?filter[identifier]=<bundle>&include=bundleIdCapabilities`. If only `IN_APP_PURCHASE` is listed, push is NOT enabled.
   - **Fix directly via ASC API** (API key CAN do this): `POST /v1/bundleIdCapabilities` with `{data:{type:"bundleIdCapabilities",attributes:{capabilityType:"PUSH_NOTIFICATIONS"},relationships:{bundleId:{data:{type:"bundleIds",id:<appleBundleResourceId>}}}}}` → 201. Re-query to confirm.

2. **eas reuses a stale/structurally-valid provisioning profile and never regenerates.**
   - The eas profile validator only checks cert + bundleId + expiry — **never capabilities** — and when unauthenticated it skips the Apple-side check entirely ("Skipping Provisioning Profile validation ... aren't authenticated"). So a profile lacking aps-environment is judged "valid" and reused.
   - Deleting the profile **on Apple only is not enough** — the build reuses the EAS-stored record. You must delete **both**:
     - EAS record: query `app.byFullName.iosAppCredentials.iosAppBuildCredentialsList.provisioningProfile.id` then mutation `appleProvisioningProfile.deleteAppleProvisioningProfiles(ids:[...])` (Expo GraphQL, Bearer EXPO_TOKEN).
     - Apple record: `DELETE /v1/profiles/<developerPortalIdentifier>` (ASC API).
   - After both are gone, `iosAppBuildCredentialsList[].provisioningProfile` is `null`; the next non-interactive build authenticates (ASC env vars) and creates a fresh profile that now includes aps-environment.

**Ordering matters:** enable push FIRST, then delete both profile records, then rebuild — otherwise the fresh profile is generated before push exists and still lacks aps-environment.

## Non-interactive build auth
Set env vars on the build command: `EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`, plus `EXPO_APPLE_TEAM_TYPE=INDIVIDUAL`, `EXPO_APPLE_TEAM_ID`. Keep the `.p8` out of the repo (e.g. /tmp). `yes | eas ...` fails ("stdin not readable"); rely on `--non-interactive` + API-key env vars, never TTY piping. ASC ES256 JWT must be signed with Node crypto `dsaEncoding:'ieee-p1363'`.
