// PWA : Maps JavaScript API (clé web restreinte à notre domaine).
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MARKER_COLORS, type KoursaMapProps } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any;
    __koursaMapsLoading?: Promise<void>;
  }
}

function loadMaps(key: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (window.__koursaMapsLoading) return window.__koursaMapsLoading;
  window.__koursaMapsLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=fr&region=TG&v=weekly`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('maps'));
    document.head.appendChild(s);
  });
  return window.__koursaMapsLoading;
}

export function KoursaMap({ center, zoom = 15, markers = [], polygons = [], fitToMarkers, onCenterChange, style, bottomPadding = 0 }: KoursaMapProps) {
  const div = useRef<HTMLDivElement | null>(null);
  const map = useRef<any>(null);
  const overlays = useRef<any[]>([]);
  const [failed, setFailed] = useState(false);
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY ?? '';
  const onCenterRef = useRef(onCenterChange);
  onCenterRef.current = onCenterChange;

  useEffect(() => {
    if (!key) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    loadMaps(key).then(() => {
      if (cancelled || !div.current) return;
      const g = window.google.maps;
      map.current = new g.Map(div.current, {
        center: { lat: center.lat, lng: center.lng },
        zoom,
        disableDefaultUI: true,
        clickableIcons: false,
        gestureHandling: 'greedy',
      });
      map.current.addListener('idle', () => {
        const c = map.current.getCenter();
        onCenterRef.current?.({ lat: c.lat(), lng: c.lng() });
      });
      setFailed(false);
    }).catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const g = window.google?.maps;
    if (!g || !map.current) return;
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = [];
    for (const p of polygons) {
      overlays.current.push(new g.Polygon({
        map: map.current,
        paths: p.rings.map((r) => r.map((c) => ({ lat: c.lat, lng: c.lng }))),
        strokeColor: p.color, strokeWeight: 2, fillColor: p.color, fillOpacity: 0.12, clickable: false,
      }));
    }
    for (const m of markers) {
      overlays.current.push(new g.Marker({
        map: map.current,
        position: { lat: m.lat, lng: m.lng },
        title: m.title,
        icon: { path: g.SymbolPath.CIRCLE, scale: 8, fillColor: m.color ?? MARKER_COLORS[m.kind], fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
      }));
    }
    if (fitToMarkers && markers.length > 1) {
      const b = new g.LatLngBounds();
      markers.forEach((m) => b.extend({ lat: m.lat, lng: m.lng }));
      map.current.fitBounds(b, { top: 60, right: 40, bottom: bottomPadding + 40, left: 40 });
    } else if (!onCenterRef.current) {
      map.current.panTo({ lat: center.lat, lng: center.lng });
    }
  }, [markers, polygons, fitToMarkers, center.lat, center.lng, bottomPadding]);

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <div ref={div} style={{ position: 'absolute', inset: 0, background: '#E9EEF2' }} />
      {failed ? (
        <View style={styles.fallback} pointerEvents="none">
          <Text style={styles.fallbackText}>Carte indisponible — vous pouvez continuer avec la recherche d'adresse.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { position: 'absolute', top: 60, left: 16, right: 16, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.9)' },
  fallbackText: { color: '#6B6B6B', textAlign: 'center' },
});
