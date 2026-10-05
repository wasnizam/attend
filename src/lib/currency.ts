import { useSyncExternalStore } from 'react'

/** Prices are shown in ringgit to visitors in Malaysia and in US dollars everywhere else. */
export type Currency = 'myr' | 'usd'

const KEY = 'attend.currency'
const MALAYSIA = ['Asia/Kuala_Lumpur', 'Asia/Kuching']

/**
 * Whether the device is set to Malaysian time: free, instant, and good enough for choosing
 * what to show. Visitors elsewhere see US dollars and English only, with no switch for either.
 */
export function inMalaysia(): boolean {
  try {
    return MALAYSIA.includes(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return false
  }
}

function guess(): Currency {
  return inMalaysia() ? 'myr' : 'usd'
}

function initial(): Currency {
  // Outside Malaysia there is no switch, so an old saved choice must not leave someone on ringgit.
  if (!inMalaysia()) return 'usd'
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === 'myr' || stored === 'usd') return stored
  } catch {
    // Private mode: fall back to the guess.
  }
  return guess()
}

let currency = initial()
const listeners = new Set<() => void>()

export const getCurrency = () => currency

/** The visitor's own choice wins over the guess, and is remembered. */
export function setCurrency(next: Currency) {
  currency = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // ignore
  }
  listeners.forEach((l) => l())
}

export const useCurrency = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getCurrency,
  )
