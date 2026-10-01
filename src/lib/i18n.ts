import { useSyncExternalStore } from 'react'
import { ms } from './i18n.ms'

export type Lang = 'en' | 'ms'
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'ms', label: 'Bahasa Melayu' },
]

const KEY = 'attend.lang'

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'ms') return saved
  } catch {
    // Storage blocked: fall through to the browser's language.
  }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('ms') ? 'ms' : 'en'
}

let lang: Lang = initial()
const listeners = new Set<() => void>()

export const getLang = () => lang

export function setLang(next: Lang) {
  lang = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // Not remembered, but still applied for this visit.
  }
  document.documentElement.lang = next
  listeners.forEach((l) => l())
}

/** Re-renders the caller when the language changes. The app root uses it to refresh every screen. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getLang,
  )
}

/**
 * Translates UI text. The English sentence is the key, so untranslated text simply
 * stays English. `{name}` placeholders are filled from `vars`.
 */
export function t(text: string, vars?: Record<string, string | number>): string {
  const out = (lang === 'ms' && ms[text]) || text
  return vars ? out.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : out
}

/** Locale for dates and times. */
export const locale = () => (lang === 'ms' ? 'ms-MY' : 'en-GB')
