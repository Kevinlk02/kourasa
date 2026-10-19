/**
 * Types des lignes Supabase utilisées par les apps.
 * Après `supabase start`, `pnpm --filter @koursa/shared gen:types` produit
 * database.types.ts complet ; ces types restent la référence côté apps.
 */
import type { DeliveryStatus } from './status.ts';
import type { PackageSize, PricingParams } from './pricing.ts';
import type { Payer } from './money.ts';

export type Role = 'client' | 'courier' | 'admin';
export type CourierValidation = 'pending' | 'validated' | 'suspended' | 'rejected';

export interface Country {
  code: string;
  name: string;
  currency: 'XOF' | 'XAF';
  dial_code: string;
  active: boolean;
}

export interface City {
  id: string;
  country_code: string;
  name: string;
  center_lat: number;
  center_lng: number;
  pricing: PricingParams;
  active: boolean;
}

export interface Zone {
  id: string;
  city_id: string;
  code: string;
  name: string;
  color: string;
  active: boolean;
  allow_overflow: boolean;
  /** GeoJSON MultiPolygon (vue zones_geojson). */
  geojson?: { type: 'MultiPolygon'; coordinates: number[][][][] };
}

export interface Profile {
  id: string;
  role: Role;
  full_name: string | null;
  phone: string | null;
  city_id: string | null;
}

export interface Courier {
  id: string;
  validation_status: CourierValidation;
  vehicle_model: string | null;
  plate: string | null;
  photo_path: string | null;
  home_zone_id: string | null;
  online: boolean;
  last_seen_at: string | null;
  rating_avg: number | null;
  rating_count: number;
  blocked: boolean;
}

/** Vue client : jamais la tolérance d'attente interne ni le hash du code. */
export interface ClientDelivery {
  id: string;
  status: DeliveryStatus;
  city_id: string;
  currency: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  pickup_landmark: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string;
  dropoff_landmark: string;
  recipient_name: string;
  recipient_phone: string;
  size: PackageSize;
  payer: Payer;
  distance_m: number;
  price_locked: number;
  courier_id: string | null;
  courier_name: string | null;
  courier_phone: string | null;
  courier_plate: string | null;
  courier_photo_path: string | null;
  courier_lat: number | null;
  courier_lng: number | null;
  arrived_pickup_at: string | null;
  arrived_dropoff_at: string | null;
  waiting_pickup_fee: number;
  waiting_dropoff_fee: number;
  waiting_charging_since: string | null;
  tracking_token: string;
  created_at: string;
  delivered_at: string | null;
  rated: boolean;
}

/** Vue coursier : la vraie règle d'attente est visible. */
export interface CourierDelivery {
  id: string;
  status: DeliveryStatus;
  currency: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  pickup_landmark: string;
  pickup_is_restaurant: boolean;
  pickup_grace_min: number;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string;
  dropoff_landmark: string;
  dropoff_grace_min: number;
  recipient_name: string;
  recipient_phone: string;
  sender_name: string | null;
  sender_phone: string | null;
  size: PackageSize;
  payer: Payer;
  distance_m: number;
  price_locked: number;
  courier_share: number;
  arrived_pickup_at: string | null;
  picked_up_at: string | null;
  arrived_dropoff_at: string | null;
  waiting_pickup_fee: number;
  waiting_dropoff_fee: number;
  amount_to_collect: number | null;
}

export interface DeliveryOffer {
  id: string;
  delivery_id: string;
  courier_id: string;
  wave: number;
  sent_at: string;
  expires_at: string;
  response: 'pending' | 'accepted' | 'declined' | 'expired';
  pickup_zone_name: string;
  pickup_distance_m: number;
  trip_distance_m: number;
  courier_gain: number;
  currency: string;
  pickup_address: string;
  dropoff_address: string;
}

export interface AppVersion {
  app: 'client' | 'courier';
  platform: 'android' | 'web';
  latest_version: string;
  min_version: string;
  apk_url: string | null;
  sha256: string | null;
  size_bytes: number | null;
  changelog: string | null;
  published_at: string;
}

export interface SavedPlace {
  id: string;
  label: string;
  lat: number;
  lng: number;
  address: string;
  landmark: string;
  place_id: string | null;
  favorite: boolean;
  last_used_at: string;
}

export interface QuoteResponse {
  price: number;
  currency: string;
  distance_m: number;
  duration_s: number;
  waiting_grace_min: number;
  waiting_fee_per_min: number;
  pickup_zone: { id: string; name: string };
  dropoff_zone: { id: string; name: string } | null;
  degraded: boolean;
}
