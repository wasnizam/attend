import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  type Actor,
  type Announcement,
  type AuditEntry,
  type BillingEntry,
  type CustomerNote,
  type Invoice,
  type PlatformSettings,
  type StaffMember,
  type StaffRole,
  type Task,
  can,
  fetchAllClasses,
  fetchSessionsSince,
  monthly,
  subscribeAllOrganisations,
  subscribeAllUsers,
  subscribeAnnouncements,
  subscribeAudit,
  subscribeBilling,
  subscribeInvites,
  subscribeInvoices,
  subscribeNotes,
  subscribeSettings,
  subscribeTasks,
  subscribeTeam,
} from '../data/platform'
import { useLive } from '../hooks/useLive'
import { editionForPurpose } from '../lib/editions'
import { addDays, formatDate, isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { PLAN_LABEL, planOf } from '../lib/plan'
import type { Organisation, UserProfile } from '../lib/types'

export const DAY = 86_400_000
export const dateOf = (ms: number | null | undefined) => (ms ? formatDate(isoDate(new Date(ms))) : '—')
export const money = (n: number, currency = 'MYR') =>
  `${currency === 'USD' ? 'US$' : 'RM'}${n.toLocaleString('en-MY', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
/** Amounts in more than one currency, never added together: "RM1,200 + US$90". */
export const moneyMix = (byCurrency: Record<string, number>) =>
  Object.entries(byCurrency)
    .filter(([, n]) => Math.abs(n) > 0.004)
    .map(([c, n]) => money(n, c))
    .join(' + ') || money(0)
export const editionName = (o: Pick<Organisation, 'purpose'>) => editionForPurpose(o.purpose ?? 'education')?.label ?? (o.purpose === 'events' ? 'Events' : 'Lecturers')
export const EDITIONS = ['Lecturers', 'Trainers', 'Workplace']

export type Status = 'early' | 'trial' | 'free' | 'pro' | 'suspended'
export type Health = 'healthy' | 'risk' | 'inactive'
export const statusLabel = (s: Status) => (s === 'suspended' ? t('Suspended') : t(PLAN_LABEL[s]))

export interface Customer {
  org: Organisation
  status: Status
  until: number | null
  lapsed: boolean
  owner?: UserProfile
  users: UserProfile[]
  /** Staff on lists (workplace) or accounts (teaching editions). */
  people: number
  /** Days with something opened, last 30 days. */
  active30: number
  lastSeen: string | null
  joined: number | null
  /** Opened days per week, last 12 weeks, oldest first. */
  weekly: number[]
  health: Health
  healthWhy: string
  /** What they pay per month, in their currency (0 when not paying now). */
  mrr: number
}

interface OwnerData {
  me: Actor & { role: StaffRole }
  customers: Customer[]
  users: UserProfile[]
  billing: BillingEntry[]
  invoices: Invoice[]
  tasks: Task[]
  notes: CustomerNote[]
  team: StaffMember[]
  invites: { id: string; role: StaffRole; at?: { toMillis(): number } }[]
  announcements: Announcement[]
  audit: AuditEntry[]
  settings: PlatformSettings
  staffName: (uid?: string) => string
}

const Ctx = createContext<OwnerData | null>(null)
export const useOwner = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useOwner outside OwnerData')
  return v
}

/** Loads the whole back office once, live, and works out each customer's numbers. */
export function OwnerDataProvider({ me, children, loading, failed }: { me: Actor & { role: StaffRole }; children: ReactNode; loading: ReactNode; failed: ReactNode }) {
  const orgs = useLive<Organisation[]>((d, e) => subscribeAllOrganisations(d, e), [])
  const users = useLive<UserProfile[]>((d, e) => subscribeAllUsers(d, e), [])
  const billing = useLive<BillingEntry[]>((d, e) => subscribeBilling(d, e), [])
  const invoices = useLive<Invoice[]>((d, e) => subscribeInvoices(d, e), [])
  const tasks = useLive<Task[]>((d, e) => subscribeTasks(d, e), [])
  const notes = useLive<CustomerNote[]>((d, e) => subscribeNotes(d, e), [])
  const team = useLive<StaffMember[]>((d, e) => subscribeTeam(d, e), [])
  const invites = useLive<OwnerData['invites']>((d, e) => subscribeInvites(d, e), [])
  const announcements = useLive<Announcement[]>((d, e) => subscribeAnnouncements(d, e), [])
  const auditLog = useLive<AuditEntry[]>(can(me.role, 'audit') ? (d, e) => subscribeAudit(d, e) : null, [me.role])
  const settings = useLive<PlatformSettings>((d, e) => subscribeSettings(d, e), [])
  const [extra, setExtra] = useState<{ sessions: { organisationId: string; date: string; status: string }[]; classes: { organisationId: string; rosterCount?: number; rosterFrom?: string | null }[] } | null>(null)
  const [error, setError] = useState(false)
  const today = isoDate()

  useEffect(() => {
    Promise.all([fetchSessionsSince(addDays(today, -83)), fetchAllClasses()]).then(([sessions, classes]) => setExtra({ sessions, classes }), () => setError(true))
  }, [today])

  const customers = useMemo<Customer[]>(() => {
    if (!orgs.data || !users.data || !extra) return []
    const now = Date.now()
    const from30 = addDays(today, -29)
    return orgs.data
      .map((org) => {
        const p = planOf(org)
        const mine = users.data!.filter((u) => u.organisationId === org.id)
        const held = extra.sessions.filter((s) => s.organisationId === org.id && s.status !== 'scheduled')
        const days30 = new Set(held.filter((s) => s.date >= from30).map((s) => s.date)).size
        const weekly = Array.from({ length: 12 }, (_, i) => {
          const start = addDays(today, -83 + i * 7)
          const end = addDays(start, 6)
          return new Set(held.filter((s) => s.date >= start && s.date <= end).map((s) => s.date)).size
        })
        const people = org.purpose === 'workplace' ? extra.classes.filter((c) => c.organisationId === org.id && !c.rosterFrom).reduce((a, c) => a + (c.rosterCount ?? 0), 0) : mine.length
        const status: Status = org.suspended ? 'suspended' : p.active
        const lastSeen = held.map((s) => s.date).sort().pop() ?? null
        // Health: are they using it, and is anything about to go wrong?
        let health: Health = 'healthy'
        let healthWhy = t('Using it regularly')
        if (status === 'suspended') [health, healthWhy] = ['inactive', t('Suspended')]
        else if (days30 === 0) [health, healthWhy] = ['inactive', t('Nothing opened in 30 days')]
        else if (status === 'pro' && org.seats && org.purpose === 'workplace' && people > org.seats) [health, healthWhy] = ['risk', t('More staff than their plan covers')]
        else if ((status === 'trial' || status === 'pro') && p.until && p.until - now < 7 * DAY) [health, healthWhy] = ['risk', status === 'trial' ? t('Trial ends within a week') : t('Paid period ends within a week')]
        else if (days30 < 4) [health, healthWhy] = ['risk', t('Used on only {n} days this month', { n: days30 })]
        return {
          org,
          status,
          until: p.until,
          lapsed: p.lapsed,
          owner: mine.find((u) => u.id === org.ownerId),
          users: mine,
          people,
          active30: days30,
          lastSeen,
          joined: org.createdAt?.toMillis?.() ?? null,
          weekly,
          health,
          healthWhy,
          mrr: status === 'pro' && org.price ? monthly(org.price) : 0,
        }
      })
      .sort((a, b) => (b.joined ?? 0) - (a.joined ?? 0))
  }, [orgs.data, users.data, extra, today])

  const anyError = error || orgs.error || users.error || billing.error || invoices.error || team.error || settings.error
  if (anyError) return <>{failed}</>
  const ready = orgs.data && users.data && extra && billing.data && invoices.data && tasks.data && notes.data && team.data && invites.data && announcements.data && settings.data && (auditLog.data || !can(me.role, 'audit'))
  if (!ready) return <>{loading}</>
  const byTime = <T extends { at?: { toMillis(): number } | null }>(rows: T[]) => [...rows].sort((a, b) => (b.at?.toMillis() ?? Date.now()) - (a.at?.toMillis() ?? Date.now()))
  const value: OwnerData = {
    me,
    customers,
    users: users.data!,
    billing: byTime(billing.data!),
    invoices: byTime(invoices.data!),
    tasks: tasks.data!,
    notes: byTime(notes.data!),
    team: team.data!,
    invites: invites.data!,
    announcements: announcements.data!,
    audit: byTime(auditLog.data ?? []),
    settings: settings.data!,
    staffName: (uid) => {
      const m = team.data!.find((x) => x.id === uid)
      return m ? m.name || m.email : uid ? t('Former team member') : '—'
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Revenue in by month (payments less refunds), per currency. */
export function revenueByMonth(billing: BillingEntry[], months: string[]) {
  return months.map((m) => {
    const sums: Record<string, number> = {}
    for (const b of billing) {
      if (!b.at || (b.kind !== 'payment' && b.kind !== 'refund')) continue
      if (isoDate(b.at.toDate()).slice(0, 7) !== m) continue
      const c = b.currency ?? 'MYR'
      sums[c] = (sums[c] ?? 0) + (b.kind === 'refund' ? -1 : 1) * (b.amount ?? 0)
    }
    return { month: m, sums }
  })
}

export const lastMonths = (n: number) => {
  const out: string[] = []
  const d = new Date()
  d.setDate(1)
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}
export const monthName = (m: string, long = false) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: long ? 'long' : 'short', year: long ? 'numeric' : undefined })

export function csvDownload(name: string, rows: (string | number)[][]) {
  const text = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
