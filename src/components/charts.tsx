import { useState } from 'react'
import { formatDate, formatPercent } from '../lib/format'
import { t } from '../lib/i18n'
import type { ClassReport, Level } from '../lib/report'

// Status colours: reserved for state, always shown with a label, never on their own.
export const LEVEL_COLOR: Record<Level, string> = { ok: '#0ca30c', warning: '#fab219', barring: '#d03b3b' }
export const LEVEL_LABEL: Record<Level, string> = { ok: 'On track', warning: 'Warning due', barring: 'Barring due' }

const SERIES = '#4f46e5'
const GRID = '#e2e8f0'

/** Dot + words. The words carry the meaning; the colour only helps the eye find it. */
export function LevelTag({ level }: { level: Level }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap text-slate-700">
      <span className="size-2 rounded-full" style={{ background: LEVEL_COLOR[level] }} />
      {t(LEVEL_LABEL[level])}
    </span>
  )
}

/**
 * Attendance rate for each session held, in order. One series, so no legend: the card
 * title names it. The 80% line is the rule everyone is measured against.
 */
export function AttendanceTrend({ trend }: { trend: ClassReport['trend'] }) {
  const [hover, setHover] = useState<number | null>(null)
  const points = trend.filter((p) => p.rate !== null)
  if (points.length === 0) {
    return <p className="rounded-lg bg-canvas px-4 py-8 text-center text-sm text-muted">{t('The chart appears once a session has a student list or an expected number.')}</p>
  }

  const W = 640
  const H = 220
  const pad = { l: 36, r: 44, t: 12, b: 26 }
  const x = (i: number) => (points.length === 1 ? (W - pad.r + pad.l) / 2 : pad.l + (i * (W - pad.l - pad.r)) / (points.length - 1))
  const y = (v: number) => pad.t + ((100 - v) * (H - pad.t - pad.b)) / 100
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rate!).toFixed(1)}`).join(' ')
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`
  const last = points[points.length - 1]
  const shown = hover !== null ? points[hover] : null
  // A few date labels at most, so they never collide.
  const every = Math.ceil(points.length / 6)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t('Attendance rate for each session')}>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="1" />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="fill-slate-400 text-[11px]">{v}%</text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(80)} y2={y(80)} stroke="#94a3b8" strokeWidth="1" />
        <text x={W - pad.r + 6} y={y(80) + 4} className="fill-slate-500 text-[11px]">80%</text>

        {points.length > 1 && <path d={area} fill={SERIES} opacity="0.1" />}
        {points.length > 1 && <path d={line} fill="none" stroke={SERIES} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((p, i) => (
          <circle key={p.session.id} cx={x(i)} cy={y(p.rate!)} r={hover === i ? 6 : 4} fill={SERIES} stroke="#fff" strokeWidth="2" />
        ))}
        {/* Only the latest point is labelled; the rest are in the tooltip and the table. */}
        <text x={x(points.length - 1)} y={y(last.rate!) - 12} textAnchor="middle" className="fill-slate-900 text-[12px] font-semibold">
          {formatPercent(last.rate)}
        </text>
        {points.map((p, i) =>
          i % every === 0 || i === points.length - 1 ? (
            <text key={p.session.id} x={x(i)} y={H - 6} textAnchor="middle" className="fill-slate-400 text-[11px]">
              {formatDate(p.session.date).replace(/ \d{4}$/, '')}
            </text>
          ) : null,
        )}
        {/* Wide invisible columns: easier to hit than an 8px dot. */}
        {points.map((p, i) => {
          const half = points.length === 1 ? (W - pad.l - pad.r) / 2 : (W - pad.l - pad.r) / (points.length - 1) / 2
          return (
            <rect
              key={p.session.id}
              x={x(i) - half}
              y={pad.t}
              width={half * 2}
              height={H - pad.t - pad.b}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${formatDate(p.session.date)}: ${formatPercent(p.rate)}`}
            />
          )
        })}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={y(0)} stroke="#94a3b8" strokeWidth="1" />}
      </svg>
      {shown && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-white px-3 py-2 text-xs whitespace-nowrap shadow-pop"
          style={{ left: `${Math.min(88, Math.max(12, (x(hover) / W) * 100))}%` }}
        >
          <p className="font-semibold text-ink">{formatDate(shown.session.date)}</p>
          <p className="tabular text-muted">
            {t('{n} present', { n: shown.present })} · {formatPercent(shown.rate)}
          </p>
        </div>
      )}
    </div>
  )
}

/** How the class splits across the three levels: one bar, with the counts spelled out beside it. */
export function LevelBar({ rows }: { rows: ClassReport['rows'] }) {
  const levels: Level[] = ['ok', 'warning', 'barring']
  const counts = levels.map((level) => ({ level, n: rows.filter((r) => r.level === level).length }))
  const total = rows.length
  if (total === 0) return null
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={counts.map((c) => `${t(LEVEL_LABEL[c.level])}: ${c.n}`).join(', ')}>
        {counts.filter((c) => c.n > 0).map((c) => (
          <div key={c.level} title={`${t(LEVEL_LABEL[c.level])}: ${c.n}`} style={{ width: `${(c.n / total) * 100}%`, background: LEVEL_COLOR[c.level] }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        {counts.map((c) => (
          <li key={c.level} className="flex items-center gap-2 text-sm">
            <LevelTag level={c.level} />
            <span className="tabular font-semibold">{c.n}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
