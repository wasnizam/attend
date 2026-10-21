import { randomBytes } from 'node:crypto'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { SITE, company, emailSettings, send } from './email.js'
import { render } from './emailText.js'
import { DEFAULT_SETTINGS, type Facts, type GrowthSettings, type Stage, type Template, WINDOW_DAYS, due, editionOf, fill, templateId, tidySettings, unsubscribeToken } from './growth.js'
import { codeFor } from './referral.js'

const DAY = 86_400_000
/** Where the follow-up wording and the daily limit are kept. No browser reads or writes it. */
export const GROWTH_SETTINGS = 'growthConfig/settings'
const SECRET = 'platformSecrets/growth'

export async function growthSettings(db: Firestore): Promise<GrowthSettings> {
  const saved = (await db.doc(GROWTH_SETTINGS).get()).data()
  return saved ? tidySettings(saved) : DEFAULT_SETTINGS
}

/** The key that signs unsubscribe links: made once, kept where no browser can read it. */
export async function unsubscribeSecret(db: Firestore): Promise<string> {
  const ref = db.doc(SECRET)
  const saved = (await ref.get()).data()?.unsubscribe
  if (typeof saved === 'string' && saved.length >= 32) return saved
  const made = randomBytes(32).toString('hex')
  await ref.set({ unsubscribe: made }, { merge: true })
  return made
}

export const unsubscribeLink = (secret: string, orgId: string) => `${SITE()}/api/unsubscribe?o=${encodeURIComponent(orgId)}&t=${unsubscribeToken(secret, orgId)}`

