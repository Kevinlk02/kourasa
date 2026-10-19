import 'react-native-url-polyfill/auto';
import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthFlow, Loading, SessionProvider, UpdateGate, onNotificationTap, registerPush, useSession } from '@koursa/ui';

function Gate() {
  const { session, profile, loading } = useSession();

  useEffect(() => {
    if (!session) return;
    registerPush('client');
    return onNotificationTap((data) => {
      if (typeof data.delivery_id === 'string') router.push(`/delivery/${data.delivery_id}`);
    });
  }, [session]);

  if (loading) return <Loading />;
  if (!session || !profile?.full_name) {
    return <AuthFlow appName="Koursa" tagline="Envoyez un colis en quelques secondes." />;
  }
  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SessionProvider>
        <UpdateGate app="client">
          <Gate />
        </UpdateGate>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
