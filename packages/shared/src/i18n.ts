import fr from './i18n/fr.json';

export type MessageKey = keyof typeof fr;
const dictionaries: Record<string, Record<string, string>> = { fr };
let locale = 'fr';

export function setLocale(next: string): void {
  if (dictionaries[next]) locale = next;
}

/** t('create.waitingLine', { grace: 5, fee: 50 }) */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const template = dictionaries[locale]?.[key] ?? fr[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}
