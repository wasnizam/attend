import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { type Edition, type EditionId, EDITIONS, type PlanCard } from './editions'
import { db } from './firebase'

/**
 * The price list, managed in the back office (platformConfig/pricing) and shown on the website and
 * in each customer's Account page. Until it is saved there, the prices written in editions.ts apply.
 */
export type Cycle = 'free' | 'month' | 'semester' | 'year'

export interface CatalogPlan {
  id: string
  name: string
  priceMyr: number
  priceUsd: number
  cycle: Cycle
  /** Workplace: the most staff this plan covers (0 = no limit). */
  seats?: number
  /** A line under the price, e.g. "Or RM390 a year". */
  noteMyr?: string
  noteUsd?: string
  items: string[]
  best?: boolean
  /** Kept in the list but not shown on the website. */
  hidden?: boolean
}

export type Catalog = Record<EditionId, CatalogPlan[]>

/**
 * What a new account starts on while payment is not open, per edition: the free plan (with its
 * limits, e.g. 5 staff for a workplace) or early access (no limits). Saved with the price list.
 */
export type StartPlan = 'free' | 'early'
export type Launch = Record<EditionId, StartPlan>
export const DEFAULT_LAUNCH: Launch = { lecturers: 'early', trainers: 'early', workplace: 'free' }
export const editionKey = (purpose: string | undefined): EditionId => (purpose === 'workplace' ? 'workplace' : purpose === 'training' ? 'trainers' : 'lecturers')

export const CYCLE_LABEL: Record<Cycle, string> = { free: 'Free forever', month: 'a month', semester: 'per semester', year: 'a year' }

const number = (s: string) => Number(s.replace(/[^0-9.]/g, '')) || 0
const cycleOf = (per: string): Cycle => (/free/i.test(per) ? 'free' : /semester/i.test(per) ? 'semester' : /year/i.test(per) ? 'year' : 'month')

/** Today's prices from the code, as a catalog: the starting point before anything is saved. */
export function defaultCatalog(): Catalog {
  return Object.fromEntries(
    EDITIONS.map((e) => [
      e.id,
      e.plans.map((p, i) => ({
        id: `${e.id}-${i}`,
        name: p.name,
        priceMyr: number(p.price.myr),
        priceUsd: number(p.price.usd),
        cycle: cycleOf(p.per),
        seats: e.id === 'workplace' ? number(p.items.find((x) => /staff/i.test(x)) ?? '') : undefined,
        noteMyr: typeof p.alt === 'string' ? p.alt : p.alt?.myr,
        noteUsd: typeof p.alt === 'string' ? p.alt : p.alt?.usd,
        items: p.items,
        best: p.best,
      })),
    ]),
  ) as Catalog
}

const money = (n: number, cur: 'myr' | 'usd') => (cur === 'myr' ? `RM${n % 1 ? n.toFixed(2) : n}` : `$${n % 1 ? n.toFixed(2) : n}`)

/** Whether a plan can be paid by the year: a monthly plan whose note offers it. The payment server uses the same test. */
export const offersYear = (p: Pick<CatalogPlan, 'cycle' | 'noteMyr' | 'noteUsd'>) => p.cycle === 'month' && /year/i.test(`${p.noteMyr ?? ''} ${p.noteUsd ?? ''}`)

/** A year for the price of ten months, as text. */
export const yearPrice = (p: CatalogPlan, cur: 'myr' | 'usd') => money((cur === 'myr' ? p.priceMyr : p.priceUsd) * 10, cur)

/** One catalog plan in the shape the website's pricing cards use. */
export const toPlanCard = (p: CatalogPlan): PlanCard => ({
  name: p.name,
  price: { myr: money(p.priceMyr, 'myr'), usd: money(p.priceUsd, 'usd') },
  per: CYCLE_LABEL[p.cycle],
  alt: p.noteMyr || p.noteUsd ? { myr: p.noteMyr ?? '', usd: p.noteUsd ?? p.noteMyr ?? '' } : undefined,
  items: p.items,
  best: p.best,
})

let cache: Catalog | null = null
let launchCache: Launch = DEFAULT_LAUNCH
const listeners = new Set<(c: Catalog) => void>()
const launchOf = (data: { launch?: Partial<Launch> } | undefined): Launch => ({ ...DEFAULT_LAUNCH, ...(data?.launch ?? {}) })
let started = false

function start() {
  if (started) return
  started = true
  // Read once quickly, then keep in step, so a price change shows without a reload.
  const take = (data: object | undefined) => {
    launchCache = launchOf(data as { launch?: Partial<Launch> })
    publish(data ? merge(data as Partial<Catalog>) : defaultCatalog())
  }
  getDoc(doc(db, 'platformConfig', 'pricing'))
    .then((snap) => take(snap.exists() ? snap.data() : undefined))
    .catch(() => publish(defaultCatalog()))
  onSnapshot(doc(db, 'platformConfig', 'pricing'), (snap) => take(snap.exists() ? snap.data() : undefined), () => {})
}
const merge = (saved: Partial<Catalog>): Catalog => ({ ...defaultCatalog(), ...Object.fromEntries(Object.entries(saved).filter(([k, v]) => Array.isArray(v) && EDITIONS.some((e) => e.id === k))) }) as Catalog
function publish(c: Catalog) {
  cache = c
  listeners.forEach((f) => f(c))
}

/** The whole catalog, live. */
export function useCatalog(): Catalog {
  const [c, setC] = useState<Catalog>(cache ?? defaultCatalog())
  useEffect(() => {
    listeners.add(setC)
    start()
    if (cache) setC(cache)
    return () => {
      listeners.delete(setC)
    }
  }, [])
  return c
}

/** What new accounts start on, per edition (live). */
export function useLaunch(): Launch {
  useCatalog()
  return launchCache
}

/** Read once, for sign-up: the plan a new organisation of this purpose starts on. */
export async function startPlanFor(purpose: string | undefined): Promise<StartPlan> {
  try {
    const snap = await getDoc(doc(db, 'platformConfig', 'pricing'))
    return launchOf(snap.exists() ? (snap.data() as { launch?: Partial<Launch> }) : undefined)[editionKey(purpose)]
  } catch {
    return DEFAULT_LAUNCH[editionKey(purpose)]
  }
}

/** The plans to show for one edition (hidden ones left out), as website cards. */
export function usePlans(edition: Edition): PlanCard[] {
  const c = useCatalog()
  return (c[edition.id] ?? []).filter((p) => !p.hidden).map(toPlanCard)
}
