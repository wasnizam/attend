import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { TrustSection } from '../components/LandingProof'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { Logo, buttonClass } from '../components/ui'
import { EDITIONS, type Edition, type EditionId } from '../lib/editions'
import { t } from '../lib/i18n'
import { setPurpose } from '../lib/purpose'
import { LiveDemo } from './Landing'

/** The demo on the home page: no one group's words. */
const DEMO: Pick<Edition, 'id' | 'preview'> = { id: 'trainers', preview: { title: 'TODAY', time: '9:00 AM', counted: 'PRESENT', rows: [] } }

/** The three doors. [edition, icon path, tile colours, title, text, three points] */
const DOORS: [EditionId, string, string, string, string, string[]][] = [
  [
    'lecturers',
    'M12 4 2 9l10 5 10-5-10-5ZM6 11.500V16c0 1.500 2.700 3 6 3s6-1.500 6-3v-4.500M22 9v5',
    'bg-indigo-100 text-indigo-600',
    'For lecturers',
    'Attendance for a full lecture hall in seconds, ready for your university portal.',
    ['No signing for friends', 'Semester reports and warning letters', 'One-click export to your portal'],
  ],
  [
    'trainers',
    'M3 4h18v11H3zM12 15v3M8 21l4-3 4 3M8 9h8M8 12h5',
    'bg-amber-100 text-amber-600',
    'For trainers and organisers',
    'Check people in at courses, workshops and seminars, with a clean record for your client.',
    ['No app for participants to install', 'See who is absent, by name', 'Course reports for your client'],
  ],
  [
    'workplace',
    'M3 21h18M5 21V5l7-2v18M12 21V9l7 2v10M8 9h1M8 13h1M8 17h1M15 13h1M15 17h1',
    'bg-emerald-100 text-emerald-600',
    'For workplaces',
    'Staff clock in and out with their own phone. See who is in, late or on leave.',
    ['No machine to buy', 'Hours, overtime and leave', 'Many offices and shifts'],
  ],
]

const STEPS: [string, string][] = [
  ['Show the QR', 'Put it on any screen you already have: a laptop, a projector, a TV or a tablet at the door.'],
  ['People scan', 'They use their own phone camera. No app to install and no account to make.'],
  ['The list fills itself', 'Names appear the moment people scan. Reports are ready when you need them.'],
]

/** What is true for every group. */
const TRUST: Pick<Edition, 'trust'> = {
  trust: {
    title: 'Attendance you can trust',
    sub: 'A paper list is easy to sign for a friend. Dobry is not.',
    cards: [
      ['qr', 'A QR that changes every 45 seconds', 'A photo or a forwarded link of the QR is useless a moment later. Only people in front of the screen can scan it.'],
      ['phone', 'One phone per person', 'Each phone can record one person only, so nobody scans for a friend.'],
      ['geo', 'Location check (geofence)', 'Set a distance around your place. A scan from outside it is flagged for you, or refused.'],
    ],
  },
}

const sunButton = `${buttonClass({ size: 'lg' })} !bg-sun !text-night shadow-[0_10px_30px_-8px_rgb(255_200_61/0.7)] hover:!bg-sun-strong`

