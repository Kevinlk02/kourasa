/** Statuts d'une course — docs/MVP.md section 5. */
export const DELIVERY_STATUSES = [
  'pending',
  'searching',
  'assigned',
  'picked_up',
  'delivering',
  'delivered',
  'cancelled_by_client',
  'cancelled_by_courier',
  'unassigned',
  'failed',
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const ACTIVE_STATUSES: readonly DeliveryStatus[] = [
  'pending',
  'searching',
  'assigned',
  'picked_up',
  'delivering',
];

export const FINAL_STATUSES: readonly DeliveryStatus[] = [
  'delivered',
  'cancelled_by_client',
  'cancelled_by_courier',
  'unassigned',
  'failed',
];

/** Transitions autorisées (appliquées côté serveur dans transition_delivery). */
export const TRANSITIONS: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  pending: ['searching', 'cancelled_by_client'],
  searching: ['assigned', 'cancelled_by_client', 'unassigned'],
  assigned: ['picked_up', 'cancelled_by_courier', 'cancelled_by_client', 'searching'],
  picked_up: ['delivering', 'failed'],
  delivering: ['delivered', 'failed'],
  delivered: [],
  cancelled_by_client: [],
  cancelled_by_courier: [],
  unassigned: ['searching'],
  failed: [],
};

export function canTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isActive(s: DeliveryStatus): boolean {
  return ACTIVE_STATUSES.includes(s);
}

export type CourierStep =
  | 'to_pickup'
  | 'at_pickup'
  | 'to_dropoff'
  | 'at_dropoff'
  | 'done';

/** Étape affichée au coursier à partir du statut et des horodatages. */
export function courierStep(d: {
  status: DeliveryStatus;
  arrived_pickup_at: string | null;
  arrived_dropoff_at: string | null;
}): CourierStep {
  switch (d.status) {
    case 'assigned':
      return d.arrived_pickup_at ? 'at_pickup' : 'to_pickup';
    case 'picked_up':
    case 'delivering':
      return d.arrived_dropoff_at ? 'at_dropoff' : 'to_dropoff';
    default:
      return 'done';
  }
}

export type IncidentKind = 'breakdown' | 'accident' | 'police_check' | 'other';
export const INCIDENT_KINDS: readonly IncidentKind[] = ['breakdown', 'accident', 'police_check', 'other'];
