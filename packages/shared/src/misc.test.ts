import { describe, expect, it } from 'vitest';
import { canTransition, courierStep } from './status.ts';
import { compareVersions, navigationUrl, toE164, updateState } from './version.ts';
import { t } from './i18n.ts';
import { createDeliveryRequestSchema, pricingParamsSchema } from './schemas.ts';
import { DEFAULT_PRICING } from './pricing.ts';

describe('statuts', () => {
  it('transitions autorisées', () => {
    expect(canTransition('searching', 'assigned')).toBe(true);
    expect(canTransition('delivered', 'searching')).toBe(false);
    expect(canTransition('picked_up', 'cancelled_by_client')).toBe(false);
  });
  it('étape coursier', () => {
    expect(courierStep({ status: 'assigned', arrived_pickup_at: null, arrived_dropoff_at: null })).toBe('to_pickup');
    expect(courierStep({ status: 'assigned', arrived_pickup_at: 'x', arrived_dropoff_at: null })).toBe('at_pickup');
    expect(courierStep({ status: 'delivering', arrived_pickup_at: 'x', arrived_dropoff_at: 'y' })).toBe('at_dropoff');
  });
});

describe('versions', () => {
  it('compare', () => {
    expect(compareVersions('1.2.10', '1.2.9')).toBe(1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
  });
  it('état de mise à jour', () => {
    const v = { latest_version: '1.3.0', min_version: '1.1.0' };
    expect(updateState('1.0.5', v)).toBe('required');
    expect(updateState('1.2.0', v)).toBe('available');
    expect(updateState('1.3.0', v)).toBe('ok');
  });
});

describe('utilitaires', () => {
  it('E.164', () => {
    expect(toE164('+228', '90 12 34 56')).toBe('+22890123456');
    expect(toE164('+228', '+228 90 12 34 56')).toBe('+22890123456');
    expect(toE164('+235', '066123456')).toBe('+23566123456');
  });
  it('lien de navigation deux-roues', () => {
    expect(navigationUrl(6.13, 1.22)).toContain('travelmode=two-wheeler');
  });
  it('i18n avec variables', () => {
    expect(t('create.waitingLine', { grace: 5, fee: 50 })).toBe("5 min d'attente offertes, puis 50 F/min");
  });
  it('les paramètres par défaut respectent le schéma de cities.pricing', () => {
    expect(pricingParamsSchema.safeParse(DEFAULT_PRICING).success).toBe(true);
  });
  it('repère obligatoire', () => {
    const r = createDeliveryRequestSchema.safeParse({
      city_id: '7f1d6c0e-2a43-4b8e-9a51-0c4d1b2e3f40',
      pickup: { point: { lat: 6.13, lng: 1.22 }, landmark: '' },
      dropoff: { point: { lat: 6.15, lng: 1.2 }, landmark: 'Portail bleu' },
      recipient_name: 'Ama',
      recipient_phone: '+22890000000',
      size: 'small',
      payer: 'sender',
      expected_price: 1300,
    });
    expect(r.success).toBe(false);
  });
});
