---
name: Expo/iOS app icon must have no alpha
description: When setting a native app icon (expo-mobile assets/icon.png), flatten the source PNG onto a solid background — iOS rejects icons with an alpha channel
---

# Expo native app icon: no transparency

When replacing the Expo native app icon (`expo-mobile/assets/icon.png`, and
`adaptive-icon.png`), the PNG must NOT contain an alpha channel — iOS App Store
rejects icons with transparency.

**Why:** Source logos often ship as a rounded shape with transparent corners
(RGBA). Copying such a file straight to `icon.png` leaves alpha in place and
fails App Store validation; transparent corners can also composite oddly.

**How to apply:** Flatten the source onto a solid background before writing.
The BuildPro/Morada logo's own purple is `#7C6B86` (sampled from
`attached_assets/icon_1783074833445.png`). Example with sharp:
`sharp(src).resize(1024,1024,{fit:'contain',background}).flatten({background}).png()`.
Verify with `identify -format '%[channels]'` → should be `srgb` (3), not `srgba`.
iOS re-applies its own rounded mask, so a full square (no pre-rounded corners)
is fine. Native icon/splash changes need a fresh EAS build (no OTA); bump
`version` + `buildNumber`/`versionCode` in `app.config.js` per its convention.
