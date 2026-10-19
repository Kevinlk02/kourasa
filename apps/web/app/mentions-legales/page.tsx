import type { Metadata } from 'next';
import { Page } from '@/components/Site';

export const metadata: Metadata = { title: 'Mentions légales' };

// À COMPLÉTER avant l'ouverture : informations de la société enregistrée au Togo (et au Tchad).
export default function MentionsLegales() {
  return (
    <Page>
      <article className="prose mx-auto max-w-2xl space-y-4 py-10">
        <h1 className="text-3xl font-extrabold">Mentions légales</h1>
        <p><b>Éditeur :</b> [Raison sociale], [forme juridique], au capital de [montant] F CFA, immatriculée au RCCM de Lomé sous le n° [numéro], siège : [adresse], Lomé, Togo.</p>
        <p><b>Responsable de la publication :</b> [Nom, fonction].</p>
        <p><b>Contact :</b> [téléphone] · [e-mail].</p>
        <p><b>Hébergement :</b> site hébergé par [hébergeur, adresse] ; données hébergées par Supabase ([région]).</p>
        <p><b>Service :</b> Koursa met en relation des expéditeurs avec des coursiers à moto indépendants pour la livraison de colis en ville. Le prix d’une course est affiché avant la commande et ne change pas, hors frais d’attente annoncés.</p>
        <p className="text-sm text-muted">Document à faire relire par un juriste avant le lancement.</p>
      </article>
    </Page>
  );
}