/** One follow-up email, to a customer's owner, or to `to` instead when it is a test. */
export async function sendFollowUp(db: Firestore, orgId: string, template: Template, opts: { to?: string; secret: string; name?: string }): Promise<{ ok: boolean; error?: string; to?: string; subject?: string }> {
  const settings = await emailSettings()
  if (!settings.apiKey || !settings.from) return { ok: false, error: 'Emails are not set up yet.' }
  const org = (await db.doc(`organisations/${orgId}`).get()).data()
  const owner = org?.ownerId ? (await db.doc(`users/${org.ownerId}`).get()).data() : undefined
  const to = opts.to ?? owner?.email
  if (!to) return { ok: false, error: 'No address to send to.' }
  const wantsInvite = /\{invite\}/.test(`${template.body}${template.path}${template.button}`)
  const invite = wantsInvite && org ? `${SITE()}/?ref=${await codeFor(db, orgId)}` : undefined
  const words = fill(template, { name: opts.name ?? owner?.name, organisation: org?.name, invite })
  const unsubscribe = unsubscribeLink(opts.secret, orgId)
  const { html, text } = render(words, SITE(), company(settings.from), unsubscribe)
  const result = await send(settings, to, words.subject, html, text, { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' })
  return { ...result, to, subject: words.subject }
}

/** What the daily job knows about every customer: sessions with someone in them, within the window. */
async function facts(db: Firestore, now: number): Promise<Map<string, Omit<Facts, 'createdAt' | 'emailed' | 'off' | 'suspended'> & { dates: Set<string> }>> {
  const since = Timestamp.fromMillis(now - WINDOW_DAYS * DAY)
  const snap = await db.collection('sessions').where('startedAt', '>=', since).select('organisationId', 'startedAt', 'presentCount', 'date').get()
  const out = new Map<string, { first: number | null; last: number | null; days: number; dates: Set<string> }>()
  for (const d of snap.docs) {
    const s = d.data()
    if (!s.organisationId || (s.presentCount ?? 0) < 1) continue
    const at = s.startedAt?.toMillis?.() as number | undefined
    if (!at) continue
    const f = out.get(s.organisationId) ?? { first: null, last: null, days: 0, dates: new Set<string>() }
    f.first = f.first === null ? at : Math.min(f.first, at)
    f.last = f.last === null ? at : Math.max(f.last, at)
    f.dates.add(String(s.date ?? new Date(at).toISOString().slice(0, 10)))
    f.days = f.dates.size
    out.set(s.organisationId, f)
  }
  return out
}

/**
 * Run by the daily job: each customer due a follow-up gets it, up to the daily limit. Each stage
 * is marked on the organisation (followUps.<stage>) and logged, so it is not sent twice.
 */
export async function runFollowUps(db: Firestore, now = Date.now()): Promise<number> {
  const settings = await growthSettings(db)
  const email = await emailSettings()
  if (!email.apiKey || !email.from || settings.dailyCap <= 0) return 0
  const [orgs, seen, secret] = await Promise.all([db.collection('organisations').get(), facts(db, now), unsubscribeSecret(db)])
  let sent = 0
  for (const doc of orgs.docs) {
    if (sent >= settings.dailyCap) break
    const org = doc.data()
    const s = seen.get(doc.id)
    const stage = due(
      {
        createdAt: org.createdAt?.toMillis?.() ?? null,
        first: s?.first ?? null,
        last: s?.last ?? null,
        days: s?.days ?? 0,
        emailed: Object.fromEntries(Object.entries((org.followUps ?? {}) as Record<string, { toMillis?: () => number }>).map(([k, v]) => [k, v?.toMillis?.() ?? 0])),
        off: Boolean(org.marketingOff),
        suspended: Boolean(org.suspended),
      },
      now,
    )
    if (!stage) continue
    const edition = editionOf(org.purpose)
    const id = templateId(stage, edition)
    const template = settings.templates[id]
    if (!template?.on) continue
    const result: { ok: boolean; to?: string; subject?: string } = await sendFollowUp(db, doc.id, template, { secret }).catch(() => ({ ok: false }))
    if (!result.ok) continue
    sent += 1
    await doc.ref.update({ [`followUps.${stage}`]: FieldValue.serverTimestamp() })
    // The customer's health when it went, the way the Console judges it, so each email's results
    // can be read by health later.
    const days30 = [...(s?.dates ?? [])].filter((d) => d >= new Date(now - 29 * DAY).toISOString().slice(0, 10)).length
    const health = !s?.first ? 'new' : days30 === 0 ? 'inactive' : days30 < 4 ? 'risk' : 'healthy'
    await db.collection('growthLog').add({ orgId: doc.id, orgName: String(org.name ?? ''), to: result.to ?? '', subject: result.subject ?? '', stage, template: id, edition, health, at: now })
  }
  return sent
}

export interface StageStats {
  sent30: number
  sentAll: number
  /** Of the customers emailed in the last 90 days, how many ran a session within 7 days after. */
  cameBack: number
  measured: number
}

/** How each follow-up is doing, for the Console. */
export async function followUpStats(db: Firestore, now = Date.now()): Promise<Record<Stage, StageStats>> {
  const out = Object.fromEntries((['firstSession', 'invite', 'tips', 'quiet', 'winback'] as Stage[]).map((s) => [s, { sent30: 0, sentAll: 0, cameBack: 0, measured: 0 }])) as Record<Stage, StageStats>
  const log = await db.collection('growthLog').where('at', '>=', now - 365 * DAY).get()
  if (log.empty) return out
  const sessions = await db.collection('sessions').where('startedAt', '>=', Timestamp.fromMillis(now - 97 * DAY)).select('organisationId', 'startedAt', 'presentCount').get()
  const byOrg = new Map<string, number[]>()
  for (const d of sessions.docs) {
    const s = d.data()
    if ((s.presentCount ?? 0) < 1 || !s.organisationId) continue
    const at = s.startedAt?.toMillis?.()
    if (at) byOrg.set(s.organisationId, [...(byOrg.get(s.organisationId) ?? []), at])
  }
  for (const d of log.docs) {
    const e = d.data() as { orgId: string; stage: Stage; at: number }
    const row = out[e.stage]
    if (!row) continue
    row.sentAll += 1
    if (now - e.at < 30 * DAY) row.sent30 += 1
    // Only emails old enough to have had their 7 days, and young enough for the sessions read.
    if (now - e.at >= 7 * DAY && now - e.at < 90 * DAY) {
      row.measured += 1
      if ((byOrg.get(e.orgId) ?? []).some((t) => t > e.at && t - e.at <= 7 * DAY)) row.cameBack += 1
    }
  }
  return out
}

export interface SentRow {
  id: string
  orgId: string
  orgName: string
  to: string
  subject: string
  stage: Stage
  template: string
  edition: string
  health: string
  at: number
  /** Ran a session within 7 days after: yes, no, or not known yet (fewer than 7 days ago). */
  cameBack: 'yes' | 'no' | 'pending'
}

/** Sessions with people in them since a moment, by organisation: when each started. */
async function sessionTimes(db: Firestore, since: number, orgId?: string): Promise<Map<string, number[]>> {
  let q = db.collection('sessions').where('startedAt', '>=', Timestamp.fromMillis(since))
  if (orgId) q = db.collection('sessions').where('organisationId', '==', orgId)
  const snap = await q.select('organisationId', 'startedAt', 'presentCount').get()
  const out = new Map<string, number[]>()
  for (const d of snap.docs) {
    const s = d.data()
    const at = s.startedAt?.toMillis?.()
    if ((s.presentCount ?? 0) < 1 || !s.organisationId || !at || at < since) continue
    out.set(s.organisationId, [...(out.get(s.organisationId) ?? []), at])
  }
  return out
}

const rowOf = (id: string, e: Record<string, unknown>, times: number[] | undefined, now: number): SentRow => {
  const at = Number(e.at) || 0
  const back = (times ?? []).some((t) => t > at && t - at <= 7 * DAY)
  return {
    id,
    orgId: String(e.orgId ?? ''),
    orgName: String(e.orgName ?? ''),
    to: String(e.to ?? ''),
    subject: String(e.subject ?? ''),
    stage: e.stage as Stage,
    template: String(e.template ?? ''),
    edition: String(e.edition ?? ''),
    health: String(e.health ?? ''),
    at,
    cameBack: back ? 'yes' : now - at < 7 * DAY ? 'pending' : 'no',
  }
}

/** Every follow-up sent in the last 90 days, newest first, with whether the customer came back. */
export async function sentLog(db: Firestore, now = Date.now()): Promise<SentRow[]> {
  const log = await db.collection('growthLog').where('at', '>=', now - 90 * DAY).get()
  if (log.empty) return []
  const times = await sessionTimes(db, now - 90 * DAY)
  return log.docs.map((d) => rowOf(d.id, d.data(), times.get(d.data().orgId), now)).sort((a, b) => b.at - a.at)
}

export interface CustomerEmail {
  at: number
  kind: 'followUp' | 'account'
  subject: string
  to: string
  stage?: Stage
  health?: string
  cameBack?: SentRow['cameBack']
}

/** Everything Dobry has emailed one customer: follow-ups, and account emails (welcome, trial, payments). */
export async function customerEmails(db: Firestore, orgId: string, now = Date.now()): Promise<{ emails: CustomerEmail[]; unsubscribedAt: number | null }> {
  const [follow, account, org, times] = await Promise.all([
    db.collection('growthLog').where('orgId', '==', orgId).get(),
    db.collection('platformAudit').where('organisationId', '==', orgId).where('action', '==', 'email sent').get(),
    db.doc(`organisations/${orgId}`).get(),
    sessionTimes(db, 0, orgId),
  ])
  const emails: CustomerEmail[] = [
    ...follow.docs.map((d) => {
      const r = rowOf(d.id, d.data(), times.get(orgId), now)
      return { at: r.at, kind: 'followUp' as const, subject: r.subject, to: r.to, stage: r.stage, health: r.health, cameBack: r.cameBack }
    }),
    ...account.docs.map((d) => {
      const a = d.data()
      // Written as "Subject → address" by the account emails.
      const [subject, to] = String(a.detail ?? '').split(' → ')
      return { at: a.at?.toMillis?.() ?? 0, kind: 'account' as const, subject: subject ?? '', to: to ?? '' }
    }),
  ].sort((a, b) => b.at - a.at)
  const off = org.data()
  return { emails, unsubscribedAt: off?.marketingOff ? (off.marketingOffAt?.toMillis?.() ?? 0) : null }
}
