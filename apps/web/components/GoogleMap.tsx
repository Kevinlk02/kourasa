'use client';

import { useEffect, useRef, useState } from 'react';

let loading: Promise<typeof google.maps> | null = null;

/** Charge Maps JavaScript API une seule fois (clé web restreinte au domaine). */
export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (typeof window === 'undefined') return Promise.reject(new Error('ssr'));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (loading) return loading;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_WEB_KEY;
  if (!key) return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_WEB_KEY manquante'));
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=fr&region=TG&v=weekly`;
    s.async = true;
    s.onload = () => resolve(window.google.maps);
    s.onerror = () => reject(new Error('Chargement de Google Maps impossible'));
    document.head.appendChild(s);
  });
  return loading;
}

/** Carte simple : renvoie l'instance une fois prête. */
export function useGoogleMap(center: { lat: number; lng: number }, zoom = 12) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !ref.current) return;
        setMap(new g.Map(ref.current, { center, zoom, disableDefaultUI: true, zoomControl: true, clickableIcons: false, gestureHandling: 'greedy' }));
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { ref, map, error };
}

export function dot(color: string, scale = 8): google.maps.Symbol {
  return { path: google.maps.SymbolPath.CIRCLE, scale, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 };
}
