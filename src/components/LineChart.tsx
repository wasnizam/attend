import { useState } from 'react'
import { formatDate } from '../lib/format'
import { t } from '../lib/i18n'

export interface Series {
  label: string
  /** A theme colour, e.g. var(--color-indigo-500), so it follows dark mode. */
  color: string
  /** Values by date (YYYY-MM-DD); a missing date leaves a gap in the line. */
  points: Map<string, number>
}

/** Colours for several lines, in a fixed order: the first line is always the brand's. */
export const LINE_COLORS = ['var(--color-accent)', 'var(--color-emerald-500)', 'var(--color-amber-500)', 'var(--color-rose-500)', 'var(--color-sky-500)', 'var(--color-violet-500)']

/**
 * A line chart for one or more series over dates. Percentages run 0–100 (`percent`); counts start at
 * zero and stop at the largest value. Hovering or tapping a date shows every line's value there.
 */
export function LineChart({ series, percent = false, goal, format = (v) => String(v), height = 220 }: { series: Series[]; percent?: boolean; goal?: number; format?: (v: number) => string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const dates = [...new Set(series.flatMap((s) => [...s.points.keys()]))].sort()
  if (dates.length < 2) return <p className="text-sm text-muted">{t('Not enough days yet for a graph.')}</p>
  const W = 640
  const H = height
  const pad = { l: 36, r: 14, t: 12, b: 26 }
  const top = percent ? 100 : Math.max(1, ...series.flatMap((s) => [...s.points.values()]))
  const nice = percent ? 100 : top <= 4 ? Math.ceil(top) : Math.ceil(top / 5) * 5
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (dates.length - 1)
  const y = (v: number) => pad.t + (1 - v / nice) * (H - pad.t - pad.b)
  const ticks = percent ? [0, 50, 100] : [0, Math.round(nice / 2), nice]
  const labelEvery = Math.max(1, Math.ceil(dates.length / 6))
  const path = (s: Series) => {
    let d = ''
    let pen = false
    dates.forEach((date, i) => {
      const v = s.points.get(date)
      if (v === undefined) return void (pen = false)
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
      pen = true
    })
    return d
  }
  const area = (s: Series) => {
    const idx = dates.map((d, i) => (s.points.has(d) ? i : -1)).filter((i) => i >= 0)
    if (idx.length < 2) return ''
    return `${path(s)}L${x(idx[idx.length - 1]).toFixed(1)},${y(0)}L${x(idx[0]).toFixed(1)},${y(0)}Z`
  }
  const shown = hover === null ? null : dates[hover]
  const slot = (W - pad.l - pad.r) / (dates.length - 1)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={series.map((s) => s.label).join(', ')} onMouseLeave={() => setHover(null)}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`fade-${i}-${s.label.length}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth="1" />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--color-muted)">
              {percent ? `${v}%` : v}
            </text>
          </g>
        ))}
        {goal !== undefined && <line x1={pad.l} x2={W - pad.r} y1={y(goal)} y2={y(goal)} stroke="var(--color-slate-400)" strokeDasharray="4 4" strokeWidth="1" />}
        {/* A soft fill under a single line; several lines stay clean. */}
        {series.length === 1 && <path d={area(series[0])} fill={`url(#fade-0-${series[0].label.length})`} />}
        {series.map((s, i) => (
          <path key={i} d={path(s)} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {shown && <line x1={x(hover!)} x2={x(hover!)} y1={pad.t} y2={y(0)} stroke="var(--color-slate-400)" strokeWidth="1" />}
        {series.map((s, i) =>
          dates.map((date, j) => {
            const v = s.points.get(date)
            if (v === undefined || (hover !== j && dates.length > 16)) return null
            return <circle key={`${i}-${date}`} cx={x(j)} cy={y(v)} r={hover === j ? 5 : 3} fill={s.color} stroke="var(--color-surface)" strokeWidth="2" />
          }),
        )}
        {dates.map((date, i) =>
          i % labelEvery === 0 || i === dates.length - 1 ? (
            <text key={date} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle'} fontSize="11" fill="var(--color-muted)">
              {formatDate(date).replace(/ \d{4}$/, '')}
            </text>
          ) : null,
        )}
        {dates.map((date, i) => (
          <rect key={date} x={x(i) - slot / 2} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
        ))}
      </svg>
      {shown && (
        <div className={`pointer-events-none absolute top-1 rounded-lg bg-white px-3 py-2 text-xs shadow-pop ${hover! > (dates.length - 1) / 2 ? 'left-10' : 'right-2'}`}>
          <p className="font-semibold text-ink">{formatDate(shown)}</p>
          {series.map((s) => (
            <p key={s.label} className="mt-0.5 flex items-center gap-1.5 text-muted">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              <span className="max-w-40 truncate">{s.label}</span>
              <span className="tabular ml-auto pl-2 font-semibold text-ink">{s.points.has(shown) ? format(s.points.get(shown)!) : '—'}</span>
            </p>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
