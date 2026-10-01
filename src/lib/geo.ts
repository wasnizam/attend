import { t } from './i18n'

export interface Position {
  lat: number
  lng: number
  /** How exact the phone thinks it is, in metres. */
  accuracy: number
}

/** Asks the browser where this device is. Rejects with a plain-language reason. */
export function getPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error(t('This device cannot share its location.')))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      (e) =>
        reject(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? t('Location is switched off for this site. Allow location in your browser and try again.')
              : t('We could not find your location. Move near a window or turn on Wi-Fi, then try again.'),
          ),
        ),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    )
  })
}

/** Straight-line distance between two points, in metres. */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

export const formatDistance = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`)

export const RADII = [50, 100, 150, 300, 500]
export const DEFAULT_RADIUS = 150
