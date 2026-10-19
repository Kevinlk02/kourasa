import { describe, expect, it } from 'vitest';
import { computePrice, DEFAULT_PRICING, fallbackRoute, motoCostPerKm, roundUpTo } from './pricing.ts';

const p = DEFAULT_PRICING;

describe('formule de prix (MVP §5)', () => {
  it('coût moto = consommation × carburant + usure = 95 F/km', () => {
    expect(motoCostPerKm(p)).toBeCloseTo(95, 6);
  });

  it('5 km, 15 min, Petit → 1 300 F', () => {
    // (5 + 2) × 95 = 665 ; (15 + 5) × 20 = 400 ; 1065 / 0,82 = 1298,78 → 1300
    const r = computePrice(p, { distance_m: 5000, duration_s: 900, size: 'small' });
    expect(r.base_cost).toBeCloseTo(1065, 6);
    expect(r.price).toBe(1300);
    expect(r.commission).toBe(234);
    expect(r.courier_share).toBe(1066);
  });

  it('6 km, 18 min, Petit → 1 500 F', () => {
    // (6 + 2) × 95 = 760 ; (18 + 5) × 20 = 460 ; 1220 / 0,82 = 1487,80 → 1500
    const r = computePrice(p, { distance_m: 6000, duration_s: 1080, size: 'small' });
    expect(r.price).toBe(1500);
  });

  it('petite course → minimum 700 F', () => {
    const r = computePrice(p, { distance_m: 500, duration_s: 120, size: 'small' });
    expect(r.before_minimum).toBeLessThan(700);
    expect(r.price).toBe(700);
  });

  it('minimum appliqué AVANT le coefficient de taille', () => {
    const r = computePrice(p, { distance_m: 500, duration_s: 120, size: 'large' });
    expect(r.price).toBe(1100); // 700 × 1,5 = 1050 → 1100
  });

  it('coefficient Grand ×1,5 : 5 km → 2 000 F', () => {
    const r = computePrice(p, { distance_m: 5000, duration_s: 900, size: 'large' });
    expect(r.price).toBe(2000); // 1298,78 × 1,5 = 1948,17 → 2000
  });

  it('coefficient Moyen ×1,2 : 5 km → 1 600 F', () => {
    const r = computePrice(p, { distance_m: 5000, duration_s: 900, size: 'medium' });
    expect(r.price).toBe(1600);
  });

  it('arrondi à la centaine supérieure', () => {
    expect(roundUpTo(1201, 100)).toBe(1300);
    expect(roundUpTo(1300, 100)).toBe(1300);
    expect(roundUpTo(1300.0000001, 100)).toBe(1300);
    expect(roundUpTo(1300.01, 100)).toBe(1400);
  });

  it('tous les paramètres viennent de la ville (marge modifiée)', () => {
    const r = computePrice({ ...p, margin_rate: 0.2 }, { distance_m: 5000, duration_s: 900, size: 'small' });
    expect(r.price).toBe(1400); // 1065 / 0,8 = 1331,25 → 1400
  });

  it('refuse les valeurs négatives', () => {
    expect(() => computePrice(p, { distance_m: -1, duration_s: 0, size: 'small' })).toThrow();
  });
});

describe('itinéraire dégradé', () => {
  it('vol d’oiseau × 1,3', () => {
    const r = fallbackRoute(p, { lat: 6.1319, lng: 1.2228 }, { lat: 6.1319, lng: 1.2318 });
    // ~995 m à l'équateur → ×1,3 ≈ 1293 m
    expect(r.distance_m).toBeGreaterThan(1250);
    expect(r.distance_m).toBeLessThan(1330);
    expect(r.duration_s).toBeGreaterThan(0);
  });
});
