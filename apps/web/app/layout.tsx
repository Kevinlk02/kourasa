import type { Metadata, Viewport } from 'next';
import './globals.css';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const DESCRIPTION = 'Envoyez un colis à Lomé avec un coursier à moto. Prix connu avant de commander, suivi en temps réel, code de réception pour le destinataire.';

export const metadata: Metadata = {
  title: { default: 'Koursa — livraison à moto à Lomé', template: '%s · Koursa' },
  description: DESCRIPTION,
  metadataBase: new URL(SITE),
  applicationName: 'Koursa',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: 'Koursa',
    title: 'Koursa — livraison à moto à Lomé',
    description: DESCRIPTION,
    images: [{ url: '/icon-192.png', width: 192, height: 192, alt: 'Koursa' }],
  },
  twitter: { card: 'summary', title: 'Koursa — livraison à moto à Lomé', description: DESCRIPTION },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: '#FFFFFF', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
