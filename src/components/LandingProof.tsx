import { QRCodeSVG } from 'qrcode.react'
import type { Edition, TrustVisual } from '../lib/editions'
import { t } from '../lib/i18n'

/** Small drawings for the "why you can trust it" cards. Decorative: the text beside them says it all. */
function Visual({ kind }: { kind: TrustVisual }) {
  if (kind === 'qr') {
    return (
      <div className="flex items-center gap-3">
        <QRCodeSVG value="https://attend.example.com/session/8K72QF?c=YAXE2" level="L" marginSize={0} style={{ width: '4rem', height: '4rem' }} />
        <div>
          <p className="tabular inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-white">
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4v6h6M20 20v-6h-6M20 9A8 8 0 0 0 6.3 5.3L4 10m16 4-2.3 4.7A8 8 0 0 1 4 15" />
            </svg>
            0:45
          </p>
          <p className="tabular mt-1.5 text-sm font-semibold tracking-[0.25em] text-ink">YAXE2</p>
        </div>
      </div>
    )
  }
  if (kind === 'geo') {
    return (
      <svg viewBox="0 0 160 64" className="h-16 w-40" fill="none">
        <circle cx="56" cy="32" r="28" className="fill-accent-soft stroke-accent" strokeWidth="1.5" strokeDasharray="4 3" />
        <circle cx="56" cy="32" r="4" className="fill-accent" />
        <circle cx="44" cy="22" r="7" fill="#0ca30c" />
        <path d="m41 22 2.2 2.2L47.200 20" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="70" cy="42" r="7" fill="#0ca30c" />
        <path d="m67 42 2.2 2.2L73.200 40" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="132" cy="30" r="7" fill="#d03b3b" />
        <path d="m129.500 27.500 5 5m0-5-5 5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M88 31h30" className="stroke-slate-300" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
    )
  }
  if (kind === 'phone') {
    // Their own phone goes through; someone else's phone is stopped.
    const phone = (ok: boolean) => (
      <div className="flex flex-col items-center gap-1">
        <div className={`flex h-14 w-8 items-center justify-center rounded-md border-2 bg-white ${ok ? 'border-ink' : 'border-slate-300'}`}>
          <span className={`flex size-5 items-center justify-center rounded-full text-xs font-bold text-white ${ok ? 'bg-[#0ca30c]' : 'bg-[#d03b3b]'}`}>{ok ? '✓' : '✕'}</span>
        </div>
        <span className="text-[10px] font-medium text-slate-600">{ok ? t('Own phone') : t('Not their phone')}</span>
      </div>
    )
    return (
      <div className="flex items-end gap-6">
        {phone(true)}
        {phone(false)}
      </div>
    )
  }
  if (kind === 'door') {
    return (
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-24 flex-col items-center justify-center rounded-lg border-2 border-ink bg-white">
          <QRCodeSVG value="https://attend.example.com/door" level="L" marginSize={0} style={{ width: '2.25rem', height: '2.25rem' }} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <svg viewBox="0 0 24 24" className="size-6 text-ink" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 11V8a6 6 0 1 1 12 0v3M5 11h14v10H5z" />
          </svg>
          <span className="tabular text-sm font-semibold tracking-[0.3em] text-ink">••••</span>
        </div>
      </div>
    )
  }
  if (kind === 'lock') {
    return (
      <div className="w-44 space-y-1.5 text-left text-xs">
        <div className="flex items-center justify-between rounded-md bg-white px-2 py-1.5 shadow-card"><span className="font-medium">Ahmad</span><span className="tabular text-slate-500">8:55</span></div>
        <div className="flex items-center justify-between rounded-md bg-white px-2 py-1.5 shadow-card"><span className="font-medium">Sarah</span><span className="rounded bg-[#fff4d6] px-1.5 text-[10px] font-semibold text-[#8a5a00]">{t('Added by hand')}</span></div>
      </div>
    )
  }
  if (kind === 'presence') {
    return (
      <div className="flex items-center gap-3">
        <span className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white">{t('Still here?')}</span>
        <span className="tabular text-sm font-semibold text-good">36 / 38 ✓</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3">
      <span className="tabular rounded-lg bg-ink px-3 py-2 text-lg font-semibold text-white">09:07:12</span>
      <svg viewBox="0 0 24 24" className="size-6 text-good" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 11V8a6 6 0 1 1 12 0v3M5 11h14v10H5z" />
      </svg>
    </div>
  )
}

/** What sets Attend apart: the checks that make the record hard to cheat. */
export function TrustSection({ edition }: { edition: Edition }) {
  return (
    <section id="trust" className="scroll-mt-16 bg-ink py-20 text-white">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-indigo-300">{t('Why Attend')}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t(edition.trust.title)}</h2>
          <p className="mt-3 text-slate-300">{t(edition.trust.sub)}</p>
        </div>
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {edition.trust.cards.map(([visual, title, text]) => (
            <div key={title} className="rounded-2xl bg-white p-5 text-ink">
              <div aria-hidden className="flex h-28 items-center justify-center rounded-lg bg-canvas">
                <Visual kind={visual} />
              </div>
              <h3 className="mt-5 px-1 text-lg font-semibold tracking-tight">{t(title)}</h3>
              <p className="mt-1.5 px-1 pb-1 text-sm leading-relaxed text-slate-600">{t(text)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const TONE = { good: 'text-good', warn: 'text-[#b25e00]', bad: 'text-bad' }

/** Two more views of the product for this group: the phone, and the report. Made-up names. */
export function Snapshots({ edition }: { edition: Edition }) {
  const { phone, report, title } = edition.shots
  return (
    <section id="product" className="scroll-mt-16 py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-accent">{t('The product')}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t(title)}</h2>
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
