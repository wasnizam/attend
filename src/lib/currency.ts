import { useSyncExternalStore } from 'react'

/** Prices are shown in ringgit to visitors in Malaysia and in US dollars everywhere else. */
export type Currency = 'myr' | 'usd'

const KEY = 'attend.currency'
const MALAYSIA = ['Asia/Kuala_Lumpur', 'Asia/Kuching']

/** A guess from the device's time zone: free, instant, and good enough for showing a price. */
function guess(): Currency {
  try {
    return MALAYSIA.includes(Intl.DateTimeFormat().resolvedOptions().timeZone) ? 'myr' : 'usd'
  } catch {
    return 'myr'
  }
}

function initial(): Currency {
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
