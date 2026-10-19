/**
 * Message au destinataire : code de réception + lien de suivi.
 * WhatsApp d'abord (Twilio, modèle validé par Meta), SMS en secours.
 *
 * SMS_PROVIDER : log (développement) | twilio | africastalking (SMS seul)
 * Twilio :
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM          numéro WhatsApp Business, ex. +22890000000 (vide = pas de WhatsApp)
 *   TWILIO_WHATSAPP_CONTENT_SID   modèle « code de livraison » (HX…) : {{1}} = code, {{2}} = lien de suivi
 *   TWILIO_SMS_FROM               numéro expéditeur SMS (+…) ou Messaging Service (MG…)
 * Ancien format accepté : SMS_API_KEY = "ACCOUNT_SID:AUTH_TOKEN".
 */
import { admin } from './supabase.ts';
import { fetchWithTimeout } from './http.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const provider = env('SMS_PROVIDER') || 'log';
const sender = env('SMS_SENDER_ID') || 'Koursa';
const [legacySid, legacyToken] = env('SMS_API_KEY').split(':');
const twilioSid = env('TWILIO_ACCOUNT_SID') || legacySid || '';
const twilioToken = env('TWILIO_AUTH_TOKEN') || legacyToken || '';

export type Channel = 'whatsapp' | 'sms' | 'log';

export function deliveryCodeText(code: string, link: string): string {
  return `Koursa : un colis arrive pour vous. Code de réception : ${code} (à donner au coursier). Suivi : ${link}`;
}

async function twilio(params: Record<string, string>): Promise<void> {
  const res = await fetchWithTimeout(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${twilioSid}:${twilioToken}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  }, 8000);
  if (!res.ok) throw new Error(`twilio ${res.status} ${(await res.text()).slice(0, 300)}`);
}

async function sendWhatsApp(to: string, code: string, link: string): Promise<boolean> {
  const from = env('TWILIO_WHATSAPP_FROM');
  const contentSid = env('TWILIO_WHATSAPP_CONTENT_SID');
  if (provider !== 'twilio' || !from || !contentSid || !twilioSid) return false;
  // Message initié par l'entreprise : obligatoirement un modèle approuvé par Meta.
  await twilio({
    To: `whatsapp:${to}`,
    From: `whatsapp:${from}`,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify({ 1: code, 2: link }),
  });
  return true;
}

async function sendSmsOnly(to: string, body: string): Promise<void> {
  switch (provider) {
    case 'twilio': {
      const from = env('TWILIO_SMS_FROM') || sender;
      await twilio({ To: to, Body: body, ...(from.startsWith('MG') ? { MessagingServiceSid: from } : { From: from }) });
      return;
    }
    case 'africastalking': {
      // SMS_API_KEY = "USERNAME:API_KEY"
      const [username, key] = env('SMS_API_KEY').split(':');
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

async function journal(to: string, body: string, deliveryId: string | null, channel: Channel, ok: boolean, error?: string) {
  await admin.from('outbox_sms').insert({
    to_phone: to, body, delivery_id: deliveryId, channel,
    status: ok ? 'sent' : 'failed', error: error?.slice(0, 500) ?? null,
    sent_at: ok ? new Date().toISOString() : null,
  });
}

/** Envoie le code de livraison : WhatsApp, puis SMS si WhatsApp échoue. N'échoue jamais la requête. */
export async function sendDeliveryCode(to: string, code: string, link: string, deliveryId: string | null): Promise<{ sent: boolean; channel: Channel | null }> {
  const body = deliveryCodeText(code, link);
  try {
    if (await sendWhatsApp(to, code, link)) {
      await journal(to, body, deliveryId, 'whatsapp', true);
      return { sent: true, channel: 'whatsapp' };
    }
  } catch (e) {
    console.error('whatsapp', e);
    await journal(to, body, deliveryId, 'whatsapp', false, String(e));
  }
  const channel: Channel = provider === 'log' ? 'log' : 'sms';
  try {
    await sendSmsOnly(to, body);
    await journal(to, body, deliveryId, channel, true);
    return { sent: true, channel };
  } catch (e) {
    console.error('sms', e);
    await journal(to, body, deliveryId, channel, false, String(e));
    return { sent: false, channel: null };
  }
}
