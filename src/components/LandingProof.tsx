import { QRCodeSVG } from 'qrcode.react'
import type { Edition, TrustVisual } from '../lib/editions'
import { t } from '../lib/i18n'

const ring = 2 * Math.PI * 15

/** A tick or a cross in a coloured disc. */
function Mark({ ok, className = 'size-6' }: { ok: boolean; className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full text-white ${ok ? 'bg-emerald-500' : 'bg-rose-500'} ${className}`}>
      <svg viewBox="0 0 20 20" className="size-[60%]" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d={ok ? 'm5 10.5 3.2 3L15 7' : 'm6 6 8 8m0-8-8 8'} />
      </svg>
    </span>
  )
}

/** A small phone frame. */
function Phone({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <div className={`w-24 rounded-[1.1rem] bg-night p-1 shadow-[0_14px_30px_-10px_rgb(0_0_0/0.6)] ring-1 ring-white/20 ${dim ? 'opacity-90' : ''}`}>
      <div className="flex h-[8.5rem] flex-col items-center rounded-[0.85rem] bg-white px-1.5 pt-2 text-ink">
        <span className="mb-2 h-1 w-6 rounded-full bg-slate-200" />
        {children}
      </div>
    </div>
  )
}

/**
 * Illustrations for the "why you can trust it" cards: small, accurate pictures of the product.
 * Decorative: the text beside each one says it all.
 */
function Visual({ kind }: { kind: TrustVisual }) {
  if (kind === 'qr') {
    // The live code next to a photo of an old one, which no longer works.
    return (
      <div className="flex items-center gap-5">
        <div className="relative rounded-xl bg-white p-2.5 shadow-[0_14px_30px_-10px_rgb(0_0_0/0.6)]">
          <QRCodeSVG value="https://attend.example.com/session/8K72QF?c=YAXE2" level="L" marginSize={0} style={{ width: '5rem', height: '5rem', display: 'block' }} />
          <div className="mt-2 flex items-center justify-between gap-2 text-ink">
            <svg viewBox="0 0 36 36" className="size-5 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="#e2e8f0" strokeWidth="5" />
              <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-sun-strong)" strokeWidth="5" strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={ring * 0.3} />
            </svg>
            <span className="tabular text-[11px] font-bold tracking-[0.2em]">YAXE2</span>
          </div>
        </div>
        <div className="relative rotate-6">
          <div className="rounded-lg bg-white p-2 pb-5 opacity-70 shadow-[0_14px_30px_-10px_rgb(0_0_0/0.6)] grayscale">
            <QRCodeSVG value="https://attend.example.com/session/8K72QF?c=OLD42" level="L" marginSize={0} style={{ width: '3.5rem', height: '3.5rem', display: 'block' }} />
          </div>
          <span className="absolute -right-3 -bottom-2 rotate-[-6deg] rounded-md bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white uppercase shadow">{t('Expired')}</span>
        </div>
      </div>
    )
  }
  if (kind === 'phone') {
    return (
      <div className="flex items-end gap-4">
        <Phone>
          <Mark ok className="size-8" />
          <p className="mt-2 text-[10px] font-bold">{t('Clocked in')}</p>
          <p className="text-[9px] text-slate-500">Sarah Lee</p>
          <span className="mt-auto mb-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[8px] font-semibold whitespace-nowrap text-emerald-700">{t('Own phone')}</span>
        </Phone>
        <Phone dim>
          <Mark ok={false} className="size-8" />
          <p className="mt-2 text-[10px] font-bold">{t('Flagged')}</p>
          <p className="text-[9px] text-slate-500">Sarah Lee?</p>
          <span className="mt-auto mb-2 rounded-full bg-rose-50 px-2 py-0.5 text-[8px] font-semibold whitespace-nowrap text-rose-700">{t('Not their phone')}</span>
        </Phone>
      </div>
    )
  }
  if (kind === 'geo') {
    // A small map: inside the circle is fine, outside is flagged.
    return (
      <svg viewBox="0 0 240 130" className="h-32 w-full max-w-[15rem]" fill="none">
        <rect x="0" y="0" width="240" height="130" rx="14" fill="#f1f5f9" />
        <path d="M0 40h240M0 92h240M62 0v130M150 0v130M200 0v130" stroke="#fff" strokeWidth="9" />
        <path d="M0 40h240M0 92h240M62 0v130M150 0v130M200 0v130" stroke="#e2e8f0" strokeWidth="1" />
        <circle cx="96" cy="66" r="46" fill="rgb(99 102 241 / 0.14)" stroke="#6366f1" strokeWidth="1.5" strokeDasharray="5 4" />
        <rect x="84" y="54" width="24" height="24" rx="5" fill="#4f46e5" />
        <path d="M90 72v-9l6-4 6 4v9" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
        <text x="96" y="124" textAnchor="middle" fontSize="10" fontWeight="600" fill="#6366f1">100 m</text>
        <g><circle cx="70" cy="48" r="9" fill="#10b981" stroke="#fff" strokeWidth="2" /><path d="m66 48 3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></g>
        <g><circle cx="122" cy="86" r="9" fill="#10b981" stroke="#fff" strokeWidth="2" /><path d="m118 86 3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></g>
        <g><circle cx="200" cy="40" r="9" fill="#f43f5e" stroke="#fff" strokeWidth="2" /><path d="m196.5 36.5 7 7m0-7-7 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></g>
        <rect x="160" y="54" width="70" height="20" rx="10" fill="#fff" />
        <text x="195" y="68" textAnchor="middle" fontSize="10" fontWeight="700" fill="#e11d48">{t('Outside')}</text>
      </svg>
    )
  }
  if (kind === 'clock') {
    return (
      <div className="w-56 space-y-2">
        <div className="rounded-xl bg-white p-3 text-ink shadow-[0_14px_30px_-10px_rgb(0_0_0/0.6)]">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-emerald-700 uppercase">
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg>
            {t('Recorded by server')}
          </p>
          <p className="tabular mt-1 font-display text-3xl font-bold tracking-tight">09:07:12</p>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-white/10 px-3 py-2 text-xs text-indigo-100/70 ring-1 ring-white/10">
          <span>{t('Phone clock')}</span>
          <span className="tabular line-through decoration-rose-400 decoration-2">08:45:00</span>
        </div>
      </div>
    )
  }
  if (kind === 'door') {
    // A tablet at the entrance, and the PIN needed to leave it.
    return (
      <div className="relative">
        <div className="rounded-2xl bg-slate-800 p-1.5 shadow-[0_14px_30px_-10px_rgb(0_0_0/0.6)] ring-1 ring-white/15">
          <div className="flex h-24 w-40 items-center justify-center gap-3 rounded-xl bg-night">
            <div className="rounded-md bg-white p-1">
              <QRCodeSVG value="https://attend.example.com/door" level="L" marginSize={0} style={{ width: '3.25rem', height: '3.25rem', display: 'block' }} />
            </div>
            <div className="text-left text-white">
              <p className="text-[9px] font-semibold text-sun">{t('SCAN TO CLOCK IN')}</p>
              <p className="tabular text-[9px] text-white/60">0:32</p>
            </div>
          </div>
        </div>
        <div className="absolute -right-6 -bottom-4 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-ink shadow-[0_14px_30px_-10px_rgb(0_0_0/0.6)]">
          <span className="flex size-6 items-center justify-center rounded-lg bg-sun text-night">
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" /></svg>
          </span>
          <span className="flex gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className="size-2 rounded-full bg-night" />)}</span>
        </div>
      </div>
    )
  }
  if (kind === 'lock') {
    const row = (name: string, colour: string, time: string, tag?: React.ReactNode) => (
      <div className="flex items-center gap-2 px-3 py-2">
        <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${colour}`}>{name.split(' ').map((w) => w[0]).join('')}</span>
        <span className="flex-1 truncate text-xs font-medium">{name}</span>
        {tag}
        <span className="tabular text-xs text-slate-500">{time}</span>
      </div>
    )
    return (
      <div className="w-60 divide-y divide-slate-100 overflow-hidden rounded-xl bg-white text-ink shadow-[0_14px_30px_-10px_rgb(0_0_0/0.6)]">
        <div className="flex items-center justify-between bg-slate-50 px-3 py-1.5 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
          <span>{t('Today')}</span>
          <svg viewBox="0 0 24 24" className="size-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" /></svg>
        </div>
        {row('Ahmad Ali', 'bg-sky-200 text-sky-900', '8:55')}
        {row('Sarah Lee', 'bg-amber-200 text-amber-900', '8:58', <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">{t('Added by hand')}</span>)}
        {row('Kumar Raj', 'bg-emerald-200 text-emerald-900', '9:02')}
      </div>
    )
  }
  if (kind === 'presence') {
    return (
      <div className="w-56 rounded-xl bg-white p-3 text-ink shadow-[0_14px_30px_-10px_rgb(0_0_0/0.6)]">
        <p className="font-display text-base font-bold">{t('Still here?')}</p>
        <span className="mt-2 block rounded-lg bg-accent py-1.5 text-center text-xs font-semibold text-white">{t('Yes, I’m here')}</span>
        <div className="mt-3 flex items-center justify-between text-[11px]">
          <span className="text-slate-500">{t('Confirmed')}</span>
          <span className="tabular font-semibold text-emerald-700">36 / 38</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-[94%] rounded-full bg-emerald-500" /></div>
      </div>
    )
  }
  return null
}

