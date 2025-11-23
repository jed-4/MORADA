# BuildPro iOS Deployment Guide

## Overview
Your BuildPro mobile app is now ready to deploy to your iPhone! This guide will walk you through opening the project in Xcode and installing it on your device.

## Prerequisites ✓
- ✅ Mac computer with macOS
- ✅ Xcode installed (download from Mac App Store if needed)
- ✅ iPhone with USB cable
- ✅ Apple Developer account (free tier works for personal testing)

## Status
✅ Mobile app built successfully  
✅ iOS project synced and ready  
✅ App ID: `com.lighthouseprojects.buildpro`  
✅ App Name: **BuildPro**

---

## Step-by-Step Deployment

### 1. Download Project to Your Mac

First, you need to get your Replit project onto your Mac:

**Option A: Using Git (Recommended)**
```bash
# Clone your Replit project
git clone https://github.com/[your-username]/[your-repo].git
cd [your-repo]

# Install dependencies
npm install
```

**Option B: Download ZIP**
- In Replit, click the three dots menu → Download as ZIP
- Extract the ZIP on your Mac
- Open Terminal and navigate to the extracted folder
- Run `npm install` to install all dependencies

⚠️ **Important:** You must run `npm install` to install Node.js dependencies before you can build or open the project.

### 2. Open Project in Xcode

From your project directory on Mac, run:
```bash
npx cap open ios
```

This will automatically open the iOS project in Xcode.

**Alternative:** Manually open `ios/App/App.xcworkspace` in Xcode  
⚠️ **Important:** Open the `.xcworkspace` file, NOT the `.xcodeproj` file

### 3. Configure Signing & Team

Once Xcode opens:

1. **Select the App target**
   - In the left sidebar, click on the blue "App" icon at the top
   - Make sure "App" is selected under TARGETS (not PROJECTS)

2. **Configure Signing**
   - Click the "Signing & Capabilities" tab at the top
   - Check the box "Automatically manage signing"
   - In the "Team" dropdown, select your Apple ID
     - If you don't see your Apple ID, click "Add an Account..." and sign in
     - A free Apple Developer account works for testing on your own device

3. **Bundle Identifier**
   - Should automatically show: `com.lighthouseprojects.buildpro`
   - If there's a naming conflict, Xcode may suggest `com.lighthouseprojects.buildpro-[suffix]`
   - Either accept the suggestion or change it to something unique

### 4. Connect Your iPhone

1. **Enable Developer Mode on iPhone**
   - On iPhone (iOS 16+): Settings → Privacy & Security → Developer Mode → Turn ON
   - Restart your iPhone when prompted

2. **Connect via USB**
   - Plug your iPhone into your Mac with a USB cable
   - On iPhone, tap "Trust This Computer" when prompted
   - Enter your iPhone passcode if asked

3. **Select Device in Xcode**
   - At the top of Xcode, next to the Play/Stop buttons
   - Click the device dropdown (might say "Any iOS Device")
   - Select your iPhone from the list (e.g., "Jed's iPhone")

### 5. Build and Run

1. **Click the Play button** (▶️) in the top-left of Xcode
   - Or press `Cmd + R`

2. **Wait for build to complete**
   - First build takes 1-3 minutes
   - You'll see progress in the status bar at the top
   - Build succeeded when you see "Build Succeeded" notification

3. **Trust Developer on iPhone** (First time only)
   - When the app tries to launch, you'll see "Untrusted Developer" alert
   - On iPhone: Settings → General → VPN & Device Management
   - Tap your Apple ID email under "Developer App"
   - Tap "Trust [your email]"
   - Go back to home screen and tap the BuildPro app icon

### 6. Launch BuildPro! 🎉

The BuildPro app should now launch on your iPhone!

---

## Troubleshooting

### "No code signing identities found"
- Go to Xcode → Settings → Accounts
- Add your Apple ID if not already there
- Download manual profiles if needed

### "Failed to register bundle identifier"
- The bundle ID `com.lighthouseprojects.buildpro` might be taken
- In Signing & Capabilities, change to `com.lighthouseprojects.buildpro.yourname`
- Update `capacitor.config.ts` with the new bundle ID for future builds

### "iPhone is not available"
- Make sure iPhone is unlocked
- Check USB cable connection
- Try unplugging and reconnecting
- Enable Developer Mode on iPhone (see Step 4)

### App crashes immediately
- Check Xcode console (View → Debug Area → Activate Console) for error messages
- Common issues:
  - API endpoint not accessible (mobile app needs backend running)
  - Missing permissions in Info.plist

### Build fails with CocoaPods errors
```bash
# From project root on Mac:
cd ios/App
pod install
cd ../..
```

---

## Making Changes

When you update your mobile app code:

### On Replit:
```bash
# Build the mobile app
vite build --config mobile/vite.config.ts

# Sync to iOS
npx cap sync ios
```

### On Mac:
```bash
# Pull latest changes (if using Git)
git pull

# Install/update dependencies (important if package.json changed)
npm install

# Build and sync
vite build --config mobile/vite.config.ts && npx cap sync ios

# Open in Xcode and run
npx cap open ios
```

💡 **Tip:** Always run `npm install` after pulling updates to ensure you have the latest dependencies, especially if `package.json` or `package-lock.json` changed.

---

## App Configuration

### Current Settings
- **App Name:** BuildPro
- **Bundle ID:** com.lighthouseprojects.buildpro
- **Supported Orientations:** Portrait, Landscape (all)
- **Minimum iOS Version:** iOS 13.0

### Customizing App Icon
1. Create 1024x1024 PNG of your app icon
2. Use an online tool like [appicon.co](https://www.appicon.co) to generate all sizes
3. In Xcode: Open `Assets.xcassets` → `AppIcon` → Drag generated images
4. Rebuild and run

### Customizing Splash Screen
1. Edit images in `ios/App/App/Assets.xcassets/Splash.imageset/`
2. Recommended size: 2732x2732 PNG with centered content
3. Rebuild and run

---

## Next Steps

### Testing
- Test all features thoroughly on device
- Check camera, file uploads, and offline functionality
- Test with different network conditions

### Beta Testing (TestFlight)
To share with other users:
1. Enroll in Apple Developer Program ($99/year)
2. Archive your app in Xcode (Product → Archive)
3. Upload to App Store Connect
4. Set up TestFlight beta testing
5. Invite testers via email

### Production Release
1. Complete App Store Connect setup
2. Submit for App Store review
3. Release to the public App Store

---

## Support Resources

- [Capacitor iOS Documentation](https://capacitorjs.com/docs/ios)
- [Xcode Help](https://developer.apple.com/documentation/xcode)
- [Apple Developer Support](https://developer.apple.com/support/)

---

**Questions?** You're all set! The iOS project is configured and ready to open in Xcode.
