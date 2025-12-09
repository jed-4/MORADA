# BuildPro App Store Submission Guide

## Pre-Submission Checklist

### Developer Accounts
- [ ] Apple Developer Account ($99/year) - https://developer.apple.com/programs/
- [ ] Google Play Console ($25 once) - https://play.google.com/console/signup

### Required Assets

#### App Icons
- [ ] 1024x1024 PNG (no alpha channel for iOS)
- [ ] All icon sizes generated via `npx capacitor-assets generate`

#### Screenshots (Required for both stores)

**iPhone Screenshots** (at least 3):
- 6.5" display (1284 x 2778 px) - iPhone 14 Plus, 13 Pro Max
- 5.5" display (1242 x 2208 px) - iPhone 8 Plus

**iPad Screenshots** (if supporting iPad):
- 12.9" display (2048 x 2732 px)

**Android Screenshots** (at least 2):
- Phone: 16:9 aspect ratio (1080 x 1920 px recommended)
- 7" Tablet: 16:9 (1200 x 1920 px)
- 10" Tablet: 16:9 (1800 x 2560 px)

### App Information

**App Name:** BuildPro
**Subtitle (iOS):** Construction Project Management
**Short Description (30 chars):** Build smarter, manage better
**Full Description:**
```
BuildPro is the complete project management solution for Australian residential builders. Streamline your construction workflows, enhance team collaboration, and maintain full financial oversight from estimate to completion.

KEY FEATURES:

Project Management
- Create and manage construction projects with ease
- Track progress with customizable dashboards
- Organize tasks with Kanban boards and calendar views

Financial Control
- Build accurate estimates with cost codes
- Track budgets and variations in real-time
- Generate professional client invoices

Document Management
- Create and send RFQs to suppliers
- Manage RFIs with response tracking
- Store and share project files securely

Team Collaboration
- Assign tasks to team members
- Site diary entries for daily records
- Real-time messaging and notifications

Built for Australian Builders
- GST-compliant invoicing
- Local support and data storage
- Designed for residential construction

Whether you're managing a single renovation or multiple home builds, BuildPro keeps your projects on track and your team connected.
```

**Keywords (iOS - 100 chars):**
construction, builder, project management, estimate, invoice, RFQ, task, schedule, budget, Australian

**Category:**
- Primary: Business
- Secondary: Productivity

### Privacy & Legal

**Privacy Policy URL:** https://buildpro.lighthouseprojects.com.au/privacy
**Support URL:** https://buildpro.lighthouseprojects.com.au/support
**Contact Email:** jed@lighthouseprojects.com.au

### Content Rating
- Violence: None
- Sexual Content: None
- Profanity: None
- Drugs: None
- Gambling: None
- Age Rating: 4+ (iOS) / Everyone (Android)

---

## Build Commands

### Step 1: Build the mobile web app
```bash
cd /home/runner/workspace
npx vite build --config mobile/vite.config.ts
```

### Step 2: Sync to native platforms
```bash
npx cap sync
```

### Step 3: Generate iOS project (requires Mac)
```bash
npx cap add ios
npx cap open ios
```

### Step 4: Generate Android project
```bash
npx cap add android
npx cap open android
```

---

## iOS Submission (App Store Connect)

### In Xcode:
1. Select "Any iOS Device (arm64)" as build target
2. Product > Archive
3. Window > Organizer > Distribute App
4. Select "App Store Connect" > Upload

### In App Store Connect:
1. Go to https://appstoreconnect.apple.com
2. My Apps > + New App
3. Fill in app details
4. Upload screenshots
5. Add build from Xcode
6. Submit for Review

### Common Rejection Reasons:
- Missing privacy policy
- Incomplete metadata
- Broken functionality
- Login issues (provide demo account)

---

## Android Submission (Google Play Console)

### Build Signed APK/AAB:
1. Open Android Studio
2. Build > Generate Signed Bundle/APK
3. Choose "Android App Bundle" (.aab)
4. Create new keystore or use existing
5. Build release version

### In Play Console:
1. Go to https://play.google.com/console
2. Create Application
3. Fill in store listing
4. Upload .aab file
5. Set up pricing (Free or Paid)
6. Review and Rollout to Production

---

## Demo Account for App Review

**Email:** demo@buildpro.app
**Password:** [Create before submission]

Pre-populate with:
- 2-3 sample projects
- Sample tasks and estimates
- Demo supplier contacts

---

## Post-Submission

### Timeline Expectations:
- **Google Play:** 1-3 days (faster for subsequent updates)
- **App Store:** 1-7 days (first submission takes longer)

### If Rejected:
1. Read rejection reason carefully
2. Fix the specific issue mentioned
3. Respond to reviewer explaining changes
4. Resubmit

### Version Updates:
- Increment version in capacitor.config.ts
- Update CHANGELOG.md
- Rebuild and resubmit through same process
