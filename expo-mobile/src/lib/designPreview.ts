/**
 * The components preview page is for design review only. It is switched on
 * by EXPO_PUBLIC_DESIGN_PREVIEW=1, which only the `simulator` EAS profile
 * sets, so it never appears in a TestFlight / App Store build.
 */
export const DESIGN_PREVIEW = process.env.EXPO_PUBLIC_DESIGN_PREVIEW === '1';
