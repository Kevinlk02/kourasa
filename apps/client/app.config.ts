import fs from 'node:fs';
import path from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

const projectId = process.env.EAS_PROJECT_ID_CLIENT ?? '8e477131-af25-41c8-b4b8-b8b717d74c42';
const googleServices = process.env.GOOGLE_SERVICES_JSON
  ? path.resolve(__dirname, process.env.GOOGLE_SERVICES_JSON)
  : undefined;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Koursa',
  slug: 'koursa-client',
  scheme: 'koursa-client',
  // Toute nouvelle version native = incrémenter version ET android.versionCode.
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#FFFFFF' },
  assetBundlePatterns: ['**/*'],
  android: {
    // Ne JAMAIS changer après la première diffusion.
    package: 'tg.koursa.client',
    versionCode: 1,
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#00875A' },
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'POST_NOTIFICATIONS'],
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
    config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY ?? '' } },
    googleServicesFile: googleServices && fs.existsSync(googleServices) ? googleServices : undefined,
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/favicon.png',
    name: 'Koursa',
    shortName: 'Koursa',
    themeColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
    lang: 'fr',
  },
  // La PWA est servie sous /app par apps/web (pnpm export:pwa).
  experiments: { baseUrl: process.env.EXPO_BASE_URL ?? '', typedRoutes: false },
  plugins: [
    // Web : un fichier JS par écran (chargé à la demande) et pas de page « sitemap » de développement.
    ['expo-router', { asyncRoutes: { web: 'production', default: false }, sitemap: false }],
    ['expo-location', { locationWhenInUsePermission: 'Koursa utilise votre position pour le point de récupération.' }],
    ['expo-notifications', { color: '#00875A' }],
  ],
  runtimeVersion: { policy: 'appVersion' },
  updates: projectId ? { url: `https://u.expo.dev/${projectId}`, fallbackToCacheTimeout: 0 } : undefined,
  extra: { eas: { projectId } },
});
