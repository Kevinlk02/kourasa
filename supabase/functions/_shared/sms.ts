/**
 * Envoi de SMS (code de livraison + lien de suivi au destinataire).
 * SMS_PROVIDER : log (développement) | twilio | africastalking
 * Vérifier la délivrabilité réelle vers +228 et +235 avant de choisir.
 */
import { admin } from './supabase.ts';
import { fetchWithTimeout } from './http.ts';

const provider = Deno.env.get('SMS_PROVIDER') ?? 'log';
const apiKey = Deno.env.get('SMS_API_KEY') ?? '';
const sender = Deno.env.get('SMS_SENDER_ID') ?? 'Koursa';

async function send(to: string, body: string): Promise<void> {
  switch (provider) {
    case 'twilio': {
      // SMS_API_KEY = "ACCOUNT_SID:AUTH_TOKEN"
      const [sid, token] = apiKey.split(':');
      const res = await fetchWithTimeout(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: to, From: sender, Body: body }),
      }, 8000);
      if (!res.ok) throw new Error(`twilio ${res.status} ${await res.text()}`);
      return;
    }
    case 'africastalking': {
      // SMS_API_KEY = "USERNAME:API_KEY"
      const [username, key] = apiKey.split(':');
      const res = await fetchWithTimeout('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: { apiKey: key ?? '', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: username ?? '', to, message: body, from: sender }),
      }, 8000);
      if (!res.ok) throw new Error(`africastalking ${res.status} ${await res.text()}`);
      return;
    }
    default:
      console.log(`[SMS → ${to}] ${body}`);
  }
}

/** Envoie et journalise dans outbox_sms. N'échoue jamais la requête appelante. */
export async function sendSms(to: string, body: string, deliveryId: string | null): Promise<boolean> {
  const { data } = await admin.from('outbox_sms').insert({ to_phone: to, body, delivery_id: deliveryId }).select('id').single();
  try {
    await send(to, body);
    if (data) await admin.from('outbox_sms').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', data.id);
    return true;
  } catch (e) {
    console.error('sms', e);
    if (data) await admin.from('outbox_sms').update({ status: 'failed', error: String(e).slice(0, 500) }).eq('id', data.id);
    return false;
  }
}
