import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const pages: [string, number][] = [['/', 1], ['/telecharger', 0.9], ['/coursiers', 0.8], ['/mentions-legales', 0.2], ['/confidentialite', 0.2]];
  return pages.map(([p, priority]) => ({ url: `${site}${p}`, changeFrequency: 'weekly', priority }));
}
