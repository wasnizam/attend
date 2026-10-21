const KEY = 'dobry.source'
const DAYS = 30

export interface Source {
  source: string
  medium: string
  campaign: string
  landing: string
  referrer: string
}

/**
 * Notes where a visitor first came from, so the Console can show which channels bring customers:
 * a campaign link (?utm_source=…), an invite link, the check-in screen, a certificate page, another
 * website, or nothing at all (typed in). The first visit counts, for 30 days, on this device only.
 */
export function rememberSource() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as (Source & { at: number }) | null
    if (saved && Date.now() - saved.at < DAYS * 86_400_000) return
    // Inside the app or a check-in page, a visit says nothing about how someone found Dobry.
    if (/^\/(app|admin|console|session|door|login)(\/|$)/.test(location.pathname)) return
    const q = new URLSearchParams(location.search)
    let host = ''
    try {
      host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''
    } catch {
      host = ''
    }
    const own = !host || host === location.hostname.replace(/^www\./, '') || host.endsWith('dobry.app')
    const source =
      q.get('utm_source') ||
      (q.get('ref') ? 'invite' : '') ||
      (location.pathname.startsWith('/c/') ? 'certificate' : '') ||
      (own ? 'direct' : /google\./.test(host) ? 'google' : /facebook\.|fb\./.test(host) ? 'facebook' : /linkedin\./.test(host) ? 'linkedin' : /t\.co$|twitter\.|x\.com/.test(host) ? 'x' : host)
    const value: Source & { at: number } = {
      source,
      medium: q.get('utm_medium') ?? '',
      campaign: q.get('utm_campaign') ?? '',
      landing: location.pathname,
      referrer: own ? '' : host,
      at: Date.now(),
    }
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    // Private browsing: the sign-up is counted as unknown.
  }
}

/** Where this device first came from, for the sign-up. */
export function takeSource(): Source | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as (Source & { at: number }) | null
    return saved && Date.now() - saved.at < DAYS * 86_400_000 ? saved : null
  } catch {
    return null
  }
}
