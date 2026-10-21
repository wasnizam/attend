import { getLang } from './i18n'

/**
 * The made-up people in the website's demos, in names that fit the reader: Malaysian names in
 * Bahasa Melayu, English names in English, Czech names in Czech. The demos are written with the
 * Malaysian-English names below; anything not listed shows as written.
 */
const NAMES: Record<string, { ms: string; en: string; cs: string }> = {
  'Ahmad Ali': { ms: 'Ahmad Ali', en: 'James Carter', cs: 'Jan Novák' },
  'Sarah Lee': { ms: 'Nurul Aina', en: 'Sarah Lee', cs: 'Tereza Svobodová' },
  'Kumar Raj': { ms: 'Kumar Raj', en: 'Michael Brown', cs: 'Petr Dvořák' },
  'Mei Ling': { ms: 'Tan Mei Ling', en: 'Emily Chen', cs: 'Eliška Černá' },
  'Daniel Cruz': { ms: 'Haziq Zulkifli', en: 'Daniel Cruz', cs: 'Tomáš Procházka' },
  'Aisha Bello': { ms: 'Siti Aminah', en: 'Olivia Smith', cs: 'Lucie Kučerová' },
  'Ravi Shah': { ms: 'Ravi Shankar', en: 'Ryan Patel', cs: 'Martin Veselý' },
  'Grace Kim': { ms: 'Lee Wei Jie', en: 'Grace Kim', cs: 'Kateřina Horáková' },
  'Omar Haddad': { ms: 'Farah Idris', en: 'Noah Wilson', cs: 'Jakub Němec' },
  'Lucas Silva': { ms: 'Daniel Lim', en: 'Lucas Silva', cs: 'Ondřej Marek' },
  'Nadia Rahman': { ms: 'Nadia Rahman', en: 'Sophie Turner', cs: 'Anna Pokorná' },
}

export function person(name: string): string {
  const n = NAMES[name]
  if (!n) return name
  const lang = getLang()
  return lang === 'ms' ? n.ms : lang === 'cs' ? n.cs : n.en
}
