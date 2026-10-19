// FICHIER GÉNÉRÉ depuis packages/shared/src/schemas.ts par scripts/sync-shared.mjs — ne pas modifier ici.
/**
 * Schémas Zod partagés : validation côté app ET côté Edge Function.
 */
import { z } from 'zod';

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const packageSizeSchema = z.enum(['small', 'medium', 'large']);
export const payerSchema = z.enum(['sender', 'recipient']);

/** Téléphone au format E.164 (+228XXXXXXXX, +235XXXXXXXX). */
export const phoneSchema = z.string().regex(/^\+\d{8,15}$/, 'Numéro invalide');

export const placeInputSchema = z.object({
  point: latLngSchema,
  address: z.string().trim().max(300).default(''),
  /** Repère obligatoire : c'est lui qui fait la livraison. */
  landmark: z.string().trim().min(3, 'Ajoutez un repère').max(300),
  place_id: z.string().max(300).nullish(),
  /** Session token Google (si le lieu vient de l'autocomplétion). */
  session_token: z.string().max(100).nullish(),
  /** L'épingle a été posée à la main (pas de lieu Google choisi). */
  manual_pin: z.boolean().default(false),
});
export type PlaceInput = z.infer<typeof placeInputSchema>;

export const quoteRequestSchema = z.object({
  city_id: z.string().uuid(),
  pickup: latLngSchema,
  dropoff: latLngSchema,
  size: packageSizeSchema,
});
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export const createDeliveryRequestSchema = z.object({
  city_id: z.string().uuid(),
  pickup: placeInputSchema,
  dropoff: placeInputSchema,
  recipient_name: z.string().trim().min(2).max(100),
  recipient_phone: phoneSchema,
  size: packageSizeSchema,
  payer: payerSchema,
  note: z.string().trim().max(300).optional(),
  /** Prix affiché au client : la commande est refusée si le prix serveur a changé. */
  expected_price: z.number().int().positive(),
});
export type CreateDeliveryRequest = z.infer<typeof createDeliveryRequestSchema>;

export const autocompleteRequestSchema = z.object({
  input: z.string().trim().min(3).max(200),
  session_token: z.string().min(8).max(100),
  city_id: z.string().uuid(),
});

export const placeDetailsRequestSchema = z.object({
  place_id: z.string().min(1).max(300),
  session_token: z.string().min(8).max(100).optional(),
});

export const reverseGeocodeRequestSchema = latLngSchema;

export const routeRequestSchema = z.object({
  from: latLngSchema,
  to: latLngSchema,
});

export const locationPingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().optional(),
  heading: z.number().optional(),
  speed: z.number().optional(),
  recorded_at: z.string().datetime(),
});
export type LocationPing = z.infer<typeof locationPingSchema>;

export const courierActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('arrive_pickup'), delivery_id: z.string().uuid(), point: latLngSchema }),
  z.object({ action: z.literal('picked_up'), delivery_id: z.string().uuid(), photo_path: z.string().max(300).optional() }),
  z.object({ action: z.literal('start_dropoff'), delivery_id: z.string().uuid() }),
  z.object({ action: z.literal('arrive_dropoff'), delivery_id: z.string().uuid(), point: latLngSchema }),
  z.object({
    action: z.literal('complete'),
    delivery_id: z.string().uuid(),
    code: z.string().regex(/^\d{4}$/, 'Code à 4 chiffres'),
    waiting_refused: z.boolean().default(false),
  }),
  z.object({ action: z.literal('client_absent'), delivery_id: z.string().uuid() }),
  z.object({ action: z.literal('cancel'), delivery_id: z.string().uuid(), reason: z.string().max(300) }),
]);
export type CourierAction = z.infer<typeof courierActionSchema>;

export const incidentSchema = z.object({
  delivery_id: z.string().uuid().nullable(),
  kind: z.enum(['breakdown', 'accident', 'police_check', 'other']),
  description: z.string().trim().max(500).default(''),
});

export const ratingSchema = z.object({
  delivery_id: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

export const courierSignupSchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  vehicle_model: z.string().trim().min(2).max(100),
  plate: z.string().trim().min(3).max(20),
  photo_path: z.string().min(1),
  id_document_path: z.string().min(1),
  vehicle_photo_path: z.string().min(1),
  license_path: z.string().min(1),
});
export type CourierSignup = z.infer<typeof courierSignupSchema>;

/** Schéma du JSON `cities.pricing` (édité depuis l'admin). */
export const pricingParamsSchema = z.object({
  fuel_price_per_l: z.number().positive(),
  fuel_l_per_km: z.number().positive(),
  wear_per_km: z.number().nonnegative(),
  courier_hourly_target: z.number().positive(),
  margin_rate: z.number().min(0).max(0.9),
  minimum_price: z.number().int().nonnegative(),
  size_coef: z.object({ small: z.number().positive(), medium: z.number().positive(), large: z.number().positive() }),
  included_approach_km: z.number().nonnegative(),
  time_buffer_min: z.number().nonnegative(),
  rounding: z.number().int().positive(),
  detour_factor: z.number().min(1),
  fallback_speed_kmh: z.number().positive(),
  approach_bonus_per_km: z.number().int().nonnegative(),
  approach_bonus_cap: z.number().int().nonnegative(),
  waiting: z.object({
    grace_min: z.number().int().nonnegative(),
    restaurant_grace_min: z.number().int().nonnegative(),
    fee_per_min: z.number().int().nonnegative(),
    max_billable_min: z.number().int().nonnegative(),
  }),
  late_penalty: z.object({
    factor: z.number().min(1),
    extra_min: z.number().nonnegative(),
    per_min: z.number().int().nonnegative(),
    cap_rate: z.number().min(0).max(1),
  }),
  block_threshold: z.number().int().nonnegative(),
  allow_dropoff_outside: z.boolean(),
  dispatch: z.object({
    offer_timeout_s: z.number().int().positive(),
    wave_timeout_s: z.number().int().positive(),
    unassigned_after_s: z.number().int().positive(),
    overflow_radius_m: z.number().int().nonnegative(),
    location_max_age_s: z.number().int().positive(),
  }),
  arrival_radius_m: z.number().int().positive(),
  restaurant_radius_m: z.number().int().positive(),
});