/** The front door of Dobry: what it is, in a few seconds, and which of the three editions is yours. */
export function Home() {
  setPurpose('education')
  useEffect(() => {
    document.title = `Dobry · ${t('Attendance in seconds')}`
  }, [])
  return (
    <div className="min-h-dvh bg-white">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-5">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
              <a href="#who" className="hover:text-ink">{t('Who it is for')}</a>
              <a href="#how" className="hover:text-ink">{t('How it works')}</a>
              <a href="#trust" className="hover:text-ink">{t('Why Dobry')}</a>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <LanguageSwitch />
            </div>
            <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-slate-700 hover:bg-slate-100">
              {t('Log in')}
            </Link>
            <a href="#who" className={buttonClass()}>
              {t('Start Free')}
            </a>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-night text-white">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_85%_10%,rgb(255_200_61/0.18),transparent_60%),radial-gradient(50rem_30rem_at_0%_100%,rgb(99_102_241/0.45),transparent_60%)]" />
        <div aria-hidden className="absolute inset-0 -z-10 [background-image:radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 pt-12 pb-24 sm:pb-52 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-40">
          <div className="text-center lg:text-left">
            <p className="inline-flex items-center gap-2 rounded-full bg-sun/15 px-3 py-1 text-sm font-semibold text-sun ring-1 ring-sun/30">
              <span className="size-1.5 animate-pulse rounded-full bg-sun" />
              {t('QR attendance for classes, courses and workplaces')}
            </p>
            <h1 className="mt-5 font-display text-5xl leading-[1.02] font-bold tracking-tight text-balance sm:text-6xl lg:text-7xl">
              <span className="block">{t('Attendance in seconds.')}</span>
              <span className="relative block w-fit text-sun max-lg:mx-auto">
                {t('Scan, and it’s done.')}
                <svg aria-hidden viewBox="0 0 300 20" preserveAspectRatio="none" className="absolute -bottom-3 left-0 h-3 w-full text-sun/70">
                  <path d="M3 14 C 70 4, 150 4, 297 10" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
                </svg>
              </span>
            </h1>
            <p className="mx-auto mt-8 max-w-xl text-lg text-indigo-100/85 sm:text-xl lg:mx-0">
              {t('Show a QR on any screen. People scan it with their own phone, and you know who is here. No machine to buy, no app to install.')}
            </p>
            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <a href="#who" className={sunButton}>
                {t('Choose your Dobry')}
                <span aria-hidden>↓</span>
              </a>
              <a href="#how" className={`${buttonClass({ size: 'lg', variant: 'secondary' })} !bg-white/10 !text-white ring-1 ring-white/25 hover:!bg-white/15`}>
                {t('See How It Works')}
              </a>
            </div>
            <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-indigo-100/80 lg:justify-start">
              {['Free to start. No card needed.', 'Works on any phone.', 'Ready in under a minute.'].map((line) => (
                <li key={line} className="flex items-center gap-1.5">
                  <svg viewBox="0 0 20 20" className="size-4 text-emerald-300" fill="currentColor" aria-hidden>
                    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.700-9.300a1 1 0 0 0-1.400-1.400L9 10.600 7.700 9.300a1 1 0 0 0-1.400 1.400l2 2a1 1 0 0 0 1.400 0l4-4Z" clipRule="evenodd" />
                  </svg>
                  {t(line)}
                </li>
              ))}
            </ul>
          </div>
          <LiveDemo edition={DEMO} />
        </div>
      </section>

      <section id="who" className="scroll-mt-16 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-accent">{t('Who it is for')}</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-balance sm:text-5xl">{t('One Dobry, made three ways')}</h2>
            <p className="mt-3 text-slate-600">{t('Pick yours. Each one speaks your language and has only what you need.')}</p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {DOORS.map(([id, icon, tile, title, text, points]) => (
              <Link key={id} to={`/${id}`} className="group flex flex-col rounded-3xl bg-white p-7 shadow-card transition hover:-translate-y-1 hover:shadow-pop">
                <span className={`flex size-14 items-center justify-center rounded-2xl transition group-hover:scale-110 ${tile}`}>
                  <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={icon} />
                  </svg>
                </span>
                <h3 className="mt-5 font-display text-2xl font-bold tracking-tight">{t(title)}</h3>
                <p className="mt-2 leading-relaxed text-slate-600">{t(text)}</p>
                <ul className="mt-5 flex-1 space-y-2 border-t border-line pt-5 text-sm text-slate-700">
                  {points.map((point) => (
                    <li key={point} className="flex gap-2">
                      <span className="text-good" aria-hidden>✓</span>
                      {t(point)}
                    </li>
                  ))}
                </ul>
                <span className="mt-6 inline-flex items-center gap-1.5 font-semibold text-accent">
                  {t('See more')}
                  <span aria-hidden className="transition group-hover:translate-x-1">→</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-16 border-t border-line bg-gradient-to-b from-indigo-50 to-white py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-accent">{t('How it works')}</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-balance sm:text-5xl">{t('Three steps. About a minute.')}</h2>
          </div>
          <ol className="relative mt-12 grid gap-4 sm:grid-cols-3">
            <span aria-hidden className="absolute top-12 right-[16%] left-[16%] hidden border-t-2 border-dashed border-indigo-200 sm:block" />
            {STEPS.map(([title, text], i) => (
              <li key={title} className="relative rounded-2xl bg-white p-6 shadow-card">
                <span className={`tabular flex size-12 items-center justify-center rounded-2xl font-display text-xl font-bold ${['bg-accent text-white', 'bg-sun text-night', 'bg-emerald-500 text-white'][i]}`}>{i + 1}</span>
                <h3 className="mt-4 text-lg font-semibold tracking-tight">{t(title)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t(text)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <TrustSection edition={TRUST} />

      <section className="px-5 py-20">
        <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-3xl bg-night px-6 py-14 text-center text-white sm:py-20">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(40rem_20rem_at_50%_0%,rgb(255_200_61/0.22),transparent_70%),radial-gradient(40rem_20rem_at_50%_120%,rgb(99_102_241/0.5),transparent_70%)]" />
          <h2 className="mx-auto max-w-2xl font-display text-3xl font-bold tracking-tight text-balance sm:text-5xl">{t('Start free today.')}</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">{t('Free to start. Ready in under a minute.')}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {DOORS.map(([id, , , title]) => (
              <Link key={id} to={`/${id}`} className={sunButton}>
                {t(title)}
                <span aria-hidden>→</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 text-sm sm:grid-cols-[1fr_auto_auto] sm:gap-16">
          <div>
            <Logo className="!text-base text-ink" />
            <p className="mt-3 max-w-xs text-muted">{t('Start a session. Share the QR. Attendance is done.')}</p>
            <p className="mt-3 max-w-xs text-muted">{t('“Dobrý den” means “good day”. Every good day starts with showing up.')}</p>
          </div>
          <div>
            <p className="font-semibold">{t('Dobry for')}</p>
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
              <li><a href="#how" className="hover:text-ink">{t('How it works')}</a></li>
              <li><a href="#trust" className="hover:text-ink">{t('Why Dobry')}</a></li>
              <li><Link to="/login" className="hover:text-ink">{t('Log in')}</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 text-sm text-muted">
            <span>© {new Date().getFullYear()} Dobry</span>
            <LanguageSwitch />
          </div>
        </div>
      </footer>
    </div>
  )
}
