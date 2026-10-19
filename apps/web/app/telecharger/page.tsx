import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Page } from '@/components/Site';
import { latestVersions } from '@/lib/supabase';
import { DownloadChooser } from './DownloadChooser';

export const metadata: Metadata = {
  title: 'Télécharger',
  description: 'Installez Koursa : application Android à télécharger depuis notre site, ou application web sur iPhone (ajout à l’écran d’accueil).',
  alternates: { canonical: '/telecharger' },
};
// Détection du téléphone côté serveur : le bon bouton s'affiche dès le premier rendu (pas de saut de mise en page).
function deviceFromUa(ua: string): 'android' | 'iphone' | 'desktop' {
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iphone';
  return 'desktop';
}

export default async function Telecharger() {
  const device = deviceFromUa((await headers()).get('user-agent') ?? '');
  const versions = await latestVersions();
  const client = versions.find((v) => v.app === 'client' && v.platform === 'android') ?? null;
  return (
    <Page>
      <section className="mx-auto max-w-2xl space-y-6 py-10">
        <h1 className="text-3xl font-extrabold">Télécharger Koursa</h1>
        <DownloadChooser
          initialDevice={device}
          apkPath="/telecharger/koursa.apk"
          version={client?.latest_version ?? null}
          publishedAt={client?.published_at ?? null}
          sizeBytes={client?.size_bytes ?? null}
          sha256={client?.sha256 ?? null}
          siteUrl={process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}
        />

        <div className="card space-y-3">
          <h2 className="text-xl font-bold">Installer sur Android (3 étapes)</h2>
          <ol className="list-decimal space-y-2 pl-5 text-[15px]">
            <li>Touchez <b>« Télécharger pour Android »</b>.</li>
            <li>Si Android le demande, <b>autorisez votre navigateur à installer des applications inconnues</b> (une seule fois).</li>
            <li>Ouvrez le fichier téléchargé et touchez <b>« Installer »</b>. Si Play Protect affiche « application inconnue », touchez <b>« Installer quand même »</b>.</li>
          </ol>
          <p className="text-sm text-muted">
            L’application est signée avec toujours la même clé. Vérifiez que l’empreinte SHA-256 ci-dessus correspond au fichier téléchargé.
          </p>
        </div>

        <div className="card space-y-3">
          <h2 className="text-xl font-bold">Sur iPhone</h2>
          <ol className="list-decimal space-y-2 pl-5 text-[15px]">
            <li>Ouvrez <b>koursa</b> dans <b>Safari</b> (bouton « Ouvrir l’application web »).</li>
            <li>Touchez <b>Partager</b> <span aria-hidden>⬆️</span> en bas de l’écran.</li>
            <li>Choisissez <b>« Sur l’écran d’accueil »</b>, puis <b>Ajouter</b>. L’icône Koursa s’ouvre comme une application.</li>
          </ol>
          <p className="text-sm text-muted">Notifications sur iPhone : iOS 16.4 ou plus récent, après l’ajout à l’écran d’accueil.</p>
        </div>
      </section>
    </Page>
  );
}
