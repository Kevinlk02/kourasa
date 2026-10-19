import { useEffect, useState, type ReactNode } from 'react';
import { Linking, Platform, View } from 'react-native';
import Constants from 'expo-constants';
import { t, updateState, type AppVersion, type UpdateState } from '@koursa/shared';
import { getSupabase } from './supabase';
import { Banner, Screen } from './Bits';
import { Button } from './Button';
import { Body, Title } from './Text';

/**
 * Au démarrage : version < min_version → écran bloquant ; < latest_version → bandeau discret.
 * Le bouton ouvre l'URL de l'APK dans le navigateur (DISTRIBUTION.md).
 */
export function UpdateGate({ app, children }: { app: 'client' | 'courier'; children: ReactNode }) {
  const [state, setState] = useState<UpdateState>('ok');
  const [version, setVersion] = useState<AppVersion | null>(null);
  const current = Constants.expoConfig?.version ?? '0.0.0';
  const platform = Platform.OS === 'web' ? 'web' : 'android';

  useEffect(() => {
    getSupabase().from('app_versions_latest').select('*').eq('app', app).eq('platform', platform).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setVersion(data as AppVersion);
        setState(updateState(current, data as AppVersion));
      });
  }, [app, platform, current]);

  const open = () => {
    if (Platform.OS === 'web') {
      window.location.reload();
      return;
    }
    const site = process.env.EXPO_PUBLIC_SITE_URL ?? '';
    const url = version?.apk_url?.startsWith('http') ? version.apk_url : `${site}${version?.apk_url ?? '/telecharger'}`;
    Linking.openURL(url);
  };

  if (state === 'required') {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
          <Title>{t('update.required.title')}</Title>
          <Body>{t('update.required.body')}</Body>
          {version?.changelog ? <Body style={{ color: '#6B6B6B' }}>{version.changelog}</Body> : null}
        </View>
        <Button title={t('update.download')} onPress={open} />
      </Screen>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      {children}
      {state === 'available' ? (
        <View style={{ position: 'absolute', top: 48, left: 16, right: 16 }}>
          <Banner text={`${t('update.available')} — ${t('update.download')}`} tone="info" onPress={open} />
        </View>
      ) : null}
    </View>
  );
}
