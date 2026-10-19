import Link from 'next/link';
import { computePrice, DEFAULT_PRICING, formatMoney } from '@koursa/shared';
import { Page } from '@/components/Site';

export const revalidate = 3600;

// Prix d'exemple calculés avec la même formule que le serveur (paramètres de lancement).
const EXAMPLES = [
  { label: '3 km', distance_m: 3000, duration_s: 9 * 60 },
  { label: '6 km', distance_m: 6000, duration_s: 18 * 60 },
  { label: '10 km', distance_m: 10000, duration_s: 28 * 60 },
].map((e) => ({ ...e, price: computePrice(DEFAULT_PRICING, { ...e, size: 'small' }).price }));

export default function Home() {
  return (
    <Page>
      <section className="grid items-center gap-10 py-10 sm:grid-cols-2 sm:py-16">
        <div className="space-y-6">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Votre colis livré à moto, partout dans Lomé.
          </h1>
          <p className="text-lg text-muted">
            Documents, colis, petits achats, retraits au restaurant. Le prix s’affiche avant de commander,
            vous suivez le coursier en direct, le destinataire reçoit un code de réception.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/telecharger" className="btn-primary">Télécharger l’application</Link>
            <a href="/app" className="btn-secondary">Utiliser dans le navigateur</a>
          </div>
          <p className="text-sm text-muted">Android : application à installer depuis notre site · iPhone : ajoutez Koursa à l’écran d’accueil.</p>
        </div>
        <div className="card space-y-4 bg-surface">
          <p className="label">PRIX D’EXEMPLE (PETIT COLIS)</p>
          {EXAMPLES.map((e) => (
            <div key={e.label} className="flex items-center justify-between rounded-xl bg-white px-4 py-3">
              <span className="font-medium">{e.label}</span>
              <span className="text-xl font-bold">{formatMoney(e.price, 'XOF')}</span>
            </div>
          ))}
          <p className="text-sm text-muted">5 min d’attente offertes, puis 50 F/min. Le prix affiché est le prix payé.</p>
        </div>
      </section>

      <section className="py-8" aria-labelledby="how">
        <h2 id="how" className="mb-4 text-2xl font-bold">Comment ça marche</h2>
        <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['1. Indiquez les deux adresses', 'Position, lieux récents, recherche ou épingle sur la carte — et un repère pour trouver la porte.'],
          ['2. Un coursier de votre zone accepte', 'Les coursiers les plus proches reçoivent la course en premier.'],
          ['3. Suivez et c’est livré', 'Position du coursier en direct. Le destinataire donne son code à 4 chiffres.'],
        ].map(([title, body]) => (
          <div key={title} className="card">
            <h3 className="text-lg font-bold">{title}</h3>
            <p className="mt-2 text-muted">{body}</p>
          </div>
        ))}
        </div>
      </section>

      <section className="py-8">
        <h2 className="text-2xl font-bold">Zones desservies à Lomé</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="card border-l-4 border-l-zone1">
            <h3 className="font-bold">Lomé Sud &amp; Est</h3>
            <p className="text-muted">Centre-ville, Bè, Baguida, Akodésséwa, Léo 2000…</p>
          </div>
          <div className="card border-l-4 border-l-zone2">
            <h3 className="font-bold">Lomé Nord &amp; Ouest</h3>
            <p className="text-muted">Agoè-Zanguéra, Adidogomé, Djidjolé…</p>
          </div>
        </div>
      </section>
    </Page>
  );
}
