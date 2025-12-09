# BuildPro App Icon Generation Guide

## Required Icon Sizes

### iOS Icons (App Store)
- 1024x1024 - App Store icon (required)
- 180x180 - iPhone @3x
- 120x120 - iPhone @2x
- 167x167 - iPad Pro @2x
- 152x152 - iPad @2x
- 76x76 - iPad @1x

### Android Icons (Play Store)
- 512x512 - Play Store listing icon
- 192x192 - xxxhdpi
- 144x144 - xxhdpi
- 96x96 - xhdpi
- 72x72 - hdpi
- 48x48 - mdpi

## Design Specifications

### Primary Colors
- Brand Purple: #bba7db
- White: #ffffff
- Dark Text: #1a1a1a

### Icon Design
- Background: Solid purple (#bba7db) or gradient
- Symbol: White "BP" text or building/construction icon
- Style: Rounded corners (iOS auto-applies), flat design
- Safe zone: Keep content within 70% of icon area

## Creating Icons

### Option 1: Use Capacitor Assets (Recommended)
```bash
# Install capacitor assets plugin
npm install -g @capacitor/assets

# Create a 1024x1024 icon.png in resources/
# Then run:
npx capacitor-assets generate --iconBackgroundColor '#bba7db' --splashBackgroundColor '#bba7db'
```

### Option 2: Manual Creation
1. Create 1024x1024 icon in Figma/Canva
2. Export to resources/icon/icon.png
3. Use online resizer (makeappicon.com) to generate all sizes
4. Place iOS icons in ios/App/App/Assets.xcassets/AppIcon.appiconset/
5. Place Android icons in android/app/src/main/res/mipmap-*/

## Splash Screen Specs

### iOS
- 2732x2732 - Universal (center-cropped on devices)

### Android
- 1920x1920 - xxxhdpi (center-cropped)

### Design
- Background: #bba7db (brand purple)
- Center: White BuildPro logo or "BP" mark
- Keep logo within center 30% for safe display

## Quick Start for Jed

1. Create a 1024x1024 PNG with:
   - Purple background (#bba7db)
   - White "BuildPro" text or "BP" monogram centered

2. Save as `resources/icon/icon.png`

3. Run: `npx capacitor-assets generate`

4. Icons will auto-populate to iOS and Android projects
