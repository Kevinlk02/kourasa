import fs from 'node:fs';
import path from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

const projectId = process.env.EAS_PROJECT_ID_COURIER;
const googleServices = process.env.GOOGLE_SERVICES_JSON
  ? path.resolve(__dirname, process.env.GOOGLE_SERVICES_JSON)
  : undefined;

// App coursier : APK Android uniquement (pas d'iPhone : Apple interdit l'installation hors App Store).
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Koursa Coursier',
  slug: 'koursa-courier',
  scheme: 'koursa-courier',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#FFFFFF' },
  platforms: ['android'],
  android: {
    // Ne JAMAIS changer après la première diffusion.
    package: 'tg.koursa.courier',
    versionCode: 1,
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#111111' },
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'CAMERA',
      'POST_NOTIFICATIONS',
      'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      'VIBRATE',
    ],
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
    config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY ?? '' } },
    googleServicesFile: googleServices && fs.existsSync(googleServices) ? googleServices : undefined,
  },
  plugins: [
    'expo-router',
    ['expo-location', {
      locationAlwaysAndWhenInUsePermission: 'Koursa envoie votre position pendant que vous êtes en ligne, même écran éteint, pour vous proposer les courses proches.',
      isAndroidBackgroundLocationEnabled: true,
      isAndroidForegroundServiceEnabled: true,
    }],
    ['expo-image-picker', { cameraPermission: 'Koursa utilise l\'appareil photo pour vos documents et les photos de colis.' }],
    ['expo-notifications', { color: '#00875A' }],
  ],
  runtimeVersion: { policy: 'appVersion' },
  updates: projectId ? { url: `https://u.expo.dev/${projectId}`, fallbackToCacheTimeout: 0 } : undefined,
  extra: { eas: { projectId } },
});
