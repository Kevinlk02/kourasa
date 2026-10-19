// Aide : désactiver l'économiseur de batterie (Tecno / Infinix / Itel tuent les apps en arrière-plan).
import { Linking, ScrollView, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import * as IntentLauncher from 'expo-intent-launcher';
import { colors, t } from '@koursa/shared';
import { Body, Button, Caption, Subtitle, Title } from '@koursa/ui';

const STEPS: { brand: string; steps: string[] }[] = [
  { brand: 'Tecno / Infinix / Itel (HiOS, XOS)', steps: [
    'Paramètres → Gestion de l\'alimentation (ou Batterie) → Optimisation de la batterie',
    'Cherchez « Koursa Coursier » → choisissez « Ne pas optimiser »',
    'Phone Master → Gestionnaire de démarrage → autorisez Koursa Coursier',
    'Dans les applications récentes, verrouillez Koursa (icône cadenas)',
  ] },
  { brand: 'Samsung', steps: [
    'Paramètres → Applications → Koursa Coursier → Batterie → « Non restreinte »',
    'Paramètres → Batterie → Limites d\'utilisation en arrière-plan : retirez Koursa des applis en veille',
  ] },
];

export default function Battery() {
  async function openSettings() {
    try {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
    } catch {
      Linking.openSettings();
    }
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, gap: 14, backgroundColor: colors.background }}>
      <Pressable onPress={() => router.back()}><Text style={{ color: colors.muted, fontSize: 16 }}>← {t('common.back')}</Text></Pressable>
      <Title>{t('courier.battery.title')}</Title>
      <Body>{t('courier.battery.body')}</Body>
      <Button title="Ouvrir les paramètres de batterie" onPress={openSettings} />
      {STEPS.map((b) => (
        <ScrollView key={b.brand} scrollEnabled={false} contentContainerStyle={{ gap: 6 }}>
          <Subtitle>{b.brand}</Subtitle>
          {b.steps.map((s, i) => <Body key={i}>{i + 1}. {s}</Body>)}
        </ScrollView>
      ))}
      <Caption>Sans ces réglages, vous pouvez cesser de recevoir des courses quand l'écran est éteint.</Caption>
      <Button title="Autorisations de l'application" variant="secondary" onPress={() => Linking.openSettings()} />
    </ScrollView>
  );
}
