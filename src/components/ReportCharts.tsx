import { type ReactNode, useState } from 'react'
import { addDays, parseDate } from '../lib/format'
import { t } from '../lib/i18n'
import type { DayEntry, PayrollRow } from '../lib/payroll'
import { Card } from './ui'

/** Attendance states, bottom of the stack first. Status colours, always shown with a legend and labels. */
export const PARTS = [
  { id: 'onTime', label: 'On time', color: '#0ca30c' },
  { id: 'late', label: 'Late', color: '#fab219' },
  { id: 'off', label: 'Leave or MC', color: '#94a3b8' },
  { id: 'absent', label: 'Absent', color: '#d03b3b' },
] as const
type Part = (typeof PARTS)[number]['id']

const partOf = (mark: DayEntry['mark']): Part => (mark === 'late' ? 'late' : mark === 'absent' ? 'absent' : mark === 'leave' || mark === 'mc' ? 'off' : 'onTime')

const ACCENT = '#4f46e5'
const INK2 = '#64748b'
const GRID = '#e2e8f0'

export interface Bucket {
  key: string
  label: string
  title: string
  counts: Record<Part, number>
}

/** Days for a short period, months for a long one. */
export function buckets(rows: PayrollRow[], from: string, to: string): Bucket[] {
  const last = to < from ? from : to
  const daily = (parseDate(last).getTime() - parseDate(from).getTime()) / 86_400_000 < 62
  const list = new Map<string, Bucket>()
  const empty = () => ({ onTime: 0, late: 0, off: 0, absent: 0 })
  if (daily) {
    for (let d = from; d <= last; d = addDays(d, 1)) {
      const day = parseDate(d)
      list.set(d, { key: d, label: String(day.getDate()), title: day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }), counts: empty() })
    }
  } else {
    for (let d = from.slice(0, 7); d <= last.slice(0, 7); ) {
      const day = parseDate(`${d}-01`)
      list.set(d, { key: d, label: day.toLocaleDateString(undefined, { month: 'short' }), title: day.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), counts: empty() })
      const next = new Date(day.getFullYear(), day.getMonth() + 1, 1)
      d = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
    }
  }
  for (const r of rows) {
    for (const e of r.entries) {
      const b = list.get(daily ? e.date : e.date.slice(0, 7))
      if (b) b.counts[partOf(e.mark)] += 1
    }
  }
  return [...list.values()]
}

const niceMax = (n: number) => {
  if (n <= 4) return 4
  const step = 10 ** Math.floor(Math.log10(n))
  return Math.ceil(n / step) * step
}

function ChartCard({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div data-pdf-chart className="h-full break-inside-avoid">
      <Card className="h-full p-5">
        <h3 className="font-semibold">{title}</h3>
        {note && <p className="text-sm text-muted">{note}</p>}
        <div className="mt-4">{children}</div>
      </Card>
    </div>
  )
}

/** Stacked columns: how each day (or month) went for everyone in the report. */
function Trend({ data }: { data: Bucket[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 720
  const H = 220
  const pad = { l: 32, r: 8, t: 8, b: 24 }
  const total = (b: Bucket) => PARTS.reduce((a, p) => a + b.counts[p.id], 0)
  const max = niceMax(Math.max(0, ...data.map(total)))
  const slot = (W - pad.l - pad.r) / Math.max(1, data.length)
  const bar = Math.max(3, Math.min(28, slot * 0.6))
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max)
  const ticks = [0, max / 2, max]
  const every = Math.ceil(data.length / 16)
  const h = hover === null ? null : data[hover]
  const rate = (b: Bucket) => {
    const due = b.counts.onTime + b.counts.late + b.counts.absent
    return due ? Math.round(((b.counts.onTime + b.counts.late) / due) * 100) : null
  }
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t('Attendance over time')} onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill={INK2}>{Math.round(v)}</text>
          </g>
        ))}
        {data.map((b, i) => {
          const cx = pad.l + slot * i + slot / 2
          let acc = 0
          const parts = PARTS.filter((p) => b.counts[p.id] > 0)
          return (
            <g key={b.key} onMouseEnter={() => setHover(i)}>
              {/* A hit area the full height of the slot, wider than the bar. */}
              <rect x={pad.l + slot * i} y={pad.t} width={slot} height={H - pad.t - pad.b} fill={hover === i ? '#f1f5f9' : 'transparent'} />
              {parts.map((p, j) => {
                const v = b.counts[p.id]
                const top = y(acc + v)
                const bottom = y(acc)
                acc += v
                const last = j === parts.length - 1
                // A 2px gap of surface between stacked parts; only the top part has rounded corners.
                return last ? (
                  <path key={p.id} d={roundTop(cx - bar / 2, top, bar, bottom - top, Math.min(4, bar / 2, bottom - top))} fill={p.color} />
                ) : (
                  <rect key={p.id} x={cx - bar / 2} y={top + 2} width={bar} height={Math.max(0, bottom - top - 2)} fill={p.color} />
                )
              })}
              {i % every === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill={INK2}>{b.label}</text>
              )}
            </g>
          )
        })}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#cbd5e1" strokeWidth={1} />
      </svg>
      {h && total(h) > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-44 rounded-lg border border-line bg-white p-2.5 text-xs shadow-card"
          style={{ left: `min(calc(${((pad.l + slot * (hover! + 0.5)) / W) * 100}% + 8px), calc(100% - 11rem))` }}
        >
          <p className="font-semibold">{h.title}</p>
          {PARTS.map((p) => (
            <p key={p.id} className="mt-1 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: p.color }} />{t(p.label)}</span>
              <span className="tabular font-medium">{h.counts[p.id]}</span>
            </p>
          ))}
          {rate(h) !== null && <p className="mt-1.5 border-t border-line pt-1.5 text-muted">{t('Attendance')} <span className="font-medium text-ink">{rate(h)}%</span></p>}
        </div>
      )}
      <Legend />
    </div>
  )
}

