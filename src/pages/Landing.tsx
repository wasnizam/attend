import { useLaunch, usePlans } from '../lib/pricing'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Snapshots, TrustSection } from '../components/LandingProof'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { Logo, buttonClass } from '../components/ui'
import { inMalaysia, setCurrency, useCurrency } from '../lib/currency'
import { EDITIONS, type Edition, type EditionId, editionById, rememberEdition } from '../lib/editions'
import { t } from '../lib/i18n'
import { PAYMENTS_OPEN } from '../lib/plan'
import { setPurpose } from '../lib/purpose'

const FAQ = [
  ['Do we need to buy a machine or a tablet?', 'No. Show the QR on any screen you already have: a laptop, a tablet, a TV or the projector. People scan it with their own phone camera, with no app to install.'],
  ['Do people need to install an app or make an account?', 'No. They scan the QR with their phone camera and type their ID. That is all.'],
  ['Can someone send the QR to a friend who is not there?', 'With the rotating QR, a photo or a shared link stops working within a minute. Turn on the location check as well to flag or refuse anyone who is somewhere else.'],
  ['What if someone has no phone or no internet?', 'You can mark them present by hand in two taps, during the session or after it.'],
  ['Is it really free?', 'Yes. The free plan stays free, and you can do real work on it. You only pay if you need more than it includes.'],
  ['Can I get my data out?', 'Yes. Lists and reports can be exported to Excel, and your records stay yours.'],
  ['Is our data safe?', 'Each organisation’s records are kept apart and protected by access rules on Google Cloud (Firebase): people see only what their role allows, attendance times cannot be changed by the person who clocked in, and anyone added by hand is labelled as such.'],
]

/** Icon tiles on the feature cards, in turn: one bright colour each. */
const TILE = ['bg-indigo-100 text-indigo-600', 'bg-amber-100 text-amber-600', 'bg-emerald-100 text-emerald-600', 'bg-rose-100 text-rose-600', 'bg-sky-100 text-sky-600', 'bg-violet-100 text-violet-600']

/** People arriving in the live demo, in turn. */
const ARRIVALS = ['Sarah Lee', 'Kumar Raj', 'Mei Ling', 'Daniel Cruz', 'Aisha Bello', 'Ravi Shah', 'Grace Kim', 'Omar Haddad', 'Lucas Silva', 'Nadia Rahman']
const AVATAR = ['bg-sun text-night', 'bg-emerald-300 text-emerald-950', 'bg-sky-300 text-sky-950', 'bg-rose-300 text-rose-950', 'bg-violet-300 text-violet-950']
const initials = (name: string) => name.split(' ').map((w) => w[0]).join('').slice(0, 2)

/**
 * An animated illustration of Attend at work: the door screen with its changing QR, a phone that
 * has just scanned it, and the live list filling up. Every few seconds someone new arrives.
 */
