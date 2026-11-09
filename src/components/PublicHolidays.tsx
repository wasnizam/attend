import { useEffect, useState } from 'react'
import { setHolidays } from '../data/account'
import { useProfile } from '../hooks/useAuth'
import { addDays, formatDate, isoDate } from '../lib/format'
import { type Holiday, countries, getHolidaySetting, guessCountry, holidaysBetween, regions } from '../lib/holidays'
import { t } from '../lib/i18n'
import { has } from '../lib/purpose'
import { Button, Card, ErrorNote, friendlyError, inputClass } from './ui'

type Option = { code: string; name: string }

/**
 * Where the organisation is, so its public holidays are taken off every class and shift by
 * themselves. A workplace chooses to close on them, or to stay open and pay the holiday rate.
 */
export function PublicHolidays() {
  const profile = useProfile()
  const admin = profile.role === 'admin'
  const workplace = has('clock')
  const saved = getHolidaySetting()
  const [country, setCountry] = useState(saved?.country ?? '')
  const [region, setRegion] = useState(saved?.region ?? '')
  const [open, setOpen] = useState(Boolean(saved?.open))
  const [allCountries, setAllCountries] = useState<Option[] | null>(null)
  const [states, setStates] = useState<Option[]>([])
  const [coming, setComing] = useState<Holiday[] | null>(null)
  const [editing, setEditing] = useState(!saved)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  useEffect(() => {
    countries().then((list) => {
      setAllCountries(list)
      if (editing && !country) {
        const guess = guessCountry()
        if (list.some((c) => c.code === guess)) setCountry(guess)
      }
    }, () => setAllCountries([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  useEffect(() => {
    if (!country) return setStates([])
    let stale = false
    regions(country).then((list) => !stale && setStates(list), () => {})
    return () => {
      stale = true
    }
  }, [country])

  // The next twelve months of holidays for what is chosen (or saved), to check them at a glance.
  const showCountry = editing ? country : saved?.country
  const showRegion = editing ? region : saved?.region
  useEffect(() => {
    setComing(null)
    if (!showCountry) return
    let stale = false
    const today = isoDate()
    holidaysBetween({ country: showCountry, region: showRegion || undefined }, today, addDays(today, 365)).then((list) => !stale && setComing(list), () => !stale && setComing([]))
    return () => {
      stale = true
    }
  }, [showCountry, showRegion])

  const save = async (value: { country: string; region: string | null; open: boolean } | null) => {
    setBusy(true)
    setError('')
    setDone('')
    try {
      await setHolidays(profile.organisationId, value)
      setEditing(false)
      setDone(value ? t('Saved. Public holidays are now taken off your classes by themselves.') : t('Public holidays are switched off.'))
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const name = (list: Option[] | null, code?: string) => list?.find((c) => c.code === code)?.name ?? code ?? ''
  const what = workplace
    ? saved?.open
      ? t('Open on public holidays: staff clock in as usual, and those hours are paid at the public holiday rate.')
      : t('Closed on public holidays: a day off for everyone. Anyone who does work that day is paid the public holiday rate.')
    : t('No class on public holidays. They are not counted in the semester total or in anyone’s attendance.')

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-semibold">{t('Public holidays')}</h2>
        <p className="text-sm text-muted">
          {workplace
            ? t('Choose where your company is. Its public holidays are added to every shift by themselves, every year.')
            : t('Choose where you teach. Its public holidays are taken off all your classes by themselves, every semester.')}
        </p>
      </div>

      {!editing && saved && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-canvas px-4 py-3 text-sm">
          <div>
            <p className="font-medium">
              {name(allCountries, saved.country) || saved.country}
              {saved.region ? ` · ${name(states, saved.region) || saved.region}` : ''}
            </p>
            <p className="text-muted">{what}</p>
          </div>
          {admin && (
            <button className="font-semibold text-accent hover:underline" onClick={() => setEditing(true)}>
              {t('Change')}
            </button>
          )}
        </div>
      )}

      {editing && !admin && <p className="text-sm text-muted">{t('Your admin chooses the public holidays for everyone in your organisation.')}</p>}

      {editing && admin && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              {t('Country')}
              <select value={country} onChange={(e) => { setCountry(e.target.value); setRegion('') }} className={`${inputClass} mt-1 !h-10`} disabled={!allCountries}>
                <option value="">{allCountries ? t('Choose a country') : t('Loading…')}</option>
                {(allCountries ?? []).map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </label>
            {states.length > 0 && (
              <label className="block text-sm font-medium">
                {t('State or region')}
                <select value={region} onChange={(e) => setRegion(e.target.value)} className={`${inputClass} mt-1 !h-10`}>
                  <option value="">{t('National holidays only')}</option>
                  {states.map((s) => (
                    <option key={s.code} value={s.code}>{s.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {workplace && (
            <fieldset className="space-y-2 text-sm">
              <label className="flex items-start gap-2">
                <input type="radio" name="holiday-open" checked={!open} onChange={() => setOpen(false)} className="mt-1" />
                <span>
                  <span className="font-medium">{t('Closed on public holidays')}</span>
                  <span className="block text-muted">{t('A day off for everyone, and nobody is counted absent. Anyone who does work that day is paid the public holiday rate.')}</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name="holiday-open" checked={open} onChange={() => setOpen(true)} className="mt-1" />
                <span>
                  <span className="font-medium">{t('Open on public holidays')}</span>
                  <span className="block text-muted">{t('Shifts run and staff clock in as usual. Their hours that day are paid at the public holiday rate.')}</span>
                </span>
              </label>
            </fieldset>
          )}
          <div className="flex flex-wrap gap-2">
            <Button busy={busy} disabled={!country} onClick={() => save({ country, region: region || null, open: workplace && open })}>
              {t('Save')}
            </Button>
            {saved && (
              <>
                <Button variant="secondary" onClick={() => setEditing(false)}>{t('Cancel')}</Button>
                <Button variant="secondary" busy={busy} onClick={() => window.confirm(t('Stop adding public holidays? The ones already added are put back as normal days.')) && save(null)}>
                  {t('Switch off')}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <ErrorNote>{error}</ErrorNote>
      {done && <p className="text-sm text-good">{done}</p>}

      {showCountry && (
        <details className="rounded-lg border border-line">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold select-none">
            {t('Coming up')} {coming && <span className="tabular font-normal text-muted">· {coming.length}</span>}
          </summary>
          <ul className="divide-y divide-line border-t border-line text-sm">
            {coming === null && <li className="px-4 py-2.5 text-muted">{t('Loading…')}</li>}
            {coming?.map((h) => (
              <li key={h.date} className="flex gap-3 px-4 py-2.5">
                <span className="tabular w-28 shrink-0 text-muted">{formatDate(h.date)}</span>
                <span className="min-w-0 flex-1">{h.name}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-4 py-3 text-xs text-muted">
            {t('Holidays that follow the moon (such as Hari Raya, Chinese New Year or Deepavali) are worked out in advance and can move by a day when they are announced. To change one day, open it in the calendar: “Undo cancel” keeps that class on, “Cancel class” adds a day off.')}
          </p>
        </details>
      )}
    </Card>
  )
}
