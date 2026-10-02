import { useState } from 'react'
import { DEFAULT_RADIUS, RADII, getPosition } from '../lib/geo'
import { t } from '../lib/i18n'
import type { GeoMode, Geofence } from '../lib/types'
import { Button, inputClass } from './ui'

/** Where an office is. undefined = leave what is stored; null = no location check. */
export type Fence = { lat: number; lng: number; radius: number; mode: GeoMode } | null | undefined

/**
 * Sets an office's location from where the manager is standing, with how far still counts
 * and what happens to a clock-in from further away.
 */
export function LocationPicker({ stored, onChange, pointOnly }: { stored?: Geofence; onChange: (fence: Fence) => void; /** The distance and what happens are chosen once elsewhere, for every office. */ pointOnly?: boolean }) {
  const [point, setPoint] = useState<{ lat: number; lng: number } | null | undefined>(undefined)
  const [radius, setRadius] = useState(stored?.geoRadius ?? DEFAULT_RADIUS)
  const [mode, setMode] = useState<GeoMode>(stored?.geoMode ?? 'flag')
  const [finding, setFinding] = useState(false)
  const [error, setError] = useState('')
  const kept = stored?.geoPoint ? { lat: stored.geoPoint.latitude, lng: stored.geoPoint.longitude } : null
  const at = point === undefined ? kept : point

  const emit = (p: typeof at, r = radius, m = mode) => onChange(p ? { ...p, radius: r, mode: m } : point === undefined && !kept ? undefined : null)
  const locate = async () => {
    setFinding(true)
    setError('')
    try {
      const here = await getPosition()
      const p = { lat: here.lat, lng: here.lng }
      setPoint(p)
      emit(p)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setFinding(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" busy={finding} onClick={locate}>{at ? t('Update to where I am now') : t('Use where I am now')}</Button>
        {at && <span className="text-sm font-medium text-good">✓ {t('Location saved')}</span>}
        {at && (
          <button type="button" onClick={() => { setPoint(null); onChange(null) }} className="text-sm font-medium text-muted hover:text-bad">
            {t('Remove')}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      {at && !pointOnly && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-muted">
            {t('How far still counts')}
            <select value={radius} onChange={(e) => { setRadius(Number(e.target.value)); emit(at, Number(e.target.value)) }} className={`${inputClass} mt-1`}>
              {RADII.map((r) => (
                <option key={r} value={r}>{r} m</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-muted">
            {t('From further away')}
            <select value={mode} onChange={(e) => { setMode(e.target.value as GeoMode); emit(at, radius, e.target.value as GeoMode) }} className={`${inputClass} mt-1`}>
              <option value="flag">{t('Flag it for me')}</option>
              <option value="block">{t('Refuse check-in')}</option>
            </select>
          </label>
        </div>
      )}
    </div>
  )
}
