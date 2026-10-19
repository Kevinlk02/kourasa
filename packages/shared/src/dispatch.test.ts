import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICING } from './pricing.ts';
import { dispatchStep, waveCandidates, type DispatchCourier, type DispatchDelivery } from './dispatch.ts';

const P = DEFAULT_PRICING.dispatch;
const Z1 = 'zone-1';
const Z2 = 'zone-2';
const now = 1_000_000_000;

// Point de récupération dans la zone 1 (centre-ville de Lomé)
const pickup = { lat: 6.1319, lng: 1.2228 };
// ~1 km ≈ 0,009° de latitude
const at = (dkm: number) => ({ lat: pickup.lat + dkm * 0.009, lng: pickup.lng });

function courier(id: string, home: string | null, current: string | null, dkm: number, extra: Partial<DispatchCourier> = {}): DispatchCourier {
  return { id, home_zone_id: home, current_zone_id: current, position: at(dkm), online: true, validated: true, blocked: false, busy: false, last_seen_at: now - 10_000, ...extra };
}

const delivery: DispatchDelivery = {
  pickup,
  pickup_zone_id: Z1,
  allow_overflow: true,
  search_started_at: now,
  wave: 1,
  wave_started_at: now,
};

const fleet = [
  courier('z1-home-far', Z1, Z1, 4),
  courier('z1-home-near', Z1, Z1, 1),
  courier('z2-home-in-z1', Z2, Z1, 0.5), // vague 2
  courier('z2-near', Z2, Z2, 2.5), // vague 3 (débordement < 3 km)
  courier('z2-far', Z2, Z2, 6), // trop loin pour le débordement
  courier('z1-home-outside', Z1, Z2, 1.5), // d'attache Z1 mais présent en Z2 → vague 3
  courier('z1-offline', Z1, Z1, 0.2, { online: false }),
  courier('z1-blocked', Z1, Z1, 0.2, { blocked: true }),
  courier('z1-busy', Z1, Z1, 0.2, { busy: true }),
  courier('z1-stale', Z1, Z1, 0.2, { last_seen_at: now - 5 * 60_000 }),
  courier('z1-pending', Z1, Z1, 0.2, { validated: false }),
];

describe('candidats par vague (ZONES.md)', () => {
  it('vague 1 : coursiers d’attache présents dans la zone, du plus proche au plus loin', () => {
    expect(waveCandidates(1, delivery, fleet, now, P).map((c) => c.courier.id)).toEqual(['z1-home-near', 'z1-home-far']);
  });
  it('vague 2 : tout coursier présent dans la zone', () => {
    expect(waveCandidates(2, delivery, fleet, now, P).map((c) => c.courier.id)).toEqual([
      'z2-home-in-z1',
      'z1-home-near',
      'z1-home-far',
    ]);
  });
  it('vague 3 : débordement à moins de 3 km, seulement si allow_overflow', () => {
    expect(waveCandidates(3, delivery, fleet, now, P).map((c) => c.courier.id)).toEqual(['z1-home-outside', 'z2-near']);
    expect(waveCandidates(3, { ...delivery, allow_overflow: false }, fleet, now, P)).toEqual([]);
  });
  it('exclut hors ligne, bloqués, occupés, position périmée, non validés', () => {
    const ids = [1, 2, 3].flatMap((w) => waveCandidates(w as 1 | 2 | 3, delivery, fleet, now, P).map((c) => c.courier.id));
    for (const bad of ['z1-offline', 'z1-blocked', 'z1-busy', 'z1-stale', 'z1-pending']) expect(ids).not.toContain(bad);
  });
});

describe('déroulé de l’attribution', () => {
  it('première offre au coursier d’attache le plus proche', () => {
    const d = dispatchStep(delivery, fleet, [], now, P);
    expect(d).toMatchObject({ type: 'offer', courier_id: 'z1-home-near', wave: 1 });
  });

  it('attend pendant les 20 s d’une offre', () => {
    const d = dispatchStep(delivery, fleet, [{ courier_id: 'z1-home-near', sent_at: now, response: 'pending' }], now + 10_000, P);
    expect(d).toEqual({ type: 'wait', until: now + 20_000 });
  });

  it('silence de 20 s = coursier suivant', () => {
    const d = dispatchStep(delivery, fleet, [{ courier_id: 'z1-home-near', sent_at: now, response: 'pending' }], now + 21_000, P);
    expect(d).toMatchObject({ type: 'offer', courier_id: 'z1-home-far', wave: 1 });
  });

  it('vague 1 épuisée → vague 2', () => {
    const offers = [
      { courier_id: 'z1-home-near', sent_at: now, response: 'declined' as const },
      { courier_id: 'z1-home-far', sent_at: now + 5000, response: 'declined' as const },
    ];
    const d = dispatchStep(delivery, fleet, offers, now + 10_000, P);
    expect(d).toMatchObject({ type: 'offer', courier_id: 'z2-home-in-z1', wave: 2 });
  });

  it('90 s sans preneur → vague suivante même si la vague n’est pas épuisée', () => {
    const many = [...Array(8)].map((_, i) => courier(`z1-${i}`, Z1, Z1, 1 + i * 0.1));
    const offers = many.slice(0, 4).map((c, i) => ({ courier_id: c.id, sent_at: now + i * 20_000, response: 'expired' as const }));
    const z2in = courier('z2-in', Z2, Z1, 0.3);
    const d = dispatchStep(delivery, [...many, z2in], offers, now + 91_000, P);
    expect(d).toMatchObject({ type: 'offer', courier_id: 'z2-in', wave: 2 });
  });

  it('vague 3 : débordement depuis l’autre zone', () => {
    const offers = ['z1-home-near', 'z1-home-far', 'z2-home-in-z1'].map((id) => ({ courier_id: id, sent_at: now, response: 'declined' as const }));
    const d = dispatchStep(delivery, fleet, offers, now + 30_000, P);
    expect(d).toMatchObject({ type: 'offer', courier_id: 'z1-home-outside', wave: 3 });
  });

  it('personne → idle, puis unassigned après 3 min', () => {
    expect(dispatchStep(delivery, [], [], now + 30_000, P)).toEqual({ type: 'idle' });
    expect(dispatchStep(delivery, fleet, [], now + 180_000, P)).toEqual({ type: 'unassign' });
  });

  it('un coursier qui vient de se connecter en zone 1 est rattrapé après la vague 3', () => {
    const d3: DispatchDelivery = { ...delivery, wave: 3, wave_started_at: now };
    const late = courier('late', Z1, Z1, 2);
    expect(dispatchStep(d3, [late], [], now + 100_000, P)).toMatchObject({ type: 'offer', courier_id: 'late' });
  });
});
