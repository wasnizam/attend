import { DEFAULT_RULES, tidyAdjustments, tidyPeriod, tidyRules, tidyStaff } from './_lib/pay.js'
import { HttpError, caller, failure, firebase, json } from './_lib/server.js'

/**
 * Salaries and pay rules, for the company's admins only. Kept in `paySettings/{orgId}` and
 * `payPeriods/{orgId}_{from}_{to}`, places no browser can read or write on its own.
 *
 * get           The rules and everyone's pay.
 * save          Replace them.
 * period        The one-off additions and deductions for a pay period.
 * savePeriod    Replace those.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const me = await caller(request).catch((e) => {
      // The usual message talks about changing the plan; here it is about salaries.
      if (e instanceof HttpError && e.status === 403 && /admin/.test(e.message)) throw new HttpError(403, 'Only an admin of your organisation can see pay.')
      throw e
    })
    const { db } = firebase()
    const body = (await request.json().catch(() => ({}))) as { action?: string; rules?: unknown; staff?: unknown; period?: unknown; adjustments?: unknown }
    const settings = db.doc(`paySettings/${me.orgId}`)

    if (body.action === 'get') {
      const saved = (await settings.get()).data()
      return json({ rules: saved?.rules ? tidyRules(saved.rules) : DEFAULT_RULES, staff: tidyStaff(saved?.staff), saved: Boolean(saved) })
    }
    if (body.action === 'save') {
      const value = { rules: tidyRules(body.rules), staff: tidyStaff(body.staff), updatedAt: Date.now(), updatedBy: me.uid }
      await settings.set(value)
      return json({ rules: value.rules, staff: value.staff, saved: true })
    }

    const period = tidyPeriod(body.period)
    if (!period) throw new HttpError(400, 'Unknown request.')
    const doc = db.doc(`payPeriods/${me.orgId}_${period}`)
    if (body.action === 'period') return json({ adjustments: tidyAdjustments((await doc.get()).data()?.adjustments) })
    if (body.action === 'savePeriod') {
      const adjustments = tidyAdjustments(body.adjustments)
      await doc.set({ orgId: me.orgId, period, adjustments, updatedAt: Date.now(), updatedBy: me.uid })
      return json({ adjustments })
    }
    throw new HttpError(400, 'Unknown request.')
  } catch (e) {
    return failure(e)
  }
}
