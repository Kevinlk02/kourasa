// PWA : Web Push (iPhone : seulement si la PWA est ajoutée à l'écran d'accueil, iOS 16.4+).
import { getSupabase } from './supabase';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function registerPush(app: 'client' | 'courier'): Promise<void> {
  const key = process.env.EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  if (!key || typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (Notification.permission === 'default') {
      if ((await Notification.requestPermission()) !== 'granted') return;
    }
    if (Notification.permission !== 'granted') return;
    const sub = (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as BufferSource }));
    const sb = getSupabase();
    const uid = (await sb.auth.getUser()).data.user?.id;
    if (uid) await sb.from('push_tokens').upsert({ user_id: uid, app, kind: 'webpush', token: JSON.stringify(sub) }, { onConflict: 'user_id,token' });
  } catch (e) {
    console.warn('web push', e);
  }
}

export function onNotificationTap(_cb: (data: Record<string, unknown>) => void): () => void {
  return () => undefined;
}
