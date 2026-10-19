import type { NextConfig } from 'next';

const IMMUTABLE = 'public, max-age=31536000, immutable';

const config: NextConfig = {
  transpilePackages: ['@koursa/shared'],
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // Métadonnées (titre, description) toujours dans le <head>, même sur les pages dynamiques :
  // les aperçus WhatsApp / Facebook et les moteurs de recherche les lisent sans exécuter de JS.
  htmlLimitedBots: /.*/,
  async rewrites() {
    return {
      beforeFiles: [],
      // La PWA client (export web Expo copié dans public/app) est une application monopage :
      // toute URL /app/... qui n'est pas un fichier renvoie /app/index.html.
      // URL canonique : /app (sans barre finale) pour éviter une redirection en 3G.
      afterFiles: [
        { source: '/app', destination: '/app/index.html' },
        { source: '/app/:path*', destination: '/app/index.html' },
      ],
      fallback: [],
    };
  },
  async headers() {
    return [
      // Fichiers versionnés (nom avec empreinte) : cache navigateur d'un an.
      { source: '/app/_expo/:path*', headers: [{ key: 'Cache-Control', value: IMMUTABLE }] },
      { source: '/app/assets/:path*', headers: [{ key: 'Cache-Control', value: IMMUTABLE }] },
      { source: '/app/icons/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }] },
      // Coquille de la PWA et service worker : toujours revalidés pour recevoir les mises à jour.
      { source: '/app', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/app/index.html', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/app/manifest.webmanifest', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/app/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
      { source: '/(.*)', headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
      ] },
      { source: '/admin/:path*', headers: [{ key: 'X-Frame-Options', value: 'DENY' }, { key: 'X-Robots-Tag', value: 'noindex' }] },
      { source: '/t/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] },
    ];
  },
};

export default config;
