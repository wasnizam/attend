import { QRCodeSVG } from 'qrcode.react'
import { Link } from 'react-router-dom'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { Logo, buttonClass } from '../components/ui'
import { t } from '../lib/i18n'

const steps = [
  ['1. Create', 'Create your class, training session or event.'],
  ['2. Scan', 'Display the QR. Participants scan with their phone.'],
  ['3. Done', 'Attendance is recorded instantly.'],
]

const features = [
  ['M8 2v3M16 2v3M3.5 9h17M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5Z', 'Semester timetable', 'Add your classes once. Each one is waiting on the right day, ready to start in one tap.'],
  ['M12 16V4m0 0L8 8m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3', 'Upload your class list', 'Excel, CSV or PDF. Students type only their ID, and you see who is absent by name.'],
  ['M13 2 4 14h7l-1 8 9-12h-7l1-8Z', 'Live attendance', 'Names appear on your screen the moment students check in. No refreshing.'],
  ['M4 4v6h6M20 20v-6h-6M20 9A8 8 0 0 0 6.300 5.300L4 10m16 4-2.300 4.700A8 8 0 0 1 4 15', 'Rotating QR', 'The code changes every 45 seconds, so a forwarded link or photo stops working.'],
  ['M12 20h9M16.500 3.500a2.100 2.100 0 0 1 3 3L7 19l-4 1 1-4L16.500 3.500Z', 'Corrections made easy', 'Mark someone present by hand, or set late, excused or MC, during or after the session.'],
  ['M4 20v-7M10 20V4M16 20v-10M22 20H2', 'Semester reports', 'Every student’s percentage across the semester, with low attendance flagged. Export to Excel.'],
]

const audiences = ['Universities', 'Colleges', 'Training', 'Workshops', 'Seminars', 'Events']

/** An illustration of the live screen, built from the same pieces the product uses. */
function ProductPreview() {
  const rows = [
    ['ST003', 'Kumar', '10:07'],
    ['ST002', 'Siti', '10:05'],
    ['ST001', 'Ahmad', '10:03'],
  ]
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
            <p className="text-sm font-semibold tracking-tight">DATABASE SYSTEMS</p>
            <p className="text-xs text-muted">10:00 AM – 12:00 PM</p>
            <p className="tabular mt-2 text-xl font-semibold">38 / 42 <span className="text-muted">{t('PRESENT')}</span></p>
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

export function Landing() {
  return (
    <div className="min-h-dvh bg-white">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-5">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
              <a href="#features" className="hover:text-ink">{t('Features')}</a>
              <a href="#how" className="hover:text-ink">{t('How it works')}</a>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <LanguageSwitch />
            </div>
            <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-slate-700 hover:bg-slate-100">
              {t('Log in')}
            </Link>
            <Link to="/signup" className={buttonClass()}>
              {t('Start Free')}
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pt-16 pb-20 text-center sm:pt-24">
        <p className="mx-auto inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent ring-1 ring-indigo-200 ring-inset">
          {t('QR attendance for classes, training and events')}
        </p>
        <h1 className="mx-auto mt-6 max-w-3xl text-5xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl">
          {t('Attendance, without the hassle.')}
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-slate-600 sm:text-xl">
          {t('Start a session. Share the QR. Know who attended.')}
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/signup" className={buttonClass({ size: 'lg' })}>
            {t('Start Free')}
          </Link>
          <a href="#how" className={buttonClass({ size: 'lg', variant: 'secondary' })}>
            {t('See How It Works')}
          </a>
        </div>
        <p className="mt-4 text-sm text-muted">{t('No app for participants to install.')}</p>
        <ProductPreview />
      </section>

      <section id="features" className="scroll-mt-16 border-y border-line bg-canvas py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-accent">{t('Features')}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{t('Everything a lecturer needs, nothing more')}</h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(([icon, title, text]) => (
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
            {steps.map(([title, text]) => (
              <li key={title} className="border-t-2 border-accent pt-5">
                <h3 className="text-xl font-semibold tracking-tight">{t(title)}</h3>
                <p className="mt-2 text-slate-600">{t(text)}</p>
              </li>
            ))}
          </ol>
          <div className="mt-16 text-center">
            <h2 className="text-sm font-semibold text-muted">{t('Built for')}</h2>
            <ul className="mx-auto mt-4 flex max-w-2xl flex-wrap justify-center gap-2">
              {audiences.map((a) => (
                <li key={a} className="rounded-full px-4 py-1.5 text-sm font-medium text-slate-700 shadow-card">
                  {t(a)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="px-5 pb-20">
        <div className="mx-auto max-w-6xl rounded-2xl bg-ink px-6 py-14 text-center text-white sm:py-16">
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {t('Take attendance in your next class.')}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">{t('Free to start. Ready in under a minute.')}</p>
          <Link to="/signup" className={`${buttonClass({ size: 'lg' })} mt-8 !bg-white !text-ink hover:!bg-slate-100`}>
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
