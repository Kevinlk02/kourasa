// Inscription coursier : nom, photo, pièce d'identité, moto + plaque, permis → « en attente de validation ».
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, t } from '@koursa/shared';
import { courierSignupSchema } from '@koursa/shared/schemas';
import { Body, Button, Caption, Input, Title, getSupabase, rpcMessage, useSession } from '@koursa/ui';
import { takePhoto, uploadPhoto } from '../src/upload';

type DocKey = 'photo' | 'id' | 'vehicle' | 'license';
const DOCS: { key: DocKey; label: string; bucket: 'courier-avatars' | 'courier-docs' }[] = [
  { key: 'photo', label: t('courier.signup.photo'), bucket: 'courier-avatars' },
  { key: 'id', label: t('courier.signup.id'), bucket: 'courier-docs' },
  { key: 'vehicle', label: t('courier.signup.vehicle'), bucket: 'courier-docs' },
  { key: 'license', label: t('courier.signup.license'), bucket: 'courier-docs' },
];

export default function Signup() {
  const { profile, signOut } = useSession();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [model, setModel] = useState('');
  const [plate, setPlate] = useState('');
  const [files, setFiles] = useState<Partial<Record<DocKey, { uri: string; path: string }>>>({});
  const [uploading, setUploading] = useState<DocKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function shoot(doc: (typeof DOCS)[number]) {
    setError(null);
    try {
      const ph = await takePhoto();
      if (!ph) return;
      setUploading(doc.key);
      const path = await uploadPhoto(doc.bucket, doc.key, ph.base64);
      setFiles((f) => ({ ...f, [doc.key]: { uri: ph.uri, path } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(null);
    }
  }

  async function submit() {
    const parsed = courierSignupSchema.safeParse({
      full_name: name, vehicle_model: model, plate,
      photo_path: files.photo?.path ?? '', id_document_path: files.id?.path ?? '',
      vehicle_photo_path: files.vehicle?.path ?? '', license_path: files.license?.path ?? '',
    });
    if (!parsed.success) {
      setError('Complétez tous les champs et les 4 photos.');
      return;
    }
    setBusy(true);
    const v = parsed.data;
    const { error: e } = await getSupabase().rpc('courier_apply', {
      p_full_name: v.full_name, p_vehicle_model: v.vehicle_model, p_plate: v.plate,
      p_photo_path: v.photo_path, p_id_document_path: v.id_document_path,
      p_vehicle_photo_path: v.vehicle_photo_path, p_license_path: v.license_path,
    });
    setBusy(false);
    if (e) setError(rpcMessage(e));
    else router.replace('/');
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, gap: 14, backgroundColor: colors.background }} keyboardShouldPersistTaps="handled">
      <Title>{t('courier.signup.title')}</Title>
      <Body style={{ color: colors.muted }}>Vos documents sont vérifiés par l'équipe avant votre première course.</Body>
      <Input label={t('auth.name.placeholder')} value={name} onChangeText={setName} autoComplete="name" />
      <Input label={t('courier.signup.model')} value={model} onChangeText={setModel} placeholder="Haojue 125" />
      <Input label={t('courier.signup.plate')} value={plate} onChangeText={(v) => setPlate(v.toUpperCase())} autoCapitalize="characters" placeholder="TG-1234-AB" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {DOCS.map((doc) => (
          <Pressable key={doc.key} onPress={() => shoot(doc)}
            style={{ width: '48%', aspectRatio: 1.3, borderRadius: 12, backgroundColor: colors.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            {files[doc.key] ? (
              <Image source={{ uri: files[doc.key]!.uri }} style={{ position: 'absolute', width: '100%', height: '100%' }} />
            ) : null}
            <View style={{ backgroundColor: 'rgba(255,255,255,0.85)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
              <Text style={{ fontWeight: '600', textAlign: 'center' }}>{uploading === doc.key ? 'Envoi…' : files[doc.key] ? `✓ ${doc.label}` : `📷 ${doc.label}`}</Text>
            </View>
          </Pressable>
        ))}
      </View>
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      <Button title={t('courier.signup.submit')} onPress={submit} loading={busy} disabled={!!uploading} />
      <Caption>Android uniquement. Gardez votre téléphone chargé et la localisation activée pendant le travail.</Caption>
      <Button title={t('auth.logout')} variant="ghost" onPress={signOut} />
    </ScrollView>
  );
}