function LiveDemo({ edition }: { edition: Edition }) {
  const { title, time, counted } = edition.preview
  // Arrival number: starts at 3 so the first frame already shows a full list.
  const [n, setN] = useState(3)
  const [left, setLeft] = useState(45)
  useEffect(() => {
    // Still frame for anyone who prefers less motion.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const arrive = setInterval(() => setN((x) => (x >= 40 ? 3 : x + 1)), 2600)
    const tick = setInterval(() => setLeft((x) => (x <= 1 ? 45 : x - 1)), 1000)
    return () => {
      clearInterval(arrive)
      clearInterval(tick)
    }
  }, [])
  const total = 42
  const inNow = 30 + Math.round(((n - 3) * 12) / 37)
  // The newest four arrivals, newest first; times step on a minute each.
  const list = [0, 1, 2, 3].map((k) => {
    const i = n - k
    // One arrival a minute from 8:20, so the newest is always latest.
    const at = 8 * 60 + 17 + i
    return { key: i, name: ARRIVALS[i % ARRIVALS.length], time: `${Math.floor(at / 60)}:${String(at % 60).padStart(2, '0')}`, colour: AVATAR[i % AVATAR.length] }
  })
  const newest = list[0]
  const ring = 2 * Math.PI * 18
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-xl lg:max-w-none">
      <div className="overflow-hidden rounded-2xl bg-white text-left text-ink shadow-[0_30px_80px_-20px_rgb(0_0_0/0.55)] ring-1 ring-white/20">
        <div className="flex items-center gap-1.5 border-b border-line bg-slate-50 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-rose-300" />
          <span className="size-2.5 rounded-full bg-sun" />
          <span className="size-2.5 rounded-full bg-emerald-300" />
          <span className="ml-3 truncate text-xs text-muted">{title} · {time}</span>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-[11.5rem_1fr] sm:p-5">
          <div className="rounded-xl bg-night p-4 text-center text-white">
            <p className="text-[11px] font-semibold tracking-wider text-white/60">{t('SCAN TO CLOCK IN')}</p>
            <div className="relative mx-auto mt-3 w-fit rounded-lg bg-white p-2">
              <QRCodeSVG value={`https://attend.example.com/door?t=${left}`} level="M" marginSize={0} style={{ width: '7.5rem', height: '7.5rem' }} />
              <span className="animate-scan absolute inset-x-1 h-0.5 rounded-full bg-sun shadow-[0_0_12px_2px_rgb(255_200_61/0.8)]" />
            </div>
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-white/70">
              <svg viewBox="0 0 40 40" className="size-6 -rotate-90">
                <circle cx="20" cy="20" r="18" fill="none" stroke="rgb(255 255 255 / 0.15)" strokeWidth="4" />
                <circle cx="20" cy="20" r="18" fill="none" stroke="var(--color-sun)" strokeWidth="4" strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={ring * (1 - left / 45)} className="transition-[stroke-dashoffset] duration-1000 ease-linear" />
              </svg>
              <span className="tabular">{t('New code in {s}s', { s: left })}</span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] font-semibold tracking-wider text-muted">{t('LIVE ATTENDANCE')}</p>
              <p className="tabular text-sm font-semibold">{inNow} / {total} <span className="font-medium text-muted">{t(counted)}</span></p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-[width] duration-700" style={{ width: `${(inNow / total) * 100}%` }} />
            </div>
            <ul className="mt-3 overflow-hidden rounded-lg text-sm shadow-card">
              {list.map((r, i) => (
                <li key={r.key} className={`flex items-center gap-3 px-3 py-2 ${i ? 'border-t border-line' : 'animate-slidein'}`}>
                  <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${r.colour}`}>{initials(r.name)}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                  <span className="tabular text-muted">{r.time}</span>
                  <span className="rounded-full bg-good-soft px-2 py-0.5 text-[11px] font-semibold text-good">{t('In')}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      {/* The staff member's own phone, just after scanning. */}
      <div className="animate-bob absolute -right-3 -bottom-28 hidden w-36 rounded-[1.6rem] bg-night p-1.5 shadow-[0_24px_50px_-12px_rgb(0_0_0/0.6)] ring-1 ring-white/25 sm:block lg:-right-8">
        <div className="rounded-[1.25rem] bg-white px-3 pt-4 pb-5 text-center text-ink">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
          <span key={newest.key} className="animate-pop mx-auto flex size-11 items-center justify-center rounded-full bg-good text-white">
            <svg viewBox="0 0 20 20" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 10.5 3.2 3L15 7" /></svg>
          </span>
          <p className="mt-2 text-sm font-semibold">{t('Clocked in')}</p>
          <p className="tabular text-xs text-muted">{newest.time} AM</p>
          <p className="mt-2 truncate text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{newest.name}</p>
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
    document.title = `Attend · ${t(edition.headline).replace(/\s*\|\s*/g, ' ')}`
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

      <section className="relative isolate overflow-hidden bg-night text-white">
        {/* Glow and a faint dot grid: depth without a picture. */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_85%_10%,rgb(255_200_61/0.18),transparent_60%),radial-gradient(50rem_30rem_at_0%_100%,rgb(99_102_241/0.45),transparent_60%)]" />
        <div aria-hidden className="absolute inset-0 -z-10 [background-image:radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 pt-12 pb-24 sm:pb-36 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-32">
          <div className="text-center lg:text-left">
            <nav aria-label={t('Attend for')} className="inline-flex max-w-full items-center gap-1 rounded-full bg-white/10 p-1 text-sm font-medium ring-1 ring-white/15">
              <span className="hidden pr-1 pl-3 text-white/60 sm:inline">{t('Attend for')}</span>
              {EDITIONS.map((e) => (
                <Link
                  key={e.id}
                  to={`/${e.id}`}
                  replace
                  aria-current={e.id === edition.id ? 'page' : undefined}
                  className={`rounded-full px-3.5 py-1.5 whitespace-nowrap transition ${e.id === edition.id ? 'bg-white text-night shadow-card' : 'text-white/75 hover:text-white'}`}
                >
                  {t(e.label)}
                </Link>
              ))}
            </nav>
            <p className="mt-8 inline-flex items-center gap-2 rounded-full bg-sun/15 px-3 py-1 text-sm font-semibold text-sun ring-1 ring-sun/30">
              <span className="size-1.5 animate-pulse rounded-full bg-sun" />
              {t(edition.badge)}
            </p>
            <h1 className="mt-5 font-display text-5xl leading-[1.02] font-bold tracking-tight text-balance sm:text-6xl lg:text-7xl">
              {/* A headline may choose its own line break with "|"; the last line is the punchline. */}
              {t(edition.headline).split('|').map((line, i, all) => (
                <span key={i} className={`block ${i === all.length - 1 && all.length > 1 ? 'relative w-fit text-sun max-lg:mx-auto' : ''}`}>
                  {line.trim()}
                  {i === all.length - 1 && all.length > 1 && (
                    <svg aria-hidden viewBox="0 0 300 20" preserveAspectRatio="none" className="absolute -bottom-3 left-0 h-3 w-full text-sun/70">
                      <path d="M3 14 C 70 4, 150 4, 297 10" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
                    </svg>
                  )}
                </span>
              ))}
            </h1>
            <p className="mx-auto mt-8 max-w-xl text-lg text-indigo-100/85 sm:text-xl lg:mx-0">
              {t(edition.sub)}
            </p>
            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Link to={signup} className={`${buttonClass({ size: 'lg' })} !bg-sun !text-night shadow-[0_10px_30px_-8px_rgb(255_200_61/0.7)] hover:!bg-sun-strong`}>
                {t('Start Free')}
                <span aria-hidden>→</span>
              </Link>
              <a href="#how" className={`${buttonClass({ size: 'lg', variant: 'secondary' })} !bg-white/10 !text-white ring-1 ring-white/25 hover:!bg-white/15`}>
                {t('See How It Works')}
              </a>
            </div>
            <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-indigo-100/80 lg:justify-start">
              {[edition.note, 'Free to start. No card needed.', 'Works on any phone.'].map((line) => (
                <li key={line} className="flex items-center gap-1.5">
                  <svg viewBox="0 0 20 20" className="size-4 text-emerald-300" fill="currentColor" aria-hidden>
                    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.700-9.300a1 1 0 0 0-1.400-1.400L9 10.600 7.700 9.300a1 1 0 0 0-1.400 1.400l2 2a1 1 0 0 0 1.400 0l4-4Z" clipRule="evenodd" />
                  </svg>
                  {t(line)}
                </li>
              ))}
            </ul>
          </div>
          <LiveDemo edition={edition} />
        </div>
      </section>

      {/* Four plain facts, big and bright. */}
      <section aria-label={t('Attend in numbers')} className="border-b border-line bg-white">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-line sm:grid-cols-4">
          {[
            ['45s', 'A new QR code, every 45 seconds', 'text-accent'],
            ['0', 'Machines to buy', 'text-amber-500'],
            ['0', 'Apps for anyone to install', 'text-emerald-600'],
            ['Live', 'See who is in, right now', 'text-rose-500'],
          ].map(([big, label, colour]) => (
            <div key={label} className="bg-white px-5 py-7 text-center">
              <dt className="sr-only">{t(label)}</dt>
              <dd className={`tabular font-display text-4xl font-bold tracking-tight ${colour}`}>{big}</dd>
              <dd className="mt-1 text-sm text-slate-600">{t(label)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="without" className="bg-amber-50/70 py-16">
        <div className="mx-auto grid max-w-5xl items-center gap-8 px-5 md:grid-cols-[1fr_1.1fr]">
          <div>
            <h2 id="without" className="font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">{t(edition.without.title)}</h2>
            <p className="mt-3 text-slate-600">{t(edition.without.need)}</p>
            {edition.without.focus && <p className="mt-2 font-medium text-ink">{t(edition.without.focus)}</p>}
            {edition.without.saving && (
              <p className="mt-4 rounded-lg bg-good-soft px-4 py-3 text-sm font-medium text-good">
                {t(typeof edition.without.saving === 'string' ? edition.without.saving : edition.without.saving[currency])}
              </p>
            )}
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {edition.without.skip.map((item) => (
              <li key={item} className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-medium shadow-card">
                <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-bad-soft text-xs font-bold text-bad">✕</span>
                <span><span className="sr-only">{t('Not needed')}: </span>{t(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <TrustSection edition={edition} />
      <Snapshots edition={edition} />

      <section id="features" className="scroll-mt-16 border-y border-line bg-canvas py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-accent">{t('Features')}</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-balance sm:text-5xl">{t(edition.featuresTitle)}</h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {edition.features.map(([icon, title, text], i) => (
              <div key={title} className="group rounded-2xl bg-white p-6 shadow-card transition hover:-translate-y-1 hover:shadow-pop">
                <span className={`flex size-11 items-center justify-center rounded-xl transition group-hover:scale-110 ${TILE[i % TILE.length]}`}>
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

      <section id="how" className="scroll-mt-16 bg-gradient-to-b from-indigo-50 to-white py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-accent">{t('How it works')}</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-balance sm:text-5xl">{t('Three steps. About a minute.')}</h2>
          </div>
          <ol className="relative mt-12 grid gap-4 sm:grid-cols-3">
            <span aria-hidden className="absolute top-12 right-[16%] left-[16%] hidden border-t-2 border-dashed border-indigo-200 sm:block" />
            {edition.steps.map(([title, text], i) => (
              <li key={title} className="relative rounded-2xl bg-white p-6 shadow-card">
                <span className={`tabular flex size-12 items-center justify-center rounded-2xl font-display text-xl font-bold ${['bg-accent text-white', 'bg-sun text-night', 'bg-emerald-500 text-white'][i % 3]}`}>{i + 1}</span>
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
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-balance sm:text-5xl">{t('Start free. Pay only when you need more.')}</h2>
            {/* Ringgit is offered only in Malaysia; everyone else simply sees US dollars. */}
            {inMalaysia() && <div className="mt-5">
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
            </div>}
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
                {!PAYMENTS_OPEN && (
                  // Kept as an empty space on the free plan, so every card's list starts on the same line.
                  <span aria-hidden={/^(RM|\$)0$/.test(plan.price[currency]) || undefined} className={`mt-2 inline-flex w-fit rounded-full bg-[#fff4d6] px-2.5 py-0.5 text-xs font-semibold text-[#8a5a00] ${/^(RM|\$)0$/.test(plan.price[currency]) ? 'invisible' : ''}`}>{t('Opens soon')}</span>
                )}
                <p className="mt-1.5 min-h-5 text-sm text-muted">{plan.alt ? t(typeof plan.alt === 'string' ? plan.alt : plan.alt[currency]) : ''}</p>
                <ul className="mt-5 flex-1 space-y-2.5 border-t border-line pt-5 text-sm text-slate-700">
                  {plan.items.map((item) => {
                    const no = item.startsWith('✕ ')
                    return (
                      <li key={item} className={`flex gap-2 ${no ? 'text-slate-400' : ''}`}>
                        <span className={no ? '' : 'text-good'} aria-hidden>{no ? '✕' : '✓'}</span>
                        {no ? <span><span className="sr-only">{t('Not included')}: </span>{t(item.slice(2))}</span> : t(item)}
                      </li>
                    )
                  })}
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
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-balance sm:text-5xl">{t('Good to know before you start')}</h2>
          </div>
          <div className="mt-10 divide-y divide-line border-y border-line">
            {[...FAQ, ...(edition.faq ?? [])].map(([q, a]) => (
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
        <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-3xl bg-night px-6 py-14 text-center text-white sm:py-20">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(40rem_20rem_at_50%_0%,rgb(255_200_61/0.22),transparent_70%),radial-gradient(40rem_20rem_at_50%_120%,rgb(99_102_241/0.5),transparent_70%)]" />
          <h2 className="mx-auto max-w-2xl font-display text-3xl font-bold tracking-tight text-balance sm:text-5xl">
            {t(edition.cta)}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">{t('Free to start. Ready in under a minute.')}</p>
          <Link to={signup} className={`${buttonClass({ size: 'lg' })} mt-8 !bg-sun !text-night shadow-[0_10px_30px_-8px_rgb(255_200_61/0.7)] hover:!bg-sun-strong`}>
            {t('Start Free')}
            <span aria-hidden>→</span>
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
