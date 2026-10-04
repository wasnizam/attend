import { useLaunch, usePlans } from '../lib/pricing'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Snapshots, TrustSection } from '../components/LandingProof'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { Logo, buttonClass } from '../components/ui'
import { setCurrency, useCurrency } from '../lib/currency'
import { EDITIONS, type Edition, type EditionId, editionById, rememberEdition } from '../lib/editions'
import { t } from '../lib/i18n'
import { PAYMENTS_OPEN } from '../lib/plan'
import { setPurpose } from '../lib/purpose'

const FAQ = [
  ['Do people need to install an app or make an account?', 'No. They scan the QR with their phone camera and type their ID. That is all.'],
  ['Can someone send the QR to a friend who is not there?', 'With the rotating QR, a photo or a shared link stops working within a minute. Turn on the location check as well to flag or refuse anyone who is somewhere else.'],
  ['What if someone has no phone or no internet?', 'You can mark them present by hand in two taps, during the session or after it.'],
  ['Is it really free?', 'Yes. The free plan stays free, and you can do real work on it. You only pay if you need more than it includes.'],
  ['Can I get my data out?', 'Yes. Every list and report can be exported to Excel.'],
]

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
  // Prices come from the back office's price list (the code's prices until one is saved).
  const plans = usePlans(edition)
  // Before payment opens: what a new account of this edition gets now (free plan, or early access).
  const startsOn = useLaunch()[edition.id]
  const freeLimit = plans.find((p) => /^(RM|\$)0$/.test(p.price.myr))?.items[0] ?? edition.plans[0]?.items[0] ?? ''
  const signup = `/signup?for=${edition.id}`
  const currency = useCurrency()
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
              <a href="#trust" className="hover:text-ink">{t('Why Attend')}</a>
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
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-600">
          {[edition.note, 'Free to start. No card needed.', 'Works on any phone.'].map((line) => (
            <li key={line} className="flex items-center gap-1.5">
              <svg viewBox="0 0 20 20" className="size-4 text-good" fill="currentColor" aria-hidden>
                <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.700-9.300a1 1 0 0 0-1.400-1.400L9 10.600 7.700 9.300a1 1 0 0 0-1.400 1.400l2 2a1 1 0 0 0 1.400 0l4-4Z" clipRule="evenodd" />
              </svg>
              {t(line)}
            </li>
          ))}
        </ul>
        <ProductPreview edition={edition} />
      </section>

      <TrustSection edition={edition} />
      <Snapshots edition={edition} />

      <section id="features" className="scroll-mt-16 border-y border-line bg-canvas py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-accent">{t('Features')}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t(edition.featuresTitle)}</h2>
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
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t('Three steps. About a minute.')}</h2>
          </div>
          <ol className="mt-12 grid gap-4 sm:grid-cols-3">
            {edition.steps.map(([title, text], i) => (
              <li key={title} className="rounded-xl bg-canvas p-6">
                <span className="tabular flex size-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">{i + 1}</span>
                <h3 className="mt-4 text-lg font-semibold tracking-tight">{t(title).replace(/^\d+\.\s*/, '')}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t(text)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-16 border-y border-line bg-canvas py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-accent">{t('Pricing')} · {t(edition.label)}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t('Start free. Pay only when you need more.')}</h2>
            <div className="mt-5">
              <div role="group" aria-label={t('Currency')} className="inline-flex rounded-full bg-slate-100 p-0.5 text-xs font-semibold">
                {(['myr', 'usd'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={currency === c}
                    onClick={() => setCurrency(c)}
                    className={`rounded-full px-3 py-1 transition ${currency === c ? 'bg-white text-ink shadow-card' : 'text-slate-600 hover:text-ink'}`}
                  >
                    {c === 'myr' ? 'RM' : 'USD'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={`mt-12 grid gap-4 sm:grid-cols-2 ${plans.length > 2 ? 'lg:grid-cols-4' : 'mx-auto max-w-4xl'}`}>
            {plans.map((plan) => (
              <div key={plan.name} className={`flex flex-col rounded-2xl bg-white p-6 ${plan.best ? 'shadow-pop ring-2 ring-accent' : 'shadow-card'}`}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold tracking-tight">{t(plan.name)}</h3>
                  {plan.best && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-accent">{t('Most popular')}</span>}
                </div>
                <p className="mt-4 flex items-baseline gap-1.5">
                  <span className="tabular text-4xl font-semibold tracking-tight">{plan.price[currency]}</span>
                  <span className="text-sm text-muted">{t(plan.per)}</span>
                </p>
                {!PAYMENTS_OPEN && !/^(RM|\$)0$/.test(plan.price[currency]) && (
                  <span className="mt-2 inline-flex w-fit rounded-full bg-[#fff4d6] px-2.5 py-0.5 text-xs font-semibold text-[#8a5a00]">{t('Opens soon')}</span>
                )}
                <p className="mt-1.5 min-h-5 text-sm text-muted">{plan.alt ? t(typeof plan.alt === 'string' ? plan.alt : plan.alt[currency]) : ''}</p>
                <ul className="mt-5 flex-1 space-y-2.5 border-t border-line pt-5 text-sm text-slate-700">
                  {plan.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-good" aria-hidden>✓</span>
                      {t(item)}
                    </li>
                  ))}
                </ul>
                <Link to={signup} className={`${buttonClass({ size: 'lg', variant: plan.best ? 'primary' : 'secondary' })} mt-6`}>
                  {t('Start Free')}
                </Link>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-balance text-muted">
            {PAYMENTS_OPEN
              ? t('Every new account gets Pro free for 14 days. No card needed. Stop paying and your records stay, ready to view and export.')
              : startsOn === 'free'
                ? t('Paid plans open soon; the prices above are what they will cost. Until then you start free: {limit}. You will be told before anything changes.', { limit: t(freeLimit).toLowerCase() })
                : t('Payment is not open yet, so everything is free for now. When it opens, every account gets Pro free for 14 days first.')}
          </p>
        </div>
      </section>

      <section id="faq" className="scroll-mt-16 py-20">
        <div className="mx-auto max-w-3xl px-5">
          <div className="text-center">
            <p className="text-sm font-semibold text-accent">{t('Questions')}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t('Good to know before you start')}</h2>
          </div>
          <div className="mt-10 divide-y divide-line border-y border-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold tracking-tight [&::-webkit-details-marker]:hidden">
                  {t(q)}
                  <span aria-hidden className="text-xl font-normal text-muted transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 leading-relaxed text-slate-600">{t(a)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-20">
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
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 text-sm sm:grid-cols-[1fr_auto_auto] sm:gap-16">
          <div>
            <Logo className="!text-base text-ink" />
            <p className="mt-3 max-w-xs text-muted">{t('Start a session. Share the QR. Attendance is done.')}</p>
          </div>
          <div>
            <p className="font-semibold">{t('Attend for')}</p>
            <ul className="mt-3 space-y-2 text-slate-600">
              {EDITIONS.map((e) => (
                <li key={e.id}>
                  <Link to={`/${e.id}`} className="hover:text-ink">{t(e.label)}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold">{t('Product')}</p>
            <ul className="mt-3 space-y-2 text-slate-600">
              <li><a href="#trust" className="hover:text-ink">{t('Why Attend')}</a></li>
              <li><a href="#pricing" className="hover:text-ink">{t('Pricing')}</a></li>
              <li><a href="#faq" className="hover:text-ink">{t('Questions')}</a></li>
              <li><Link to="/login" className="hover:text-ink">{t('Log in')}</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 text-sm text-muted">
            <span>© {new Date().getFullYear()} Attend</span>
            <LanguageSwitch />
          </div>
        </div>
      </footer>
    </div>
  )
}
