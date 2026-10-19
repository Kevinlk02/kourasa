/** Comparaison de versions « 1.2.10 » > « 1.2.9 ». */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export type UpdateState = 'ok' | 'available' | 'required';

export function updateState(current: string, v: { latest_version: string; min_version: string }): UpdateState {
  if (compareVersions(current, v.min_version) < 0) return 'required';
  if (compareVersions(current, v.latest_version) < 0) return 'available';
  return 'ok';
}

/** Lien de navigation Google Maps deux-roues (pas d'API facturée). */
export function navigationUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=two-wheeler`;
}

/** Normalise un numéro local en E.164 avec l'indicatif du pays. */
export function toE164(dialCode: string, local: string): string {
  const digits = local.replace(/\D/g, '');
  const dial = dialCode.replace(/\D/g, '');
  if (digits.startsWith(dial) && digits.length > dial.length + 6) return `+${digits}`;
  return `+${dial}${digits.replace(/^0+/, '')}`;
}
