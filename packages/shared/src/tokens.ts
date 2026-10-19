/** Design tokens — CLAUDE.md « Design system ». Identité propre, pas celle d'Uber. */
export const colors = {
  background: '#FFFFFF',
  text: '#111111',
  muted: '#6B6B6B',
  border: '#EEEEEE',
  surface: '#F6F6F6',
  /** Accent provisoire : CTA principal et statut actif uniquement. */
  accent: '#00A86B',
  accentText: '#FFFFFF',
  danger: '#D93025',
  warning: '#E8A317',
  zone1: '#2F80ED',
  zone2: '#F2994A',
} as const;

export const radius = { sheet: 16, button: 12, input: 12, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const font = {
  title: 26,
  subtitle: 20,
  body: 16,
  caption: 13,
  family: 'Inter',
} as const;
export const sizes = { button: 56, input: 52 } as const;
