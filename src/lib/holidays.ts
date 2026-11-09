/**
 * Public holidays, for any country (and its states). The organisation picks where it is; every
 * class and shift then has no class on those days, the same as a holiday marked by hand, so
 * reports, the semester total and payroll all follow. A workplace may stay open instead: then the
 * days stay working days and only the pay treats them as public holidays.
 *
 * The holiday list itself (a large library) is loaded only when it is needed.
 */
import { addDays, classSlots, inSemester, isoDate, meetingKey, parseDate } from './format'
import { shownLang } from './i18n'
import type { WeeklyClass } from './types'

export interface HolidaySetting {
  /** ISO country code, e.g. MY. */
  country: string
  /** The library's code for a state or region, when holidays differ by state. */
  region?: string
  /** Workplace only: open on public holidays (paid at the holiday rate) instead of closed. */
  open?: boolean
}

export interface Holiday {
  date: string
  name: string
}

let setting: HolidaySetting | null = null
/**
 * The organisation's choice. Never chosen (undefined): the country is worked out from the time zone,
 * so national holidays apply from the start. Switched off on purpose (null): none.
 */
export const setHolidaySetting = (value: unknown, fallbackCountry = '') => {
  const v = value as Partial<HolidaySetting> | null | undefined
  if (v === undefined) {
    setting = /^[A-Z]{2}$/.test(fallbackCountry) ? { country: fallbackCountry } : null
    return
  }
  setting = v && typeof v.country === 'string' && /^[A-Z]{2}$/.test(v.country) ? { country: v.country, region: typeof v.region === 'string' && v.region ? v.region : undefined, open: Boolean(v.open) } : null
}
export const getHolidaySetting = () => setting

type Lib = typeof import('date-holidays').default
let lib: Promise<Lib> | null = null
const load = () => (lib ??= import('date-holidays').then((m) => m.default))

const language = () => shownLang()

/** Every country the list knows, by name, in the reader's language where it can. */
export async function countries(): Promise<{ code: string; name: string }[]> {
  const H = await load()
  const all = new H().getCountries('en')
  // Names in the reader's language (the list's own are each in their country's language).
  let names: Intl.DisplayNames | null = null
  try {
    names = new Intl.DisplayNames([language(), 'en'], { type: 'region' })
  } catch {
    names = null
  }
  return Object.entries(all)
    .map(([code, name]) => ({ code, name: names?.of(code) || name }))
    .sort((a, b) => a.name.localeCompare(b.name, language()))
}

/** A country's states or regions, when its holidays differ by them. */
export async function regions(country: string): Promise<{ code: string; name: string }[]> {
  const H = await load()
  const all = new H().getStates(country, language()) ?? {}
  return Object.entries(all)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The public holidays between two dates (inclusive), one per day, earliest first. */
export async function holidaysBetween(s: Pick<HolidaySetting, 'country' | 'region'>, from: string, to: string): Promise<Holiday[]> {
  const H = await load()
  const h = s.region ? new H(s.country, s.region, { languages: [language(), 'en'] }) : new H(s.country, { languages: [language(), 'en'] })
  const out = new Map<string, string>()
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    for (const x of h.getHolidays(year) || []) {
      if (x.type !== 'public') continue
      const date = x.date.slice(0, 10)
      if (date < from || date > to) continue
      out.set(date, out.has(date) ? `${out.get(date)} / ${x.name}` : x.name)
    }
  }
  return [...out.entries()].map(([date, name]) => ({ date, name })).sort((a, b) => a.date.localeCompare(b.date))
}

/** The dates a class's holidays are worked out for: its semester, or a year around today. */
export function windowFor(cls: Pick<WeeklyClass, 'startDate' | 'endDate'>, today = isoDate()): { from: string; to: string } {
  const from = cls.startDate || addDays(today, -62)
  const to = cls.endDate || addDays(today, 366)
  return { from, to: to < from ? from : to }
}

/** What a class's holidays were last worked out from; when it changes, they are worked out again. */
export function signatureFor(cls: Pick<WeeklyClass, 'startDate' | 'endDate' | 'slots' | 'days' | 'startTime' | 'endTime'>, s: HolidaySetting | null, today = isoDate()): string {
  if (!s) return 'none'
  const w = windowFor(cls, today)
  // An open-ended shift moves its window along each month.
  const month = cls.endDate ? '' : today.slice(0, 7)
  const times = classSlots(cls).map((x) => `${x.day}${x.startTime}`).join(',')
  return `v1|${s.country}|${s.region ?? ''}|${s.open ? 'open' : 'closed'}|${w.from}|${cls.endDate ?? ''}|${month}|${times}`
}

