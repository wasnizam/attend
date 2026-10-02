import { QRCodeSVG } from 'qrcode.react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { Logo, buttonClass } from '../components/ui'
import { EDITIONS, type Edition, type EditionId, editionById, rememberEdition } from '../lib/editions'
import { t } from '../lib/i18n'
import { setPurpose } from '../lib/purpose'

/** An illustration of the live screen, built from the same pieces the product uses. */
function ProductPreview({ edition }: { edition: Edition }) {
  const { rows, title, time, counted } = edition.preview
  return (
    <div aria-hidden className="relative mx-auto mt-16 max-w-4xl">
      <div className="absolute -inset-x-10 -top-10 bottom-0 -z-10 rounded-[2.5rem] bg-gradient-to-b from-indigo-100/70 to-transparent blur-2xl" />
      <div className="overflow-hidden rounded-xl bg-white text-left shadow-pop">
        <div className="flex items-center gap-1.5 border-b border-line bg-slate-50 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-slate-300" />
          <span className="size-2.5 rounded-full bg-slate-300" />
          <span className="size-2.5 rounded-full bg-slate-300" />
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-[15rem_1fr] sm:p-6">
          <div className="rounded-lg p-4 text-center shadow-card">
            <p className="text-sm font-semibold tracking-tight">{title}</p>
            <p className="text-xs text-muted">{time}</p>
            <p className="tabular mt-2 text-xl font-semibold">38 / 42 <span className="text-muted">{t(counted)}</span></p>
            <QRCodeSVG value="https://attend.example.com/session/8K72QF" level="M" marginSize={1} className="mx-auto mt-3" style={{ width: '9rem', height: '9rem' }} />
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-good-soft px-2 py-0.5 text-xs font-medium text-good">
              <span className="size-1.5 rounded-full bg-good" />
              {t('Session Active')}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-muted">{t('LIVE ATTENDANCE')}</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[[t('Present'), '38'], [t('Absent'), '4'], [t('Attendance'), '90.5%']].map(([label, value]) => (
                <div key={label} className="rounded-lg px-3 py-2 shadow-card">
                  <p className="text-[11px] text-muted">{label}</p>
                  <p className="tabular text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 overflow-hidden rounded-lg text-sm shadow-card">
              {rows.map(([id, name, time], i) => (
                <div key={id} className={`flex items-center gap-3 px-3 py-2 ${i ? 'border-t border-line' : ''}`}>
                  <span className="tabular w-14 font-medium">{id}</span>
                  <span className="flex-1">{name}</span>
                  <span className="tabular text-muted">{time}</span>
                  <span className="text-xs font-medium text-good">{t('Present')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Landing({ show }: { show?: EditionId }) {
  const edition = editionById(show) ?? EDITIONS[0]
  const signup = `/signup?for=${edition.id}`
  // The page is written in each group's own words already; no vocabulary swaps on top.
  setPurpose('education')
  useEffect(() => {
    rememberEdition(edition.id)
    document.title = `Attend · ${t(edition.headline)}`
  }, [edition])
  return (
    <div className="min-h-dvh bg-white">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-5">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
              <a href="#features" className="hover:text-ink">{t('Features')}</a>
              <a href="#how" className="hover:text-ink">{t('How it works')}</a>
              <a href="#pricing" className="hover:text-ink">{t('Pricing')}</a>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <LanguageSwitch />
            </div>
            <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-slate-700 hover:bg-slate-100">
              {t('Log in')}
            </Link>
            <Link to={signup} className={buttonClass()}>
              {t('Start Free')}
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pt-16 pb-20 text-center sm:pt-24">
        <nav aria-label={t('Attend for')} className="mx-auto inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 p-1 text-sm font-medium">
          <span className="hidden pr-1 pl-3 text-muted sm:inline">{t('Attend for')}</span>
          {EDITIONS.map((e) => (
            <Link
              key={e.id}
              to={`/${e.id}`}
              replace
              aria-current={e.id === edition.id ? 'page' : undefined}
              className={`rounded-full px-3.5 py-1.5 whitespace-nowrap transition ${e.id === edition.id ? 'bg-white text-ink shadow-card' : 'text-slate-600 hover:text-ink'}`}
            >
              {t(e.label)}
            </Link>
          ))}
        </nav>
        <p className="mt-8 text-sm font-semibold text-accent">{t(edition.badge)}</p>
        <h1 className="mx-auto mt-3 max-w-3xl text-5xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl">
          {t(edition.headline)}
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-slate-600 sm:text-xl">
          {t(edition.sub)}
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to={signup} className={buttonClass({ size: 'lg' })}>
            {t('Start Free')}
          </Link>
          <a href="#how" className={buttonClass({ size: 'lg', variant: 'secondary' })}>
            {t('See How It Works')}
          </a>
        </div>
        <p className="mt-4 text-sm text-muted">{t(edition.note)}</p>
        <ProductPreview edition={edition} />
      </section>

      <section id="features" className="scroll-mt-16 border-y border-line bg-canvas py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-accent">{t('Features')}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{t(edition.featuresTitle)}</h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {edition.features.map(([icon, title, text]) => (
              <div key={title} className="rounded-xl bg-white p-6 shadow-card">
                <span className="flex size-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={icon} />
                  </svg>
                </span>
                <h3 className="mt-4 font-semibold tracking-tight">{t(title)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t(text)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-16 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-accent">{t('How it works')}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{t('Three steps. About a minute.')}</h2>
          </div>
          <ol className="mt-12 grid gap-8 sm:grid-cols-3">
            {edition.steps.map(([title, text]) => (
              <li key={title} className="border-t-2 border-accent pt-5">
                <h3 className="text-xl font-semibold tracking-tight">{t(title)}</h3>
                <p className="mt-2 text-slate-600">{t(text)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-16 border-y border-line bg-canvas py-20">
        <div className="mx-auto max-w-4xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-accent">{t('Pricing')} · {t(edition.label)}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{t('Start free. Pay only when you need more.')}</h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {([['Free', 'RM0', 'Free forever', edition.free], ['Pro', '', edition.billing, edition.pro]] as const).map(([name, price, billing, items]) => (
              <div key={name} className={`flex flex-col rounded-xl bg-white p-6 shadow-card ${name === 'Pro' ? 'ring-2 ring-accent' : ''}`}>
                <h3 className="font-semibold tracking-tight">{t(name)}</h3>
                <p className={`mt-3 font-semibold tracking-tight ${price ? 'tabular text-4xl' : 'text-2xl leading-10'}`}>{price || t('Price announced soon')}</p>
                <p className="mt-1 text-sm text-muted">{t(billing)}</p>
                <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-700">
                  {items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-good" aria-hidden>✓</span>
                      {t(item)}
                    </li>
                  ))}
                </ul>
                <Link to={signup} className={`${buttonClass({ size: 'lg', variant: name === 'Pro' ? 'primary' : 'secondary' })} mt-6`}>
                  {t('Start Free')}
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-muted">{t('Early access: everything is free for everyone for now. We will tell you before that changes.')}</p>
        </div>
      </section>

      <section className="px-5 pt-20 pb-20">
        <div className="mx-auto max-w-6xl rounded-2xl bg-ink px-6 py-14 text-center text-white sm:py-16">
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {t(edition.cta)}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">{t('Free to start. Ready in under a minute.')}</p>
          <Link to={signup} className={`${buttonClass({ size: 'lg' })} mt-8 !bg-white !text-ink hover:!bg-slate-100`}>
            {t('Start Free')}
          </Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-muted sm:flex-row">
          <div className="flex items-center gap-3">
            <Logo className="!text-base text-ink" />
            <span>{t('Start a session. Share the QR. Attendance is done.')}</span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitch />
            <span>© {new Date().getFullYear()} Attend</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
