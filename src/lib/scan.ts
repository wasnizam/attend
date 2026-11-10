/**
 * The app's own QR scanner, for checking in without leaving Dobry: it opens the phone's camera,
 * reads the code on the lecturer's or the door's screen, and goes straight to that check-in.
 * Only Dobry's own check-in codes are followed; anything else is refused.
 */
import { t } from './i18n'

const HOSTS = ['dobry.app', 'www.dobry.app']

/** The in-app address a scanned code leads to, or null when it is not a Dobry check-in code. */
export function checkInPath(text: string, here = typeof location === 'undefined' ? '' : location.host): string | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) return null
  if (!HOSTS.includes(url.host) && url.host !== here) return null
  if (/^\/session\/[A-Za-z0-9]{6}$/.test(url.pathname) || url.pathname === '/door') return url.pathname + url.search
  return null
}

/** Opens the camera. Resolves with where to go, or null when the person closed the scanner. */
export async function scanCheckIn(): Promise<string | null> {
  const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } = await import('@capacitor/barcode-scanner')
  let text = ''
  try {
    const result = await CapacitorBarcodeScanner.scanBarcode({
      hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
      scanInstructions: t('Point the camera at the QR code on the screen'),
      scanButton: false,
    })
    text = result.ScanResult ?? ''
  } catch (e) {
    if (/cancel/i.test(e instanceof Error ? e.message : String(e))) return null
    throw e
  }
  if (!text) return null
  const path = checkInPath(text)
  if (!path) throw new Error(t('This is not a Dobry check-in code. Scan the QR code your lecturer or the door screen shows.'))
  return path
}
