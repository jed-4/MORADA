# BuildPro Mobile

Mobile app for BuildPro using React + Capacitor

## Development

### Run mobile dev server
```bash
vite --config mobile/vite.config.ts
```

### Build mobile app
```bash
vite build --config mobile/vite.config.ts
```

### Sync to native platforms (iOS/Android)
```bash
vite build --config mobile/vite.config.ts && npx cap sync
```

### Open in Xcode (iOS)
```bash
npx cap open ios
```

### Open in Android Studio
```bash
npx cap open android
```

## Project Structure

```
mobile/
├── src/
│   ├── main.tsx          # App entry point
│   ├── App.tsx           # Main app shell with bottom navigation
│   ├── index.css         # Global styles
│   ├── lib/              # Shared utilities (API client, auth)
│   ├── components/       # Mobile-optimized components
│   ├── hooks/            # React hooks
│   └── pages/            # Mobile pages/screens
├── index.html            # HTML entry point
├── vite.config.ts        # Vite configuration
├── tailwind.config.ts    # Tailwind configuration
└── tsconfig.json         # TypeScript configuration
```

## Design Principles

- **Touch-First**: All interactive elements minimum 44px (h-11)
- **Bottom Navigation**: Primary navigation at thumb reach
- **Card-Based**: Use cards instead of tables for mobile
- **Safe Areas**: Respect iOS notch and Android gestures
- **Offline-First**: Cache data for job sites without signal
