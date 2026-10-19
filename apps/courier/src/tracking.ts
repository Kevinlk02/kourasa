/**
 * Position du coursier : toutes les ~10 s quand il est en ligne, écran éteint compris
 * (service au premier plan Android avec notification permanente).
 * File d'attente locale : sans réseau, les positions sont gardées et envoyées au retour.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { LocationPing } from '@koursa/shared';
import { getSupabase } from '@koursa/ui';

export const LOCATION_TASK = 'koursa-courier-location';
const QUEUE_KEY = 'koursa.location.queue';
const MAX_QUEUE = 500;
let flushing = false;

type Listener = (r: { in_home_zone: boolean; current_zone_id: string | null }) => void;
const listeners = new Set<Listener>();
export function onZoneUpdate(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

async function enqueue(points: LocationPing[]) {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const q: LocationPing[] = raw ? JSON.parse(raw) : [];
  q.push(...points);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE)));
}

export async function flushQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const q: LocationPing[] = raw ? JSON.parse(raw) : [];
    if (!q.length) return;
    // Envoi par lots de 100 (payload léger).
    for (let i = 0; i < q.length; i += 100) {
      const batch = q.slice(i, i + 100);
      const { data, error } = await getSupabase().rpc('courier_ping', { p_points: batch });
      if (error) {
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(i)));
        return;
      }
      if (data) listeners.forEach((l) => l(data as { in_home_zone: boolean; current_zone_id: string | null }));
    }
    await AsyncStorage.removeItem(QUEUE_KEY);
  } finally {
    flushing = false;
  }
}

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
  if (!locations?.length) return;
  await enqueue(locations.map((l) => ({
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    accuracy: l.coords.accuracy ?? undefined,
    heading: l.coords.heading ?? undefined,
    speed: l.coords.speed ?? undefined,
    recorded_at: new Date(l.timestamp).toISOString(),
  })));
  await flushQueue();
});

export async function requestPermissions(): Promise<string | null> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'Autorisez la localisation pour passer en ligne.';
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return 'Choisissez « Toujours autoriser » la localisation pour recevoir des courses écran éteint.';
  return null;
}

export async function startTracking(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) return;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 10_000,
    distanceInterval: 0,
    deferredUpdatesInterval: 10_000,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Koursa : vous êtes en ligne',
      notificationBody: 'Votre position est partagée pour recevoir des courses.',
      notificationColor: '#00A86B',
      killServiceOnDestroy: false,
    },
  });
}

export async function stopTracking(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  await flushQueue();
}

export async function currentPosition(): Promise<{ lat: number; lng: number }> {
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: p.coords.latitude, lng: p.coords.longitude };
}
