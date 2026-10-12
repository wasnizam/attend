import { type ReactNode, useState } from 'react'
import { Card } from '../components/ui'
import { t } from '../lib/i18n'
import { type Customer, type Health, type Status, dateOf, statusLabel } from './context'

const STATUS_STYLE: Record<Status, string> = {
  early: 'bg-slate-100 text-slate-700',
  trial: 'bg-accent-soft text-accent',
  free: 'bg-slate-100 text-muted',
  pro: 'bg-good-soft text-good',
  suspended: 'bg-bad-soft text-bad',
}

export function StatusBadge({ c }: { c: Pick<Customer, 'status' | 'lapsed'> }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLE[c.status]}`}>
      {statusLabel(c.status)}
      {c.lapsed && c.status === 'free' ? ` · ${t('lapsed')}` : ''}
    </span>
  )
}

export const planUntil = (c: Pick<Customer, 'until' | 'lapsed' | 'status'>) =>
  c.until && c.status !== 'suspended' ? (c.lapsed ? t('ended {date}', { date: dateOf(c.until) }) : t('until {date}', { date: dateOf(c.until) })) : ''

const HEALTH: Record<Health, [string, string]> = {
  healthy: ['Healthy', 'bg-good-soft text-good'],
  risk: ['At risk', 'bg-[#fff4d6] text-[#8a5a00]'],
  inactive: ['Inactive', 'bg-bad-soft text-bad'],
}
export function HealthBadge({ c }: { c: Pick<Customer, 'health' | 'healthWhy'> }) {
  const [label, style] = HEALTH[c.health]
  return (
    <span title={c.healthWhy} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${style}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {t(label)}
    </span>
  )
}

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Section({ title, sub, actions, children, className = '' }: { title: string; sub?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={`p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {sub && <p className="text-sm text-muted">{sub}</p>}
        </div>
        {actions}
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  )
}

export function Kpi({ label, value, note, tone }: { label: string; value: ReactNode; note?: string; tone?: 'good' | 'warn' }) {
  return (
    <div className={`min-w-0 rounded-2xl bg-white px-4 py-4 shadow-card ${tone === 'warn' ? 'ring-1 ring-[#f3d38a]' : ''}`}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {tone && <span aria-hidden className={`size-1.5 rounded-full ${tone === 'good' ? 'bg-emerald-500' : 'bg-amber-500'}`} />}
        <span className="truncate">{label}</span>
      </p>
      <p className={`tabular mt-1.5 truncate font-display text-[1.7rem] leading-none font-bold tracking-tight ${tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-[#b25e00]' : ''}`}>{value}</p>
      {note && <p className="mt-1.5 text-xs leading-snug text-muted">{note}</p>}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string, number?][] }) {
  return (
    <div className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden" role="tablist">
      {items.map(([v, label, count]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${value === v ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`}
        >
          {label}
          {count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-muted">{count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Runs a save, with busy, error and done messages; asks first when given a question. */
export function useAction() {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const run = async (label: string, fn: () => Promise<unknown>, ok: string, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return
    setBusy(label)
    setError('')
    setDone('')
    try {
      await fn()
      setDone(ok)
    } catch (e) {
      const { code, message } = e as { code?: string; message?: string }
      // Our own plain-language messages have no code; Firebase's do, and are reworded here.
      setError(String(code ?? '').includes('permission') ? t('Your role does not allow this.') : !code && message ? message : t('That did not save. Check your connection and try again.'))
    } finally {
      setBusy('')
    }
  }
  const messages = (
    <>
      {error && <p className="rounded-lg bg-bad-soft px-4 py-2 text-sm text-bad">{error}</p>}
      {done && <p className="rounded-lg bg-good-soft px-4 py-2 text-sm text-good">{done}</p>}
    </>
  )
  // A new problem replaces an old success message, so the two never show together.
  const showError = (message: string) => {
    setDone('')
    setError(message)
  }
  return { busy, run, messages, setError: showError }
}

/** A row of tiny bars: activity per week. */
export function Spark({ values, max = 7 }: { values: number[]; max?: number }) {
  return (
    <span className="inline-flex h-5 items-end gap-px" aria-hidden>
      {values.map((v, i) => (
        <span key={i} className="w-1 rounded-sm bg-accent" style={{ height: `${Math.max(1, (v / max) * 20)}px`, opacity: v ? 1 : 0.2 }} />
      ))}
    </span>
  )
}

export const th = 'px-3 py-2.5 text-left text-xs font-medium text-muted first:pl-5 last:pr-5'
export const td = 'px-3 py-2.5 first:pl-5 last:pr-5'

/**
 * A list for a phone, in place of a wide table: one card for each row, with what matters most
 * on top. Shown below the `sm` width; the table it stands in for is hidden there.
 */
export function RowCards({ children }: { children: ReactNode }) {
  return <ul className="space-y-2.5 sm:hidden">{children}</ul>
}

export function RowCard({ title, sub, right, children, onClick }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; children?: ReactNode; onClick?: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="block w-full rounded-2xl bg-white px-4 py-3.5 text-left shadow-card active:bg-slate-50">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink">{title}</span>
            {sub && <span className="mt-0.5 block truncate text-xs text-muted">{sub}</span>}
          </span>
          {right && <span className="shrink-0 text-right">{right}</span>}
        </span>
        {children && <span className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-2.5 text-xs text-muted">{children}</span>}
      </button>
    </li>
  )
}
