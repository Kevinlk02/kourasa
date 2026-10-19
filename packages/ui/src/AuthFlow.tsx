import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { t, toE164 } from '@koursa/shared';
import { Button } from './Button';
import { Input } from './Input';
import { PhoneInput } from './PhoneInput';
import { Body, Caption, Title } from './Text';
import { Screen } from './Bits';
import { getSupabase, rpcMessage } from './supabase';
import { useSession } from './session';

const E164 = /^\+\d{8,15}$/;

type Step = 'phone' | 'code' | 'name';
type Channel = 'whatsapp' | 'sms';

/**
 * Connexion par code à usage unique : numéro → code à 6 chiffres → nom (première fois).
 * Le code part d'abord par WhatsApp (Twilio) ; si WhatsApp échoue, il part automatiquement par SMS.
 */
export function AuthFlow({ appName, tagline }: { appName: string; tagline: string }) {
  const sb = getSupabase();
  const { session, profile, country, refreshProfile } = useSession();
  const [step, setStep] = useState<Step>(session && !profile?.full_name ? 'name' : 'phone');
  const [local, setLocal] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const dial = country?.dial_code ?? '+228';
  const phone = toE164(dial, local);

  async function sendCode(preferred: Channel = 'whatsapp') {
    setError(null);
    if (!E164.test(phone) || local.replace(/\D/g, '').length < 8) {
      setError('Numéro invalide');
      return;
    }
    setBusy(true);
    let used: Channel = preferred;
    let { error: e } = await sb.auth.signInWithOtp({ phone, options: { channel: preferred } });
    // WhatsApp indisponible (numéro sans WhatsApp, canal non configuré…) : secours SMS.
    // On ne bascule pas si c'est une limite de fréquence (le SMS serait refusé aussi).
    if (e && preferred === 'whatsapp' && !/rate|seconds|too many/i.test(e.message)) {
      used = 'sms';
      ({ error: e } = await sb.auth.signInWithOtp({ phone, options: { channel: 'sms' } }));
    }
    setBusy(false);
    if (e) {
      setError(rpcMessage(e));
      return;
    }
    setChannel(used);
    setCode('');
    setStep('code');
  }

  async function verify() {
    setError(null);
    setBusy(true);
    const { data, error: e } = await sb.auth.verifyOtp({ phone, token: code, type: 'sms' });
    if (e || !data.user) {
      setBusy(false);
      setError(t('auth.code.invalid'));
      return;
    }
    const { data: p } = await sb.from('profiles').select('full_name').eq('id', data.user.id).maybeSingle();
    setBusy(false);
    if (!p?.full_name) setStep('name');
    else await refreshProfile();
  }

  async function saveName() {
    if (name.trim().length < 2) {
      setError('Indiquez votre nom');
      return;
    }
    setBusy(true);
    const uid = (await sb.auth.getUser()).data.user?.id;
    const { error: e } = await sb.from('profiles').update({ full_name: name.trim() }).eq('id', uid ?? '');
    setBusy(false);
    if (e) setError(rpcMessage(e));
    else await refreshProfile();
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, justifyContent: 'center', gap: 20 }}>
          <View style={{ gap: 6 }}>
            <Caption style={{ fontWeight: '700', letterSpacing: 1 }}>{appName.toUpperCase()}</Caption>
            {step === 'phone' && <Title>{t('auth.phone.title')}</Title>}
            {step === 'code' && <Title>{t('auth.code.title')}</Title>}
            {step === 'name' && <Title>{t('auth.name.title')}</Title>}
            {step === 'phone' && <Body style={{ color: '#6B6B6B' }}>{tagline} {t('auth.phone.subtitle')}</Body>}
            {step === 'code' && (
              <Body style={{ color: '#6B6B6B' }}>
                {t(channel === 'whatsapp' ? 'auth.code.subtitleWhatsapp' : 'auth.code.subtitle', { phone })}
              </Body>
            )}
          </View>

          {step === 'phone' && (
            <PhoneInput dialCode={dial} value={local} onChangeText={setLocal} placeholder={t('auth.phone.placeholder')} autoFocus error={error} />
          )}
          {step === 'code' && (
            <Input value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad"
              autoComplete="sms-otp" textContentType="oneTimeCode" placeholder="••••••" maxLength={6} autoFocus
              style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }} error={error} />
          )}
          {step === 'name' && (
            <Input value={name} onChangeText={setName} placeholder={t('auth.name.placeholder')} autoFocus autoComplete="name" error={error} />
          )}
        </View>

        <View style={{ gap: 8 }}>
          {step === 'phone' && <Button title={t('common.continue')} onPress={() => sendCode('whatsapp')} loading={busy} />}
          {step === 'code' && (
            <>
              <Button title={t('common.confirm')} onPress={verify} loading={busy} disabled={code.length !== 6} />
              {channel === 'whatsapp' ? (
                <Button title={t('auth.code.bySms')} variant="secondary" onPress={() => sendCode('sms')} disabled={busy} />
              ) : null}
              <Button title={t('auth.code.resend')} variant="ghost" onPress={() => { setCode(''); setStep('phone'); }} />
            </>
          )}
          {step === 'name' && <Button title={t('common.continue')} onPress={saveName} loading={busy} />}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
