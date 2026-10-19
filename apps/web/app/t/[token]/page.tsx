import type { Metadata } from 'next';
import { Tracking } from './Tracking';

export const metadata: Metadata = {
  title: 'Suivi de votre colis',
  description: 'Suivez votre colis Koursa en direct : position du coursier, montant à payer et code de réception.',
  robots: { index: false },
};
export const dynamic = 'force-dynamic';

// Page publique pour le destinataire : aucune installation, le lien arrive par SMS.
export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Tracking token={token} />;
}
