import 'react-native-url-polyfill/auto';
// Déclare la tâche de localisation en arrière-plan dès le chargement du bundle.
import '../src/tracking';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthFlow, Loading, SessionProvider, UpdateGate, registerPush, useSession } from '@koursa/ui';
import { flushQueue } from '../src/tracking';

function Gate() {
  const { session, profile, loading } = useSession();
  useEffect(() => {
    if (!session) return;
    registerPush('courier');
    // Au retour au premier plan / du réseau : vider la file des positions.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && flushQueue());
    return () => sub.remove();
  }, [session]);

  if (loading) return <Loading />;
  if (!session || !profile?.full_name) return <AuthFlow appName="Koursa Coursier" tagline="Recevez des courses dans votre zone." />;
  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SessionProvider>
        <UpdateGate app="courier">
          <Gate />
        </UpdateGate>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
