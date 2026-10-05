import { afterEach, describe, expect, it, vi } from 'vitest'

const real = Intl.DateTimeFormat

/** Loads currency.ts fresh, as on a device set to this time zone, with this saved choice. */
async function load(timeZone: string, saved?: string) {
  vi.resetModules()
  vi.unstubAllGlobals()
  vi.stubGlobal('Intl', {
    ...Intl,
    DateTimeFormat: Object.assign((...args: ConstructorParameters<typeof Intl.DateTimeFormat>) => {
      const f = new real(...args)
      return Object.assign(Object.create(f), { resolvedOptions: () => ({ ...f.resolvedOptions(), timeZone }) })
    }, real),
  })
  vi.stubGlobal('localStorage', { getItem: () => saved ?? null, setItem: () => {} })
  return import('../src/lib/currency')
}

afterEach(() => vi.unstubAllGlobals())

describe('visitors outside Malaysia', () => {
  it('see US dollars, even with ringgit saved from before', async () => {
    const c = await load('America/New_York', 'myr')
    expect(c.inMalaysia()).toBe(false)
    expect(c.getCurrency()).toBe('usd')
  })
})

describe('visitors in Malaysia', () => {
  it('see ringgit by default, in Peninsular Malaysia and in Sarawak and Sabah', async () => {
    for (const zone of ['Asia/Kuala_Lumpur', 'Asia/Kuching']) {
      const c = await load(zone)
      expect(c.inMalaysia()).toBe(true)
      expect(c.getCurrency()).toBe('myr')
    }
  })

  it('keep their own choice of US dollars', async () => {
    const c = await load('Asia/Kuala_Lumpur', 'usd')
    expect(c.getCurrency()).toBe('usd')
  })
})
