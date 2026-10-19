import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@koursa/shared'],
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return {
      beforeFiles: [],
      // La PWA client (export web Expo copié dans public/app) est une application monopage :
      // toute URL /app/... qui n'est pas un fichier renvoie /app/index.html.
      afterFiles: [
        { source: '/app', destination: '/app/index.html' },
        { source: '/app/:path*', destination: '/app/index.html' },
      ],
      fallback: [],
    };
  },
  async headers() {
    return [
      { source: '/app/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/app/' }] },
      { source: '/(.*)', headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
      ] },
      { source: '/admin/:path*', headers: [{ key: 'X-Frame-Options', value: 'DENY' }, { key: 'X-Robots-Tag', value: 'noindex' }] },
    ];
  },
};

export default config;
