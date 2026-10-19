import type { ViewStyle } from 'react-native';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  kind: 'pickup' | 'dropoff' | 'courier' | 'me' | 'point';
  color?: string;
  title?: string;
}

export interface MapPolygon {
  id: string;
  /** Anneaux extérieurs [lat, lng][] (un MultiPolygon peut en avoir plusieurs). */
  rings: LatLng[][];
  color: string;
  label?: string;
}

export interface KoursaMapProps {
  center: LatLng;
  zoom?: number;
  markers?: MapMarker[];
  polygons?: MapPolygon[];
  /** Cadrer automatiquement sur les marqueurs. */
  fitToMarkers?: boolean;
  showsUserLocation?: boolean;
  onCenterChange?: (c: LatLng) => void;
  style?: ViewStyle;
  bottomPadding?: number;
}

/** GeoJSON MultiPolygon (lng, lat) → anneaux extérieurs (lat, lng). */
export function multiPolygonToRings(geo: { type: string; coordinates: number[][][][] } | null | undefined): LatLng[][] {
  if (!geo || geo.type !== 'MultiPolygon') return [];
  return geo.coordinates
    .map((poly) => poly[0] ?? [])
    .map((ring) => ring.map((pt) => ({ lng: pt[0] ?? 0, lat: pt[1] ?? 0 })));
}

export const MARKER_COLORS = {
  pickup: '#111111',
  dropoff: '#00A86B',
  courier: '#2F80ED',
  me: '#2F80ED',
  point: '#6B6B6B',
} as const;
