import { useState } from 'react'
import { setGeofence } from '../data/sessions'
import { DEFAULT_RADIUS, RADII, getPosition } from '../lib/geo'
import { t } from '../lib/i18n'
import type { GeoMode, Session } from '../lib/types'
import { ErrorNote, friendlyError } from './ui'

/**
 * The lecturer's location check. Switching it on records where the lecturer is standing
 * as "the class"; students who check in from further away are noted, or refused.
 */
export function GeofenceControl({ session }: { session: Session }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const on = Boolean(session.geoPoint)
  const radius = session.geoRadius ?? DEFAULT_RADIUS
  const mode: GeoMode = session.geoMode ?? 'flag'

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  /** Records "here" as the class, keeping the current radius and mode. */
  const setHere = () =>
    run(async () => {
      const p = await getPosition()
      setAccuracy(p.accuracy)
      await setGeofence(session, { lat: p.lat, lng: p.lng, radius, mode })
    })

  const change = (patch: { radius?: number; mode?: GeoMode }) =>
    run(() =>
      setGeofence(session, {
        lat: session.geoPoint!.latitude,
        lng: session.geoPoint!.longitude,
        radius: patch.radius ?? radius,
        mode: patch.mode ?? mode,
      }),
    )

  const select = 'h-9 rounded-md border border-line bg-white px-2 !text-sm font-medium'

  return (
    <div className="rounded-lg bg-canvas px-4 py-3 text-left">
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-semibold">{t('Location check')}</span>
          <span className="block text-xs text-muted">
            {t('Notes students who check in from far away. It uses where you are now as the class.')}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={on}
          disabled={busy}
          onChange={() => (on ? run(() => setGeofence(session, null)) : setHere())}
          className="size-5 shrink-0 accent-accent"
        />
      </label>

      {on && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              value={mode}
              disabled={busy}
              aria-label={t('What to do when a student is far away')}
              onChange={(e) => change({ mode: e.target.value as GeoMode })}
              className={select}
            >
              <option value="flag">{t('Warn only')}</option>
              <option value="block">{t('Refuse check-in')}</option>
            </select>
            <span className="text-muted">{t('within')}</span>
            <select
              value={radius}
              disabled={busy}
              aria-label={t('Distance that counts as here')}
              onChange={(e) => change({ radius: Number(e.target.value) })}
              className={select}
            >
              {RADII.map((r) => (
                <option key={r} value={r}>{r} m</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted">
            {mode === 'flag'
              ? t('Everyone can check in. Anyone far away gets a note beside their name.')
              : t('Students who are too far away, or who do not share their location, cannot check in. You can still mark them by hand.')}
          </p>
          <button type="button" disabled={busy} onClick={setHere} className="text-xs font-medium text-accent">
            {busy ? t('Finding your location…') : t('Set the class to where I am now')}
          </button>
          {accuracy !== null && (
            <p className={`text-xs ${accuracy > 100 ? 'font-medium text-[#b25e00]' : 'text-muted'}`}>
              {accuracy > 100
                ? t('This device’s location is rough (within about {n} m). For a better result, set it from a phone in the classroom.', { n: accuracy })
                : t('Location set, exact to about {n} m.', { n: accuracy })}
            </p>
          )}
        </div>
      )}
      {busy && !on && <p className="mt-2 text-xs text-muted">{t('Finding your location…')}</p>}
      <div className="mt-2 empty:hidden">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </div>
  )
}
