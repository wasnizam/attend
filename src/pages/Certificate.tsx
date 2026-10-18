import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { Button, Logo, PageLoader } from '../components/ui'
import { type Certificate, certificateUrl, certificatesPdf, dateLine, fetchCertificate, figuresLine, linkedInUrl, prettyCode } from '../lib/certificate'
import { slug } from '../lib/csv'
import { formatDate, isoDate } from '../lib/format'
import { t } from '../lib/i18n'

/**
 * The public page behind a certificate's link and QR: anyone can see that it is real, and the
 * person it belongs to can download it or add it to LinkedIn. It never shows more than the
 * certificate itself says.
 */
export default function CertificatePage() {
  const { code = '' } = useParams()
  const [cert, setCert] = useState<Certificate | null | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // A person's name is on this page: keep it out of search results.
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex'
    document.head.appendChild(robots)
    return () => robots.remove()
  }, [])
  useEffect(() => {
    fetchCertificate(code).then(setCert, () => setFailed(true))
  }, [code])
  useEffect(() => {
    if (cert) document.title = `${cert.name} · ${cert.course} · Dobry`
  }, [cert])

  const download = async () => {
    if (!cert) return
    setBusy(true)
    try {
      ;(await certificatesPdf([cert])).save(`certificate-${slug(cert.name)}.pdf`)
    } finally {
      setBusy(false)
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(certificateUrl(code))
      setCopied(true)
    } catch {
      // The address bar still has the link.
    }
  }

  return (
    <div className="relative isolate min-h-dvh overflow-hidden bg-night text-white">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(40rem_25rem_at_90%_0%,rgb(255_200_61/0.16),transparent_60%),radial-gradient(40rem_30rem_at_0%_100%,rgb(99_102_241/0.45),transparent_60%)]" />
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-8 sm:px-6">
        <Link to="/" className="mx-auto mb-8 text-white">
          <Logo className="text-xl" />
        </Link>

        <div className="rounded-2xl bg-white p-2 text-ink shadow-[0_30px_80px_-20px_rgb(0_0_0/0.55)]">
          {cert === undefined && !failed ? (
            <div className="py-16"><PageLoader /></div>
          ) : failed ? (
            <Notice title={t('This certificate could not be loaded')} text={t('Check your connection and reload the page.')} />
          ) : !cert ? (
            <Notice title={t('Certificate not found')} text={t('There is no certificate with this number. Check the link or the number printed on the certificate.')} />
          ) : (
            <div className="rounded-xl border-2 border-sun/70 px-5 py-8 text-center sm:px-10 sm:py-10">
              {cert.revoked ? (
                <p className="mx-auto inline-flex items-center gap-2 rounded-full bg-bad-soft px-3 py-1 text-sm font-semibold text-bad">✕ {t('Withdrawn by the organiser')}</p>
              ) : (
                <p className="mx-auto inline-flex items-center gap-2 rounded-full bg-good-soft px-3 py-1 text-sm font-semibold text-good">✓ {t('Verified by Dobry')}</p>
              )}
              <p className="mt-6 text-xs font-semibold tracking-[0.2em] text-muted uppercase">{cert.issuer}</p>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-night sm:text-3xl">{t('Certificate of Attendance')}</h1>
              <p className="mt-6 text-sm text-muted">{t('This is to certify that')}</p>
              <p className="mt-1 font-display text-2xl font-bold break-words sm:text-3xl">{cert.name}</p>
              <p className="mt-4 text-sm text-muted">{t('attended')}</p>
              <p className="mt-1 text-lg font-semibold break-words">{cert.course}</p>
              {dateLine(cert) && <p className="mt-2 text-sm text-muted">{dateLine(cert)}</p>}
              <p className="tabular mt-1 text-sm text-muted">{figuresLine(cert)}</p>
              {cert.signedBy && <p className="mt-6 text-sm"><span className="text-muted">{t('Signed by')}</span> <span className="font-semibold">{cert.signedBy}</span></p>}
              <p className="mt-6 text-xs text-muted">
                {t('Certificate no.')} <span className="font-mono font-semibold text-ink">{prettyCode(cert.code)}</span> · {t('Issued {date}', { date: formatDate(isoDate(new Date(cert.issuedAt))) })}
              </p>
              {cert.revoked && <p className="mt-4 text-sm text-bad">{t('The organiser has withdrawn this certificate. It is no longer valid.')}</p>}
            </div>
          )}
        </div>

        {cert && !cert.revoked && (
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <a href={linkedInUrl(cert)} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center rounded-lg bg-[#0a66c2] px-4 text-sm font-semibold text-white hover:bg-[#004182]">
              {t('Add to LinkedIn')}
            </a>
            <Button busy={busy} onClick={download} className="!h-11 !bg-sun !text-night hover:!bg-sun-strong">{t('Download PDF')}</Button>
            <Button variant="secondary" onClick={copy} className="!h-11">{copied ? t('Link copied') : t('Copy link')}</Button>
          </div>
        )}

        <div className="mt-auto pt-10 text-center text-sm text-indigo-100/80">
          <p>{t('Attendance and certificates by Dobry. Free for trainers and lecturers.')}</p>
          <Link to="/trainers?utm_source=certificate" className="mt-1 inline-block font-semibold text-sun">{t('Try Dobry for your own courses')} →</Link>
          <div className="mt-5">
            <LanguageSwitch className="!bg-white/10 [&_[aria-pressed=false]]:!text-white/70" />
          </div>
        </div>
      </div>
    </div>
  )
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="px-6 py-14 text-center">
      <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted">{text}</p>
    </div>
  )
}
