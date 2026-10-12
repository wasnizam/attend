const KEY = 'dobry.ref'

/**
 * Notes the invite code on the address someone arrived by (?ref=CODE), the moment the site loads,
 * so it is still known after they look around and sign up. Kept for a week on this device.
 */
export function rememberRef() {
  try {
    const code = new URLSearchParams(window.location.search).get('ref')?.trim().toUpperCase() ?? ''
    if (/^[A-Z0-9]{6,12}$/.test(code)) localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }))
  } catch {
    // Private browsing: the invite simply is not remembered.
  }
}

/** The invite code this device came in by, if it was within the last week. Read once, then forgotten. */
export function takeRef(): string {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { code?: string; at?: number } | null
    localStorage.removeItem(KEY)
    return saved?.code && saved.at && Date.now() - saved.at < 7 * 86_400_000 ? saved.code : ''
  } catch {
    return ''
  }
}

/** Whether this device came in by an invite link (without forgetting it). */
export function hasRef(): boolean {
  try {
    return Boolean((JSON.parse(localStorage.getItem(KEY) ?? 'null') as { code?: string } | null)?.code)
  } catch {
    return false
  }
}
