---
name: EAS build Sentry source-map upload failure
description: iOS/Android EAS build fails at the fastlane/Xcode step on Sentry source-map upload when org/token secrets are absent.
---

# EAS build fails on Sentry source-map upload

Symptom: build compiles fully then `XCODE_BUILD_ERROR` at "Run fastlane" with sentry-cli: "An organization ID or slug is required (provide with --org)".

Cause: the `@sentry/react-native/expo` plugin runs sentry-cli during the native build to auto-upload source maps, but the EAS build environment has no `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN`.

Fix (when source-map upload is optional): add `"SENTRY_DISABLE_AUTO_UPLOAD": "true"` to the relevant build profile's `env` in `eas.json`. Runtime error monitoring (DSN-based) is unaffected — only build-time source-map upload is skipped. To actually upload maps later, provide the three Sentry secrets to the EAS build env instead.
