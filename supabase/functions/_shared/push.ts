/**
 * Notifications : Expo Push (FCM sous le capot, fonctionne hors Play Store) pour les APK,
 * Web Push (VAPID) pour la PWA.
 */
import webpush from 'web-push';
import { admin } from './supabase.ts';
import { fetchWithTimeout } from './http.ts';

const vapidPublic = Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY');
const vapidPrivate = Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY');
const siteUrl = Deno.env.get('SITE_URL') ?? 'https://koursa.example';
if (vapidPublic && vapidPrivate) webpush.setVapidDetails(`mailto:contact@${new URL(siteUrl).host}`, vapidPublic, vapidPrivate);

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Canal Android (offres coursier : son + priorité haute). */
  channelId?: 'offers' | 'default';
}

export async function pushToUser(userId: string, app: 'client' | 'courier', msg: PushMessage): Promise<number> {
  const { data: tokens } = await admin.from('push_tokens').select('id, kind, token').eq('user_id', userId).eq('app', app);
  if (!tokens?.length) return 0;
  let sent = 0;

  const expo = tokens.filter((t) => t.kind === 'expo');
  if (expo.length) {
    try {
      const res = await fetchWithTimeout('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(expo.map((t) => ({
          to: t.token, title: msg.title, body: msg.body, data: msg.data ?? {},
          sound: 'default', priority: 'high', channelId: msg.channelId ?? 'default', ttl: 60,
        }))),
      }, 5000);
      const body = await res.json().catch(() => ({}));
      const tickets = (body.data ?? []) as { status: string; details?: { error?: string } }[];
      for (let i = 0; i < tickets.length; i++) {
        if (tickets[i]?.status === 'ok') sent++;
        else if (tickets[i]?.details?.error === 'DeviceNotRegistered') await admin.from('push_tokens').delete().eq('id', expo[i]!.id);
      }
    } catch (e) {
      console.error('expo push', e);
    }
  }

  if (vapidPublic && vapidPrivate) {
    for (const t of tokens.filter((x) => x.kind === 'webpush')) {
      try {
        await webpush.sendNotification(JSON.parse(t.token), JSON.stringify({ title: msg.title, body: msg.body, data: msg.data ?? {} }), { TTL: 60 });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await admin.from('push_tokens').delete().eq('id', t.id);
        else console.error('web push', e);
      }
    }
  }
  return sent;
}