/** What sets Attend apart: the checks that make the record hard to cheat. */
export function TrustSection({ edition }: { edition: Edition }) {
  return (
    <section id="trust" className="relative isolate scroll-mt-16 overflow-hidden bg-night py-20 text-white">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(50rem_25rem_at_100%_0%,rgb(99_102_241/0.35),transparent_60%)]" />
      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-sun">{t('Why Attend')}</p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-balance sm:text-5xl">{t(edition.trust.title)}</h2>
          <p className="mt-3 text-indigo-100/80">{t(edition.trust.sub)}</p>
        </div>
        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {edition.trust.cards.map(([visual, title, text], i) => (
            <div key={title} className="group rounded-3xl bg-white/[0.04] p-2 ring-1 ring-white/10 transition hover:bg-white/[0.07] hover:ring-white/20">
              <div aria-hidden className={`relative flex h-52 items-center justify-center overflow-hidden rounded-[1.25rem] bg-gradient-to-br ${GLOW[i % GLOW.length]} px-4`}>
                <div aria-hidden className="absolute inset-0 [background-image:radial-gradient(rgb(255_255_255/0.08)_1px,transparent_1px)] [background-size:16px_16px]" />
                <div className="relative transition duration-300 group-hover:scale-[1.04]">
                  <Visual kind={visual} />
                </div>
              </div>
              <div className="px-4 pt-5 pb-5">
                <h3 className="font-display text-xl font-bold tracking-tight text-white">{t(title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-indigo-100/70">{t(text)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** The lit panel behind each illustration: one hue each, all on the night blue. */
const GLOW = ['from-indigo-500/40 to-indigo-500/5', 'from-amber-400/35 to-amber-400/5', 'from-emerald-400/35 to-emerald-400/5', 'from-sky-400/35 to-sky-400/5', 'from-violet-500/40 to-violet-500/5', 'from-rose-400/35 to-rose-400/5']

const TONE = { good: 'text-good', warn: 'text-[#b25e00]', bad: 'text-bad' }

/** Two more views of the product for this group: the phone, and the report. Made-up names. */
export function Snapshots({ edition }: { edition: Edition }) {
  const { phone, report, title } = edition.shots
  return (
    <section id="product" className="scroll-mt-16 py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-accent">{t('The product')}</p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-balance sm:text-5xl">{t(title)}</h2>
        </div>
        <div className="mt-12 grid items-center gap-10 rounded-3xl bg-gradient-to-b from-indigo-50 to-canvas px-5 py-10 sm:px-10 lg:grid-cols-[17rem_1fr] lg:gap-12 lg:py-14">
          <figure>
            <div aria-hidden className="mx-auto w-60 rounded-[2.2rem] bg-ink p-2.5 shadow-pop">
              <div className="rounded-[1.7rem] bg-white px-5 pt-10 pb-8 text-center">
                <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-good text-2xl text-white">✓</span>
                <p className="mt-4 font-semibold tracking-tight">{t(phone.heading)}</p>
                <p className="mt-3 text-sm">{phone.session}</p>
                <p className="tabular text-2xl font-semibold">{phone.time}</p>
                <p className="mt-2 text-xs text-muted">AHMAD ALI</p>
                {phone.out && (
                  <p className="mt-5 rounded-lg border border-line py-2 text-sm font-semibold">{t('Clock out')}</p>
                )}
              </div>
            </div>
            <figcaption className="mt-5 text-center text-sm text-slate-600">{t(phone.caption)}</figcaption>
          </figure>
          <figure className="min-w-0">
            <div aria-hidden className="overflow-x-auto rounded-xl bg-white shadow-pop">
              <p className="border-b border-line bg-slate-50 px-5 py-3 text-sm font-semibold">{report.name} · {t(report.kind)}</p>
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    {report.head.map((h, i) => (
                      <th key={h} className={`px-1.5 py-2.5 font-medium first:pl-4 last:pr-4 sm:px-3 sm:first:pl-5 sm:last:pr-5 ${i ? 'text-right' : ''}`}>{t(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tabular divide-y divide-line">
                  {report.rows.map((row) => (
                    <tr key={row.cells[0]}>
                      {row.cells.map((cell, i) => (
                        <td key={i} className={`px-1.5 py-3 first:pl-4 last:pr-4 sm:px-3 sm:first:pl-5 sm:last:pr-5 ${i ? 'text-right whitespace-nowrap' : 'font-medium'} ${row.tone && i === row.cells.length - 1 ? `font-semibold ${TONE[row.tone]}` : ''}`}>
                          {row.tone && i === row.cells.length - 1 ? t(cell) : cell}
                          {i === 1 && row.late && <span className="block text-xs font-medium text-[#b25e00]">{t('Late by {n} min', { n: row.late })}</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <figcaption className="mt-5 text-center text-sm text-slate-600">{t(report.caption)}</figcaption>
          </figure>
        </div>
      </div>
    </section>
  )
}
