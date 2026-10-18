import { useEffect, useMemo, useState } from 'react'
import { getOrganisation } from '../data/account'
import { useProfile } from '../hooks/useAuth'
import { slug } from '../lib/csv'
import { type Certificate, type CertificateSource, certificateUrl, certificatesPdf, issueCertificates, listCertificates, revokeCertificates } from '../lib/certificate'
import { formatPercent } from '../lib/format'
import { t } from '../lib/i18n'
import { Button, Card, inputClass } from './ui'

export interface CertificatePerson {
  key: string
  name: string
  id?: string
  /** Attendance so far, in percent. Null when nothing counts yet. */
  rate: number | null
}

const MINIMUMS = [50, 60, 70, 75, 80, 90, 100]

function remembered(): string {
  try {
    return localStorage.getItem('attend.letterhead') ?? ''
  } catch {
    return ''
  }
}

/**
 * Certificates of attendance for a course or a session: the organiser chooses who gets one, the
 * server works out each person's figures from the records and gives each certificate a code, and
 * everyone gets a PDF and a link anyone can open to check it is real.
 */
export function CertificatesPanel({ source, people, course: defaultCourse, letterhead, oneSession = false }: {
  source: CertificateSource
  people: CertificatePerson[]
  course: string
  letterhead?: string
  /** A single session: everyone who attended earns one, so there is no minimum to set. */
  oneSession?: boolean
}) {
  const profile = useProfile()
  const [course, setCourse] = useState(defaultCourse)
  const [issuer, setIssuer] = useState(() => letterhead || remembered())
  const [signedBy, setSignedBy] = useState(profile.name.trim())
  const [min, setMin] = useState(oneSession ? 0 : 80)
  const [issued, setIssued] = useState<Certificate[] | null>(null)
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [busy, setBusy] = useState<'' | 'issue' | 'pdf' | 'copy'>('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    listCertificates(source).then(setIssued, () => setIssued([]))
    // The certificates belong to this class or session only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.kind, source.id])
  useEffect(() => {
    if (issuer) return
    getOrganisation(profile.organisationId).then((o) => setIssuer((v) => v || (o?.name && !/['’]s sessions$/.test(o.name) ? o.name : '')), () => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.organisationId])

  const eligible = useMemo(() => people.filter((p) => p.rate !== null && p.rate > 0 && p.rate >= min), [people, min])
  const chosen = eligible.filter((p) => (picked ?? new Set(eligible.map((x) => x.key))).has(p.key))
  const current = (issued ?? []).filter((c) => !c.revoked)
  const byKey = new Map(current.map((c) => [c.key, c]))

  const toggle = (key: string) => {
    const next = new Set(picked ?? eligible.map((x) => x.key))
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setPicked(next)
  }

  const issue = async () => {
    setBusy('issue')
    setError('')
    setNote('')
    try {
      const reply = await issueCertificates(source, { keys: chosen.map((p) => p.key), min, course: course.trim(), issuer: issuer.trim(), signedBy: signedBy.trim() })
      try {
        if (issuer.trim()) localStorage.setItem('attend.letterhead', issuer.trim())
      } catch {
        // Typed again next time.
      }
      setIssued(await listCertificates(source).catch(() => reply.certificates))
      setNote(
        reply.skipped
          ? t('{n} certificates are ready. {s} people did not reach the minimum attendance in the records, so they did not get one.', { n: reply.certificates.length, s: reply.skipped })
          : t('{n} certificates are ready.', { n: reply.certificates.length }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  const download = async (list: Certificate[]) => {
    setBusy('pdf')
    setError('')
    try {
      const doc = await certificatesPdf(list)
      doc.save(list.length === 1 ? `certificate-${slug(list[0].name)}.pdf` : `${slug(course || defaultCourse)}-certificates.pdf`)
    } catch {
      setError(t('The PDF could not be made. Try again.'))
    } finally {
      setBusy('')
    }
  }

  // A list to paste into WhatsApp or an email: each person and the link to their certificate.
  const copyLinks = async () => {
    setBusy('copy')
    const text = [t('Certificates of attendance: {course}', { course: course || defaultCourse }), '', ...current.map((c) => `${c.name}: ${certificateUrl(c.code)}`)].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setNote(t('The links are copied. Paste them into WhatsApp, Telegram or an email.'))
    } catch {
      setError(t('Copying did not work on this device. Open each certificate and share its link instead.'))
    } finally {
      setBusy('')
    }
  }

  const withdraw = async (c: Certificate) => {
    if (!window.confirm(t('Withdraw the certificate for {name}? Its link will then say it was withdrawn.', { name: c.name }))) return
    setError('')
    try {
      await revokeCertificates(source, [c.code])
      setIssued((list) => (list ?? []).map((x) => (x.code === c.code ? { ...x, revoked: true } : x)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h2 className="font-semibold">{t('Certificates of attendance')}</h2>
        <p className="text-sm text-muted">
          {t('A certificate for everyone who attended, made from the attendance records. Each one has its own link that anyone can open to check it is real, and a button to add it to LinkedIn.')}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium sm:col-span-2">
          {t('Course name on the certificate')}
          <input value={course} onChange={(e) => setCourse(e.target.value)} maxLength={160} className={`${inputClass} mt-1 !h-10`} />
        </label>
        <label className="block text-sm font-medium">
          {t('Issued by')}
          <input value={issuer} onChange={(e) => setIssuer(e.target.value)} maxLength={160} placeholder={t('e.g. Sunrise Training Sdn Bhd')} className={`${inputClass} mt-1 !h-10`} />
        </label>
        <label className="block text-sm font-medium">
          {t('Signed by')}
          <input value={signedBy} onChange={(e) => setSignedBy(e.target.value)} maxLength={120} className={`${inputClass} mt-1 !h-10`} />
        </label>
        {!oneSession && (
          <label className="block text-sm font-medium">
            {t('Minimum attendance')}
            <select value={min} onChange={(e) => { setMin(Number(e.target.value)); setPicked(null) }} className={`${inputClass} mt-1 !h-10`}>
              {MINIMUMS.map((n) => (
                <option key={n} value={n}>{n}%</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div>
        <p className="text-sm font-medium">
          {t('Who gets one')} <span className="tabular font-normal text-muted">{chosen.length} / {people.length}</span>
        </p>
        {eligible.length === 0 ? (
          <p className="mt-1 text-sm text-muted">{t('Nobody has reached the minimum attendance yet.')}</p>
        ) : (
          <ul className="mt-2 grid max-h-72 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {eligible.map((p) => (
              <li key={p.key}>
                <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ring-1 ring-line">
                  <input type="checkbox" checked={chosen.some((c) => c.key === p.key)} onChange={() => toggle(p.key)} className="size-4 accent-accent" />
                  <span className="min-w-0 flex-1 truncate">
                    {p.id && <span className="font-medium">{p.id} </span>}
                    {p.name}
                  </span>
                  {!oneSession && <span className="tabular text-xs text-muted">{formatPercent(p.rate)}</span>}
                  {byKey.has(p.key) && <span className="text-xs font-semibold text-good">✓</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
        {people.length > eligible.length && !oneSession && (
          <p className="mt-2 text-xs text-muted">{t('{n} people are below {p}% and are left out.', { n: people.length - eligible.length, p: min })}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button busy={busy === 'issue'} disabled={chosen.length === 0 || !course.trim() || !issuer.trim()} onClick={issue}>
          {t(chosen.length === 1 ? 'Make 1 certificate' : 'Make {n} certificates', { n: chosen.length })}
        </Button>
        {current.length > 0 && (
          <>
            <Button variant="secondary" busy={busy === 'pdf'} onClick={() => download(current)}>{t('Download all (PDF)')}</Button>
            <Button variant="secondary" busy={busy === 'copy'} onClick={copyLinks}>{t('Copy all links')}</Button>
          </>
        )}
      </div>
      {!issuer.trim() && <p className="text-xs text-muted">{t('Type the name of your organisation, as it should appear on the certificate.')}</p>}
      {note && <p className="text-sm text-good">{note}</p>}
      {error && <p className="text-sm text-bad">{error}</p>}

      {current.length > 0 && (
        <div>
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">{t('Certificates made')}</p>
          <ul className="mt-2 divide-y divide-line rounded-lg ring-1 ring-line">
            {current.map((c) => (
              <li key={c.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                <a href={certificateUrl(c.code)} target="_blank" rel="noreferrer" className="font-medium text-accent">{t('Open')}</a>
                <button type="button" onClick={() => download([c])} className="font-medium text-accent">PDF</button>
                <button type="button" onClick={() => withdraw(c)} className="text-muted hover:text-bad">{t('Withdraw')}</button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">{t('Making them again after more sessions updates the figures. Each person keeps the same link.')}</p>
        </div>
      )}
    </Card>
  )
}
