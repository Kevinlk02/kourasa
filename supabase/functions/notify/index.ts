// Appelée par les triggers SQL (pg_net) : envoie les notifications push.
import { json } from '../_shared/http.ts';
import { pushToUser } from '../_shared/push.ts';

const SECRET = Deno.env.get('NOTIFY_SECRET') ?? '';

const CLIENT_MESSAGES: Record<string, { title: string; body: string }> = {
  assigned: { title: 'Coursier trouvé', body: 'Votre coursier est en route vers le point de récupération.' },
  arrived_pickup: { title: 'Votre coursier est arrivé', body: 'Il vous attend au point de récupération.' },
  picked_up: { title: 'Colis récupéré', body: 'Votre colis est en route.' },
  arrived_dropoff: { title: 'Coursier chez le destinataire', body: 'Le coursier est arrivé au point de livraison.' },
  delivered: { title: 'Colis livré', body: 'Merci ! Notez votre coursier.' },
  unassigned: { title: 'Aucun coursier disponible', body: 'Réessayez dans quelques minutes.' },
  failed: { title: 'Livraison impossible', body: 'Le destinataire est injoignable : le colis vous est retourné.' },
};

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('x-notify-secret') !== SECRET) return json({ error: 'forbidden' }, 403);
  const e = await req.json();

  if (e.type === 'offer') {
    const s = e.summary ?? {};
    const km = (m: number) => `${(m / 1000).toFixed(1).replace('.', ',')} km`;
    await pushToUser(e.courier_id, 'courier', {
      title: 'Nouvelle course',
      body: `${s.pickup_zone_name ?? ''} · ${km(s.pickup_distance_m ?? 0)} jusqu'au colis · ${s.courier_gain ?? ''} F`,
      data: { type: 'offer', offer_id: e.offer_id },
      channelId: 'offers',
    });
  } else if (e.type === 'delivery') {
    const key = e.arrived_pickup ? 'arrived_pickup' : e.arrived_dropoff ? 'arrived_dropoff' : e.status;
    const msg = CLIENT_MESSAGES[key];
    if (msg) await pushToUser(e.client_id, 'client', { ...msg, data: { type: 'delivery', delivery_id: e.delivery_id } });
  } else if (e.type === 'courier_status') {
    const messages: Record<string, { title: string; body: string }> = {
      validated: { title: 'Compte validé', body: 'Vous pouvez passer en ligne et recevoir des courses.' },
      suspended: { title: 'Compte suspendu', body: 'Contactez l\'équipe Koursa.' },
      rejected: { title: 'Dossier refusé', body: 'Vérifiez vos documents et renvoyez votre dossier.' },
    };
    const m = messages[e.status];
    if (m) await pushToUser(e.courier_id, 'courier', { ...m, data: { type: 'courier_status' } });
  }
  return json({ ok: true });
});
