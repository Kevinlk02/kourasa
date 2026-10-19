import * as ImagePicker from 'expo-image-picker';
import { getSupabase } from '@koursa/ui';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]!) << 18) | (B64.indexOf(clean[i + 1]!) << 12) |
      ((B64.indexOf(clean[i + 2] ?? 'A') & 63) << 6) | (B64.indexOf(clean[i + 3] ?? 'A') & 63);
    bytes[p++] = (n >> 16) & 255;
    if (clean[i + 2] !== undefined) bytes[p++] = (n >> 8) & 255;
    if (clean[i + 3] !== undefined) bytes[p++] = n & 255;
  }
  return bytes.buffer.slice(0, p);
}

/** Photo à l'appareil photo, compressée (images légères pour la 3G). */
export async function takePhoto(): Promise<{ uri: string; base64: string } | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Autorisez l\'appareil photo');
  const r = await ImagePicker.launchCameraAsync({ quality: 0.4, base64: true, exif: false, allowsEditing: false });
  const a = r.assets?.[0];
  if (r.canceled || !a?.base64) return null;
  return { uri: a.uri, base64: a.base64 };
}

/** Envoie dans Storage : <bucket>/<user_id>/<name>.jpg ; renvoie le chemin. */
export async function uploadPhoto(bucket: 'courier-docs' | 'courier-avatars' | 'parcel-photos', name: string, base64: string): Promise<string> {
  const sb = getSupabase();
  const uid = (await sb.auth.getUser()).data.user?.id;
  if (!uid) throw new Error('Session expirée');
  const path = `${uid}/${name}.jpg`;
  const { error } = await sb.storage.from(bucket).upload(path, base64ToArrayBuffer(base64), { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error('Envoi de la photo impossible. Réessayez.');
  return path;
}
