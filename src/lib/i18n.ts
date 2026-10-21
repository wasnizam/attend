import { useSyncExternalStore } from 'react'
import { cs } from './i18n.cs'
import { ms } from './i18n.ms'
import { applyTerms } from './purpose'

export type Lang = 'en' | 'ms' | 'cs'
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'ms', label: 'Bahasa Melayu' },
  { id: 'cs', label: 'Čeština' },
]

/**
 * Czech covers the public website only: the homepage, the three edition pages and the legal pages.
 * Everywhere else (the app, sign-in, check-in, the Console) a Czech reader sees English.
 */
const PUBLIC = /^\/(lecturers|trainers|workplace|terms|privacy)?\/?$/
const czechHere = () => typeof location === 'undefined' || PUBLIC.test(location.pathname)

const KEY = 'attend.lang'

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'ms' || saved === 'cs') return saved
  } catch {
    // Storage blocked: fall through to the browser's language.
  }
  const browser = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : ''
  return browser.startsWith('ms') ? 'ms' : browser.startsWith('cs') ? 'cs' : 'en'
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
    getLang,
  )
}

/**
 * Translates UI text. The English sentence is the key, so untranslated text simply
 * stays English. `{name}` placeholders are filled from `vars`.
 */
export function t(text: string, vars?: Record<string, string | number>, keepShifts = false): string {
  // Translate, then switch to the organisation's vocabulary (participants, attendees…)
  // before filling in names, so nobody's name is ever rewritten.
  const czech = lang === 'cs' && czechHere() ? cs[text] : undefined
  const out = czech ?? applyTerms((lang === 'ms' && ms[text]) || text, lang === 'ms' ? 'ms' : 'en', keepShifts)
  return vars ? out.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : out
}

/** Locale for dates and times. */
export const locale = () => (lang === 'ms' ? 'ms-MY' : lang === 'cs' && czechHere() ? 'cs-CZ' : 'en-GB')
