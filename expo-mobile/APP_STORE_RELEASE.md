# App Store release — first public version (1.1.0)

The app has shipped to TestFlight since build 13. This is what stands between
that and a public App Store listing. Code items are on `feat/app-store-ready`;
everything else is a portal step only the account holder can do.

## In this branch

| Apple guideline | What changed |
|---|---|
| 4.8 Login services | **Sign in with Apple** on the login screen (iOS only), above Google. Sign-in only: an Apple ID is linked to an existing Morada user by Apple-verified email on first use, then by Apple's user id. "Hide my email" can't match anyone and is refused with an explanation. Route `POST /api/auth/apple/mobile`; table `user_apple_identities` (migration **0113**, also created on first use). |
| 5.1.1(v) Account deletion | **Settings → Account → Delete account** (team), and **Account → Delete account** in client mode. Wipes login, name, email, phone, photo, Google/Apple links, calendar tokens, sessions and push tokens; keeps the user row as "Deleted user" so their timesheets/bills/diary entries keep an owner. The only Owner of a company that still has a team is refused until they hand over. Route `POST /api/auth/delete-account`. Restore is blocked for deleted accounts. |
| 5.1.1 Purpose strings | Camera and photo prompts now say what they are used for. |
| 2.1 / iPad | `supportsTablet: false` — iPhone only until the layouts are tested on iPad. |
| 2.1 Completeness | A **client** login gets **client mode** (#333): Home, Schedule, Selections, Money (variations + progress claims), Messages — each tab gated by the client role's `portal.*` permissions. |
| — | **Documents open in the app** (react-native-webview + expo-sharing): selection spec sheets (client and team), a variation's emailed/signed PDF and its attachments. Downloaded with the session, shown in-app on iOS, with Share for save/print/AirDrop. |
| — | Version **1.1.0 (17)**. The version bump is required: a new native module was added, and OTA updates are matched by version. |

## Before the build

1. **Apply migration 0113 to prod** (optional — the route creates the table on
   first use, but by-hand migrations are the house rule).
2. **Deploy the server** so `/api/auth/apple/mobile` and
   `/api/auth/delete-account` exist in production. The phone app talks to prod.

## Build

`npx eas build --platform ios --profile production` with `EXPO_TOKEN`, the App
Store Connect API key (`EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID`,
`EXPO_ASC_ISSUER_ID`) and `EXPO_APPLE_TEAM_ID` / `EXPO_APPLE_TEAM_TYPE=INDIVIDUAL`
set — the ASC key alone still stops at a team-type prompt. Don't pass
`--auto-submit`. EAS turns
on the Sign In with Apple capability for `com.buildpro.mobile` from
`usesAppleSignIn`; read the build log for "Provisioning Profile → Updated".
Check the entitlement in the IPA before submitting:
`codesign -d --entitlements :- Payload/Morada.app` should list
`com.apple.developer.applesignin`.

## Test on TestFlight (all four, on a real phone)

- [ ] Sign in with Apple using an Apple ID whose email matches a Morada user → lands in the app.
- [ ] Sign in with Apple choosing "Hide my email" → clear refusal, no crash.
- [ ] Delete a throwaway team account → signed out; on web the person shows as "Deleted user" under Archived.
- [ ] Log in as a client → client mode. Walk every tab; choose a selection option; open a variation, **View PDF**, then approve or decline a TEST variation (it writes for real).
- [ ] Open documents: a selection spec sheet (as client and as team), a variation attachment, a variation PDF → each opens; Share → Save to Files works. A never-emailed variation's PDF button explains there's no PDF.

## App Store Connect (account holder)

- [ ] **Reviewer demo account.** Make a separate company on the web (e.g.
      "Morada App Review"), load demo data, and add a team login with a
      password, **plus a client login** on one of its projects (with a sent
      variation, a selection to choose and a progress claim). Put both in App
      Review Information → Sign-in required / Notes. Without seeded data the
      reviewer sees empty screens (2.1).
- [ ] App Privacy labels: Contact info (name, email, phone), Photos, Identifiers
      (user id), Diagnostics (crash data via Sentry). Linked to the user, not
      used for tracking.
- [ ] Privacy policy URL (`/privacy` on the live domain) — check it mentions the
      mobile app, photos, push notifications and Sentry crash reports.
- [ ] Support URL, description, keywords, category **Business**, age rating
      questionnaire.
- [ ] Screenshots: 6.9" iPhone (1320 × 2868) is the one required size.
- [ ] Review notes: "Business app for residential builders. Accounts are
      created by a building company on the web. Clients of the builder use the
      same app in client mode. Sign in with the team demo account, and with
      the client demo account to see client mode."
- [ ] No subscribe/upgrade buttons or links anywhere in the app — Australia is
      not eligible for external purchase links (3.1.1).

## Decisions still open

- **Seller name.** The Apple developer account is an *Individual*, so the
  listing shows a personal name. Moving to an Organization needs a D-U-N-S
  number and Apple Support to transfer the app (1–3 weeks).
- **Android / Google Play** is separate: the `production` profile builds an
  APK, and Play needs an AAB plus its own listing and data-safety form.
