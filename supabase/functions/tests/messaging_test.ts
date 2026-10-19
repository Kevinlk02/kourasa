// Code de livraison : WhatsApp (Twilio, modèle Meta) d'abord, SMS en secours. Twilio SIMULÉ.
Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:9');
Deno.env.set('SUPABASE_ANON_KEY', 'test');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test');
Deno.env.set('SMS_PROVIDER', 'twilio');
Deno.env.set('TWILIO_ACCOUNT_SID', 'AC123');
Deno.env.set('TWILIO_AUTH_TOKEN', 'tok');
Deno.env.set('TWILIO_WHATSAPP_FROM', '+22890000000');
Deno.env.set('TWILIO_WHATSAPP_CONTENT_SID', 'HX123');
Deno.env.set('TWILIO_SMS_FROM', 'MG456');

let calls: URLSearchParams[] = [];
let whatsappFails = false;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith('http://127.0.0.1:9')) return new Response('{}', { status: 503 });
  if (url.includes('api.twilio.com')) {
    const p = new URLSearchParams(String(init?.body));
    calls.push(p);
    if (whatsappFails && p.get('To')?.startsWith('whatsapp:')) return new Response('{"message":"not a WhatsApp user"}', { status: 400 });
    return Response.json({ sid: 'SM1' });
  }
  return realFetch(input, init);
}) as typeof fetch;

const { sendDeliveryCode } = await import('../_shared/sms.ts');

function eq<T>(a: T, b: T, m: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

Deno.test('WhatsApp avec le modèle validé : {{1}} = code, {{2}} = lien', async () => {
  calls = []; whatsappFails = false;
  const r = await sendDeliveryCode('+22891234567', '4821', 'https://koursa.tg/t/abc', null);
  eq(r, { sent: true, channel: 'whatsapp' }, 'résultat');
  eq(calls.length, 1, 'un seul envoi');
  eq(calls[0]!.get('To'), 'whatsapp:+22891234567', 'destinataire');
  eq(calls[0]!.get('ContentSid'), 'HX123', 'modèle');
  eq(JSON.parse(calls[0]!.get('ContentVariables')!), { 1: '4821', 2: 'https://koursa.tg/t/abc' }, 'variables');
});

Deno.test('WhatsApp refusé → SMS de secours avec le même code', async () => {
  calls = []; whatsappFails = true;
  const r = await sendDeliveryCode('+22891234567', '4821', 'https://koursa.tg/t/abc', null);
  eq(r, { sent: true, channel: 'sms' }, 'résultat');
  eq(calls.length, 2, 'deux tentatives');
  eq(calls[1]!.get('MessagingServiceSid'), 'MG456', 'service SMS');
  if (!calls[1]!.get('Body')!.includes('4821')) throw new Error('code absent du SMS');
});
