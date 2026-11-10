/**
 * Light or dark. "system" follows the phone or computer and changes with it; "light" and "dark"
 * stay put. The choice is remembered on this device. index.html applies it before the first
 * frame; this keeps it right afterwards and lets screens react (the phone's status bar).
 */
import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'
const KEY = 'dobry.theme'
const listeners = new Set<() => void>()
const media = typeof matchMedia === 'undefined' ? null : matchMedia('(prefers-color-scheme: dark)')

export function themeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export const isDark = () => (typeof document === 'undefined' ? false : document.documentElement.dataset.theme === 'dark')

function apply() {
  const choice = themeChoice()
  const dark = choice === 'dark' || (choice === 'system' && Boolean(media?.matches))
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d0b22' : '#ffffff')
  listeners.forEach((l) => l())
  void import('./native').then((m) => m.refreshStatusBar())
}

export function setThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    // Not remembered; still applied for this visit.
  }
  apply()
}

/** Keeps the theme following the system while the choice is "system". Run once at start. */
export function watchTheme() {
  apply()
  media?.addEventListener?.('change', () => themeChoice() === 'system' && apply())
}

/** Re-renders the caller when light or dark changes. */
export function useDark(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    isDark,
    () => false,
  )
}