/** A bar with only its top corners rounded, standing on the baseline. */
function roundTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return ''
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}z`
}

function Legend() {
  return (
    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {PARTS.map((p) => (
        <span key={p.id} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: p.color }} />
          {t(p.label)}
        </span>
      ))}
    </p>
  )
}

/** Horizontal bars with the value written at the end: one row per group or person. */
function Bars({ items, unit, max }: { items: { label: string; value: number; note?: string }[]; unit: string; max: number }) {
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li key={it.label} className="grid grid-cols-[minmax(6rem,11rem)_1fr_auto] items-center gap-3 text-sm" title={`${it.label}: ${it.value}${unit}${it.note ? ` · ${it.note}` : ''}`}>
          <span className="truncate">{it.label}</span>
          <span className="h-2.5 rounded-full bg-slate-100">
            <span className="block h-full rounded-full" style={{ width: `${max && it.value ? Math.max(2, (it.value / max) * 100) : 0}%`, background: ACCENT }} />
          </span>
          <span className="tabular text-right font-medium">
            {it.value}
            {unit}
            {it.note && <span className="block text-xs font-normal text-muted">{it.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The picture of the period: trend, groups and people who are late most. */
/** The figures behind the group and lateness charts, shared with the PDF. */
export function chartData(rows: PayrollRow[], groups: { name: string; list: PayrollRow[] }[]) {
  const byGroup = groups
    .map((g) => {
      const days = g.list.reduce((a, r) => a + r.days, 0)
      const due = days + g.list.reduce((a, r) => a + r.absent, 0)
      const late = g.list.reduce((a, r) => a + r.late, 0)
      return { label: g.name || t('No department'), value: due ? Math.round((days / due) * 1000) / 10 : 0, due, note: t(late === 1 ? '1 late' : '{n} late', { n: late }) }
    })
    .filter((g) => g.due)
    .sort((a, b) => a.value - b.value)
  const late = rows
    .filter((r) => r.late)
    .sort((a, b) => b.late - a.late || b.lateMinutes - a.lateMinutes)
    .slice(0, 5)
    .map((r) => ({ label: r.name, value: r.late, note: `${Math.round(r.lateMinutes)} min` }))
  return { byGroup, late }
}

/** The picture of the period: trend, groups and people who are late most. */
export function ReportCharts({ rows, groups, from, to }: { rows: PayrollRow[]; groups: { name: string; list: PayrollRow[] }[]; from: string; to: string }) {
  const data = buckets(rows, from, to)
  const { byGroup, late } = chartData(rows, groups)
  return (
    <div id="report-charts" className="grid gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <ChartCard title={t('Attendance over time')} note={t('Each bar is everyone who was due that day: on time, late, on leave or MC, or absent.')}>
          <Trend data={data} />
        </ChartCard>
      </div>
      {byGroup.length > 1 && (
        <ChartCard title={t('Attendance by group')} note={t('Lowest first.')}>
          <Bars items={byGroup} unit="%" max={100} />
        </ChartCard>
      )}
      {late.length > 0 && (
        <ChartCard title={t('Late most often')} note={t('Times late, and minutes late in all.')}>
          <Bars items={late} unit="" max={late[0].value} />
        </ChartCard>
      )}
    </div>
  )
}
