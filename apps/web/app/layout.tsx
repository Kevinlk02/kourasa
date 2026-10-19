import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Koursa — livraison à moto à Lomé', template: '%s · Koursa' },
  description: 'Envoyez un colis en ville avec un coursier à moto. Prix connu avant de commander, suivi en temps réel.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
};

export const viewport: Viewport = { themeColor: '#FFFFFF', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
