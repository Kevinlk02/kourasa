import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICING, computePrice } from './pricing.ts';
import {
  amountToCollect,
  approachBonus,
  formatMoney,
  latePenalty,
  platformCommission,
  waitingFee,
} from './money.ts';

const p = DEFAULT_PRICING;
const MIN = 60_000;
const t0 = Date.UTC(2026, 0, 15, 10, 0, 0);

describe("frais d'attente", () => {
  it('5 min offertes : rien à payer à 4 min 59', () => {
    const r = waitingFee(p.waiting, 5, t0, t0 + 4 * MIN + 59_000);
    expect(r.fee).toBe(0);
    expect(r.charging).toBe(false);
  });

  it('50 F par minute entière après la tolérance', () => {
    const r = waitingFee(p.waiting, 5, t0, t0 + 12 * MIN + 30_000);
    expect(r.billable_min).toBe(7);
    expect(r.fee).toBe(350);
    expect(r.charging).toBe(true);
  });

  it('plafond 15 min payantes = 750 F', () => {
    const r = waitingFee(p.waiting, 5, t0, t0 + 60 * MIN);
    expect(r.fee).toBe(750);
    expect(r.cap_reached).toBe(true);
  });

  it('restaurant : 15 min offertes', () => {
    expect(waitingFee(p.waiting, 15, t0, t0 + 14 * MIN).fee).toBe(0);
    expect(waitingFee(p.waiting, 15, t0, t0 + 17 * MIN).fee).toBe(100);
  });
});

describe('incitation à la course', () => {
  it('rien jusqu’à 2 km', () => {
    expect(approachBonus(p, 2000)).toBe(0);
    expect(approachBonus(p, 1200)).toBe(0);
  });
  it('95 F/km au-delà', () => {
    expect(approachBonus(p, 5000)).toBe(285);
  });
  it('plafond 500 F', () => {
    expect(approachBonus(p, 8000)).toBe(500);
  });
});

describe('pénalité de retard', () => {
  const base = {
    estimated_duration_s: 18 * 60, // délai promis = 18 × 1,5 + 10 = 37 min
    picked_up_at: t0,
    courier_share: 1230,
    validated_incident: false,
  };
  it('pas de pénalité dans le délai', () => {
    expect(latePenalty(p.late_penalty, { ...base, arrived_dropoff_at: t0 + 37 * MIN }).penalty).toBe(0);
  });
  it('50 F/min de retard', () => {
    const r = latePenalty(p.late_penalty, { ...base, arrived_dropoff_at: t0 + 40 * MIN });
    expect(r.late_min).toBe(3);
    expect(r.penalty).toBe(150);
  });
  it('plafonnée à 30 % de la part du coursier', () => {
    expect(latePenalty(p.late_penalty, { ...base, arrived_dropoff_at: t0 + 45 * MIN }).penalty).toBe(369);
  });
  it('aucune pénalité si incident validé', () => {
    expect(
      latePenalty(p.late_penalty, { ...base, arrived_dropoff_at: t0 + 90 * MIN, validated_incident: true }).penalty,
    ).toBe(0);
  });
});

describe('cas complet : 6 km, attente aux deux points, incitation, pénalité', () => {
  const price = computePrice(p, { distance_m: 6000, duration_s: 1080, size: 'small' }).price; // 1500
  const waitPickup = waitingFee(p.waiting, 5, t0, t0 + 12 * MIN + 30_000).fee; // 350
  const arrivedDrop = t0 + 50 * MIN;
  const waitDropoff = waitingFee(p.waiting, 5, arrivedDrop, arrivedDrop + 9 * MIN).fee; // 200

  it('prix et frais', () => {
    expect(price).toBe(1500);
    expect(waitPickup).toBe(350);
    expect(waitDropoff).toBe(200);
  });

  it('le destinataire paie : tout est encaissé à la livraison', () => {
    const c = amountToCollect({ payer: 'recipient', price, waiting_pickup_fee: waitPickup, waiting_dropoff_fee: waitDropoff, waiting_refused: false });
    expect(c.at_pickup).toBe(0);
    expect(c.at_dropoff).toBe(2050);
    expect(c.total_collected).toBe(2050);
  });

  it("l'expéditeur paie : prix + attente récupération au départ, attente livraison au destinataire", () => {
    const c = amountToCollect({ payer: 'sender', price, waiting_pickup_fee: waitPickup, waiting_dropoff_fee: waitDropoff, waiting_refused: false });
    expect(c.at_pickup).toBe(1850);
    expect(c.at_dropoff).toBe(200);
    expect(c.total_collected).toBe(2050);
  });

  it('attente refusée : livraison clôturée, montant signalé à l’admin', () => {
    const c = amountToCollect({ payer: 'sender', price, waiting_pickup_fee: waitPickup, waiting_dropoff_fee: waitDropoff, waiting_refused: true });
    expect(c.at_dropoff).toBe(0);
    expect(c.refused_amount).toBe(200);
    expect(c.total_collected).toBe(1850);
  });

  it('commission 18 % sur le prix ET sur l’attente, puis dette du coursier au franc près', () => {
    const com = platformCommission(p.margin_rate, price, waitPickup + waitDropoff);
    expect(com.on_price).toBe(270);
    expect(com.on_waiting).toBe(99);
    expect(com.total).toBe(369);

    const bonus = approachBonus(p, 5000); // 285, crédité le lendemain
    const penalty = latePenalty(p.late_penalty, {
      estimated_duration_s: 1080,
      picked_up_at: t0 + 13 * MIN,
      arrived_dropoff_at: t0 + 53 * MIN, // 40 min → 3 min de retard
      courier_share: price - com.on_price,
      validated_incident: false,
    }).penalty;
    expect(penalty).toBe(150);
    expect(com.total + penalty - bonus).toBe(234);
  });
});

describe('affichage', () => {
  it('formatMoney', () => {
    expect(formatMoney(1500, 'XOF')).toBe('1 500 F CFA');
    expect(formatMoney(700, 'XAF')).toBe('700 F CFA');
  });
});