export const holidayReason = (name: string, label: string) => `${label}: ${name}`

/**
 * The changes that bring one class in line with the holidays: meetings on a holiday are called
 * off (unless the class was held that day, or someone chose to keep it), and holidays that no
 * longer apply are put back. `holidayKeys` remembers which meetings fall on a public holiday, so
 * payroll can pay the holiday rate even on a day the workplace is open.
 */
export function holidayPatch(
  cls: WeeklyClass,
  list: Holiday[],
  opts: { open: boolean; held: Set<string>; label: string; signature: string; sessionIdOf: (date: string, slot: { startTime: string }) => string; del: unknown },
): Record<string, unknown> {
  const DELETE = opts.del
  const want = new Map<string, string>()
  for (const h of list) {
    if (!inSemester(cls, h.date)) continue
    const day = parseDate(h.date).getDay()
    for (const slot of classSlots(cls)) if (slot.day === day) want.set(meetingKey(h.date, slot), holidayReason(h.name, opts.label))
  }
  const old = cls.holidayKeys ?? {}
  const patch: Record<string, unknown> = {}
  for (const [key, reason] of Object.entries(old)) {
    if (want.has(key)) continue
    // No longer a holiday: put the meeting back, unless the reason was changed by hand.
    if (cls.cancelled?.[key] === reason) patch[`cancelled.${key}`] = DELETE
    patch[`holidayKeys.${key}`] = DELETE
    if (cls.holidayKept?.[key]) patch[`holidayKept.${key}`] = DELETE
  }
  for (const [key, reason] of want) {
    if (old[key] !== reason) patch[`holidayKeys.${key}`] = reason
    const date = key.slice(0, 10)
    const slot = { startTime: `${key.slice(11, 13)}:${key.slice(13, 15)}` }
    const keep = opts.open || cls.holidayKept?.[key] || opts.held.has(opts.sessionIdOf(date, slot))
    if (keep) {
      // Open that day: a holiday this sync called off earlier is put back.
      if (opts.open && cls.cancelled?.[key] === old[key] && old[key]) patch[`cancelled.${key}`] = DELETE
      continue
    }
    if (!cls.cancelled?.[key]) patch[`cancelled.${key}`] = reason
  }
  patch.holidaySync = opts.signature
  return patch
}

/** The dates a class is on a public holiday, for payroll's holiday rate. */
export const holidayDates = (cls: Pick<WeeklyClass, 'holidayKeys'>) => Object.keys(cls.holidayKeys ?? {}).map((k) => k.slice(0, 10))

/** A best first guess at the country, from the device's time zone. */
export function guessCountry(timeZone?: string): string {
  const zone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  const byZone: Record<string, string> = {
    'Asia/Kuala_Lumpur': 'MY', 'Asia/Kuching': 'MY', 'Asia/Singapore': 'SG', 'Asia/Jakarta': 'ID', 'Asia/Makassar': 'ID', 'Asia/Jayapura': 'ID',
    'Asia/Bangkok': 'TH', 'Asia/Manila': 'PH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Brunei': 'BN', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
    'Asia/Dhaka': 'BD', 'Asia/Karachi': 'PK', 'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR',
    'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK', 'Asia/Taipei': 'TW', 'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Perth': 'AU',
    'Pacific/Auckland': 'NZ', 'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Prague': 'CZ', 'Europe/Bratislava': 'SK', 'Europe/Berlin': 'DE',
    'Europe/Vienna': 'AT', 'Europe/Paris': 'FR', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE',
    'Europe/Warsaw': 'PL', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI', 'Europe/Zurich': 'CH',
    'Europe/Lisbon': 'PT', 'Europe/Athens': 'GR', 'Europe/Budapest': 'HU', 'Europe/Istanbul': 'TR', 'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE',
    'Africa/Johannesburg': 'ZA', 'Africa/Cairo': 'EG', 'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US',
    'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR', 'America/Argentina/Buenos_Aires': 'AR',
  }
  return byZone[zone] ?? ''
}
