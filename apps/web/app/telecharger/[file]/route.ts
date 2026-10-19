// URL stable : /telecharger/koursa.apk et /telecharger/koursa-coursier.apk
// redirigent vers la dernière version publiée (bucket Supabase Storage `downloads`).
import { NextResponse } from 'next/server';
import { latestVersions } from '@/lib/supabase';

export const revalidate = 60;

const FILES: Record<string, 'client' | 'courier'> = {
  'koursa.apk': 'client',
  'koursa-coursier.apk': 'courier',
};

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const app = FILES[file];
  if (!app) return new NextResponse('Introuvable', { status: 404 });
  const v = (await latestVersions()).find((x) => x.app === app && x.platform === 'android');
  const url = v?.apk_url;
  // Les valeurs du seed pointent vers cette même route : on évite la boucle.
  if (!url || url.startsWith('/telecharger')) {
    return new NextResponse('Aucun APK publié pour le moment. Revenez bientôt.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  return NextResponse.redirect(url, 302);
}
