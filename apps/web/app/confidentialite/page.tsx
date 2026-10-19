import type { Metadata } from 'next';
import { Page } from '@/components/Site';

export const metadata: Metadata = { title: 'Politique de confidentialité' };

export default function Confidentialite() {
  return (
    <Page>
      <article className="mx-auto max-w-2xl space-y-4 py-10 text-[15px] leading-relaxed">
        <h1 className="text-3xl font-extrabold">Politique de confidentialité</h1>
        <p>Cette politique explique quelles données Koursa collecte, pourquoi, et combien de temps elles sont gardées.</p>
        <h2 className="pt-2 text-xl font-bold">Données collectées</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Numéro de téléphone et nom</b> : connexion par code SMS et identification.</li>
          <li><b>Adresses, repères et positions des points de récupération et de livraison</b> : réalisation de la course, calcul du prix.</li>
          <li><b>Nom et téléphone du destinataire</b> : envoi du code de réception et du lien de suivi par SMS.</li>
          <li><b>Coursiers : position GPS</b> pendant qu’ils sont en ligne (toutes les ~10 s, y compris écran éteint), photo, pièce d’identité, permis, photo de la moto et plaque.</li>
          <li><b>Historique des courses, notes et montants</b> : facturation, commissions, litiges.</li>
        </ul>
        <h2 className="pt-2 text-xl font-bold">Utilisation</h2>
        <p>Ces données servent uniquement au fonctionnement du service (attribution des courses, suivi, paiement, sécurité, statistiques internes). Elles ne sont pas vendues. Les adresses sont recherchées via Google Maps Platform.</p>
        <h2 className="pt-2 text-xl font-bold">Conservation</h2>
        <p>Positions de suivi : 30 jours. Courses et opérations financières : durée légale de conservation comptable. Documents des coursiers : durée de la collaboration, puis suppression.</p>
        <h2 className="pt-2 text-xl font-bold">Vos droits</h2>
        <p>Vous pouvez demander l’accès, la correction ou la suppression de vos données en écrivant à [e-mail de contact]. Le Togo encadre la protection des données personnelles (loi n° 2019-014) ; ce document doit être vérifié par un juriste avant le lancement.</p>
      </article>
    </Page>
  );
}
