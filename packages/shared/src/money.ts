/**
 * Règles d'argent : attente, encaissement, incitation, pénalité — docs/MVP.md section 5.
 * Sans dépendance (copié dans les Edge Functions). Tous les montants sont des entiers.
 */
import { commissionOf, type LatePenaltyParams, type WaitingParams } from './pricing.ts';

export type Payer = 'sender' | 'recipient';

const MS_PER_MIN = 60_000;

export interface WaitingResult {
  /** Minutes écoulées depuis « Je suis arrivé ». */
  elapsed_min: number;
  /** Minutes facturées (après tolérance, plafonnées). */
  billable_min: number;
  fee: number;
  /** Les frais ont commencé (le client voit alors le compteur). */
  charging: boolean;
  /** Le plafond est atteint : le coursier peut déclarer « client absent ». */
  cap_reached: boolean;
  /** Instant (ms) où la facturation commence. */
  charging_starts_at: number;
}

/**
 * Frais d'attente à un point. Le minuteur démarre à `arrivedAt` ;
 * seules les minutes entières écoulées après la tolérance sont facturées.
 */
export function waitingFee(
  w: WaitingParams,
  graceMin: number,
  arrivedAt: number,
  endedAt: number,
): WaitingResult {
  const elapsedMs = Math.max(0, endedAt - arrivedAt);
  const elapsedMin = elapsedMs / MS_PER_MIN;
  const overMs = elapsedMs - graceMin * MS_PER_MIN;
  const billable = Math.min(Math.max(0, Math.floor(overMs / MS_PER_MIN)), w.max_billable_min);
  return {
    elapsed_min: elapsedMin,
    billable_min: billable,
    fee: billable * w.fee_per_min,
    charging: overMs > 0,
    cap_reached: overMs >= w.max_billable_min * MS_PER_MIN,
    charging_starts_at: arrivedAt + graceMin * MS_PER_MIN,
  };
}

export interface CollectInput {
  payer: Payer;
  price: number;
  waiting_pickup_fee: number;
  waiting_dropoff_fee: number;
  /** Le destinataire a refusé de payer l'attente à la livraison. */
  waiting_refused: boolean;
}

export interface CollectResult {
  /** Encaissé auprès de l'expéditeur au point de récupération. */
  at_pickup: number;
  /** À encaisser auprès du destinataire, affiché en grand au coursier. */
  at_dropoff: number;
  /** Total réellement encaissé par le coursier sur la course. */
  total_collected: number;
  /** Détail affiché pour éviter les disputes. */
  lines: { label: 'price' | 'waiting_pickup' | 'waiting_dropoff'; amount: number; where: 'pickup' | 'dropoff' }[];
  /** Montant d'attente refusé, à traiter par l'admin. */
  refused_amount: number;
}

export function amountToCollect(c: CollectInput): CollectResult {
  const dropWait = c.waiting_refused ? 0 : c.waiting_dropoff_fee;
  const refused = c.waiting_refused ? c.waiting_dropoff_fee : 0;
  if (c.payer === 'recipient') {
    const atDropoff = c.price + c.waiting_pickup_fee + dropWait;
    return {
      at_pickup: 0,
      at_dropoff: atDropoff,
      total_collected: atDropoff,
      lines: [
        { label: 'price', amount: c.price, where: 'dropoff' },
        { label: 'waiting_pickup', amount: c.waiting_pickup_fee, where: 'dropoff' },
        { label: 'waiting_dropoff', amount: dropWait, where: 'dropoff' },
      ],
      refused_amount: refused,
    };
  }
  const atPickup = c.price + c.waiting_pickup_fee;
  return {
    at_pickup: atPickup,
    at_dropoff: dropWait,
    total_collected: atPickup + dropWait,
    lines: [
      { label: 'price', amount: c.price, where: 'pickup' },
      { label: 'waiting_pickup', amount: c.waiting_pickup_fee, where: 'pickup' },
      { label: 'waiting_dropoff', amount: dropWait, where: 'dropoff' },
    ],
    refused_amount: refused,
  };
}

/** Commission de la plateforme : 18 % du prix ET des frais d'attente encaissés. */
export function platformCommission(
  marginRate: number,
  price: number,
  waitingCollected: number,
): { on_price: number; on_waiting: number; total: number } {
  const onPrice = commissionOf(price, marginRate);
  const onWaiting = commissionOf(waitingCollected, marginRate);
  return { on_price: onPrice, on_waiting: onWaiting, total: onPrice + onWaiting };
}

/** Incitation à la course : 95 F/km au-delà de 2 km d'approche, plafond 500 F. */
export function approachBonus(
  p: { included_approach_km: number; approach_bonus_per_km: number; approach_bonus_cap: number },
  approachMeters: number,
): number {
  const extraKm = Math.max(0, approachMeters / 1000 - p.included_approach_km);
  return Math.min(Math.round(extraKm * p.approach_bonus_per_km), p.approach_bonus_cap);
}

export interface LatePenaltyInput {
  /** Durée de trajet estimée (s) au devis. */
  estimated_duration_s: number;
  picked_up_at: number;
  /** Arrivée au point de livraison : l'attente du destinataire ne compte pas. */
  arrived_dropoff_at: number;
  /** Part du coursier sur le prix. */
  courier_share: number;
  /** Incident validé par l'admin → pas de pénalité. */
  validated_incident: boolean;
}

export function latePenalty(
  p: LatePenaltyParams,
  i: LatePenaltyInput,
): { promised_min: number; actual_min: number; late_min: number; penalty: number } {
  const promisedMin = (i.estimated_duration_s / 60) * p.factor + p.extra_min;
  const actualMin = Math.max(0, i.arrived_dropoff_at - i.picked_up_at) / MS_PER_MIN;
  const lateMin = Math.max(0, Math.ceil(actualMin - promisedMin - 1e-9));
  if (i.validated_incident || lateMin === 0) {
    return { promised_min: promisedMin, actual_min: actualMin, late_min: lateMin, penalty: 0 };
  }
  const cap = Math.floor(i.courier_share * p.cap_rate);
  return {
    promised_min: promisedMin,
    actual_min: actualMin,
    late_min: lateMin,
    penalty: Math.min(lateMin * p.per_min, cap),
  };
}

const CURRENCY_LABEL: Record<string, string> = { XOF: 'F CFA', XAF: 'F CFA' };

/** 1500 → « 1 500 F CFA ». */
export function formatMoney(amount: number, currency: string): string {
  const n = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n} ${CURRENCY_LABEL[currency] ?? currency}`;
}
