import texts from './texts.json';

export { texts };

/** Replaces `{name}` markers in a template; unknown markers are left as they are. */
export const fill = (template: string, vars: Readonly<Record<string, string | number>>): string =>
  template.replace(/\{(\w+)\}/g, (marker, key: string) => String(vars[key] ?? marker));

export const pickText = (list: readonly string[]): string => list[Math.floor(Math.random() * list.length)] ?? '';
