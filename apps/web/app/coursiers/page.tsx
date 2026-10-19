import type { Metadata } from 'next';
import { Page } from '@/components/Site';
import { latestVersions } from '@/lib/supabase';

export const metadata: Metadata = {
  title: 'Devenir coursier',
  description: 'Devenez coursier Koursa à Lomé : recevez les courses de votre zone, gardez 82 % du prix et des frais d’attente. Conditions et documents à préparer.',
  alternates: { canonical: '/coursiers' },
};
export const revalidate = 300;

export default async function Coursiers() {
  const v = (await latestVersions()).find((x) => x.app === 'courier' && x.platform === 'android');
  return (
    <Page>
      <section className="mx-auto max-w-2xl space-y-6 py-10">
        <h1 className="text-3xl font-extrabold">Devenir coursier Koursa</h1>
        <p className="text-lg text-muted">
          Recevez des courses dans votre zone de Lomé, gardez 82 % du prix de chaque course et des frais d’attente.
          Une incitation est versée quand vous allez chercher un colis à plus de 2 km.
        </p>
        <div className="card space-y-2">
          <h2 className="text-xl font-bold">Conditions</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Une moto en bon état, avec sa plaque</li>
            <li>Un permis de conduire valide</li>
            <li>Un téléphone <b>Android</b> avec Internet (l’application coursier n’existe pas sur iPhone)</li>
          </ul>
        </div>
        <div className="card space-y-2">
          <h2 className="text-xl font-bold">Documents à préparer (photos)</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Votre photo (visage bien visible)</li>
            <li>Votre pièce d’identité</li>
            <li>La moto avec la plaque lisible</li>
            <li>Votre permis de conduire</li>
          </ul>
          <p className="text-sm text-muted">L’équipe valide votre dossier et vous attribue votre zone d’attache.</p>
        </div>
        <div className="card space-y-2">
          <h2 className="text-xl font-bold">Comment ça marche pour l’argent</h2>
          <p>Vous encaissez en espèces le montant affiché par l’application. La commission Koursa (18 %) s’ajoute à votre solde,
            à rembourser par mobile money. Au-delà de 5 000 F de commission due, le compte est mis en pause jusqu’au remboursement.</p>
        </div>
        <a href="/telecharger/koursa-coursier.apk" className="btn-primary w-full">Télécharger l’application coursier (Android)</a>
        {v ? <p className="text-center text-sm text-muted">Version {v.latest_version}{v.sha256 ? ` · SHA-256 ${v.sha256.slice(0, 16)}…` : ''}</p> : null}
      </section>
    </Page>
  );
}
