import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { type EmailKind, emailText, render } from './emailText.js'
import { firebase } from './server.js'

/** Where the email key is kept: a place in the database that no browser can read or write. */
export const EMAIL_SECRETS = 'platformSecrets/email'
const SITE = () => (process.env.SITE_URL?.trim() || 'https://dobry.app').replace(/\/$/, '')

export interface EmailSettings {
  apiKey: string
  /** "Dobry <hello@dobry.app>": an address on a domain the email service has checked. */
  from: string
  replyTo: string
}

let cached: { at: number; value: EmailSettings } | null = null
export const forgetEmailSettings = () => {
  cached = null
}

/** The email key and sender saved from the Console (or set in Vercel). Remembered for a minute. */
export async function emailSettings(fresh = false): Promise<EmailSettings> {
  if (!fresh && cached && Date.now() - cached.at < 60_000) return cached.value
  const saved = (await firebase().db.doc(EMAIL_SECRETS).get()).data() ?? {}
  const value = { apiKey: saved.apiKey || process.env.RESEND_API_KEY?.trim() || '', from: saved.from || process.env.EMAIL_FROM?.trim() || '', replyTo: saved.replyTo || '' }
  cached = { at: Date.now(), value }
  return value
}

/** Sends one email through Resend. Says why when it could not. */
export async function send(settings: EmailSettings, to: string, subject: string, html: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!settings.apiKey || !settings.from) return { ok: false, error: 'Emails are not set up yet.' }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${settings.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: settings.from, to: [to], subject, html, text, ...(settings.replyTo ? { reply_to: settings.replyTo } : {}) }),
    })
    if (res.ok) return { ok: true }
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    return { ok: false, error: body.message || `The email service answered ${res.status}.` }
  } catch {
    return { ok: false, error: 'The email service could not be reached.' }
  }
}

/** The sender's name for the foot of an email: what is before the address in "Dobry <…>". */
const company = (from: string) => from.replace(/<.*$/, '').trim() || 'Dobry'

/**
 * Emails an organisation's owner, once per `key` (the kind of email, unless told otherwise): a
 * mark on the organisation stops the same one going twice. Does nothing, quietly, while emails
 * are not set up. Returns whether one was sent.
 */
export async function emailOrg(db: Firestore, orgId: string, kind: Exclude<EmailKind, 'test'>, data: Record<string, string> = {}, key: string = kind): Promise<boolean> {
  const settings = await emailSettings()
  if (!settings.apiKey || !settings.from) return false
  const ref = db.doc(`organisations/${orgId}`)
  const org = (await ref.get()).data()
  if (!org || org.suspended || org.emailed?.[key]) return false
  const owner = org.ownerId ? (await db.doc(`users/${org.ownerId}`).get()).data() : undefined
  if (!owner?.email) return false
  const { html, text } = render(emailText(kind, { name: owner.name, organisation: org.name, purpose: org.purpose }, data), SITE(), company(settings.from))
  const words = emailText(kind, { name: owner.name, organisation: org.name, purpose: org.purpose }, data)
  const result = await send(settings, owner.email, words.subject, html, text)
  if (!result.ok) return false
  await ref.update({ [`emailed.${key}`]: FieldValue.serverTimestamp() })
  await db.collection('platformAudit').add({ actor: 'dobry', actorEmail: 'Dobry', action: 'email sent', detail: `${words.subject} → ${owner.email}`, organisationId: orgId, organisationName: org.name ?? '', at: FieldValue.serverTimestamp() })
  return true
}
