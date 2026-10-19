// Notifications Android (APK) : Expo Push → FCM. Fonctionne hors Play Store
// (services Google présents sur Tecno / Infinix / Itel / Samsung).
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { getSupabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerPush(app: 'client' | 'courier'): Promise<void> {
  if (!Device.isDevice || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Koursa',
    importance: Notifications.AndroidImportance.HIGH,
  });
  if (app === 'courier') {
    await Notifications.setNotificationChannelAsync('offers', {
      name: 'Nouvelles courses',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400],
      sound: 'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  const perm = await Notifications.getPermissionsAsync();
  let granted = perm.granted;
  if (!granted) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const sb = getSupabase();
    const uid = (await sb.auth.getUser()).data.user?.id;
    if (uid) await sb.from('push_tokens').upsert({ user_id: uid, app, kind: 'expo', token }, { onConflict: 'user_id,token' });
  } catch (e) {
    console.warn('push', e);
  }
}

export function onNotificationTap(cb: (data: Record<string, unknown>) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((r) => cb(r.notification.request.content.data ?? {}));
  return () => sub.remove();
}
