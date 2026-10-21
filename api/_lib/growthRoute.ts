import { FieldValue } from 'firebase-admin/firestore'
import { GROWTH_SETTINGS, followUpStats, growthSettings, sendFollowUp, unsubscribeSecret } from './followUps.js'
import { DEFAULT_TEMPLATES, STAGES, tidySettings } from './growth.js'
import { HttpError, failure, firebase, json, staff } from './server.js'

/**
 * Growth, for Dobry's team: the follow-up emails (wording, on or off, a daily limit, how each is
 * doing), and what customers said when asked for feedback. Anyone on the team can look; owners
 * and admins change the emails.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const me = await staff(request, ['owner', 'admin', 'finance', 'support', 'viewer'])
    const { db } = firebase()
    const body = (await request.json().catch(() => ({}))) as { action?: string; settings?: unknown; template?: unknown }
    const editor = me.role === 'owner' || me.role === 'admin'

    if (body.action === 'get') {
      const [settings, stats, unsubscribed] = await Promise.all([growthSettings(db), followUpStats(db), db.collection('organisations').where('marketingOff', '==', true).count().get()])
      return json({ settings, defaults: DEFAULT_TEMPLATES, stages: STAGES, stats, unsubscribed: unsubscribed.data().count, canEdit: editor })
    }
    if (body.action === 'save') {
      if (!editor) throw new HttpError(403, 'Your role does not allow this.')
      const settings = tidySettings(body.settings)
      await db.doc(GROWTH_SETTINGS).set({ ...settings, updatedAt: FieldValue.serverTimestamp(), updatedBy: me.email })
      await db.collection('platformAudit').add({ actor: me.uid, actorEmail: me.email, action: 'follow-up emails', detail: `Saved: ${Object.entries(settings.templates).filter(([, t]) => t.on).length} on, up to ${settings.dailyCap} a day`, at: FieldValue.serverTimestamp() })
      return json({ settings })
    }
    if (body.action === 'test') {
      if (!me.email) throw new HttpError(400, 'Your Console account has no email address.')
      const settings = tidySettings(body.settings)
      const id = String(body.template ?? '')
      const template = settings.templates[id]
      if (!template) throw new HttpError(400, 'Unknown email.')
      // Sent as if to a customer, so the invite link and the unsubscribe link look real; the
      // unsubscribe link in a test points at no customer.
      const result = await sendFollowUp(db, '_test', template, { to: me.email, secret: await unsubscribeSecret(db), name: 'Aisyah Rahman' })
      if (!result.ok) throw new HttpError(400, result.error ?? 'The test could not be sent.')
      return json({ sent: me.email })
    }
    if (body.action === 'feedback') {
      const snap = await db.collection('feedback').orderBy('at', 'desc').limit(500).get()
      return json({ feedback: snap.docs.map((d) => ({ id: d.id, ...d.data() })) })
    }
    throw new HttpError(400, 'Unknown request.')
  } catch (e) {
    return failure(e)
  }
}
