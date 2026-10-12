import { emailOrg } from './_lib/email.js'
import { failure, firebase, json } from './_lib/server.js'

const DAY = 86_400_000
const TRIAL_DAYS = 14

/**
 * Run once a day by Vercel. Tells each customer on a Pro trial when it is about to end (three
 * days before), and when it has. Each email goes once: asking again, by anyone, sends nothing new
 * and shows nothing about any customer.
 */
export async function GET(): Promise<Response> {
  try {
    const { db } = firebase()
    const trials = await db.collection('organisations').where('plan', '==', 'trial').get()
    const now = Date.now()
    let sent = 0
    for (const doc of trials.docs) {
      const started = doc.data().trialStarted?.toMillis?.()
      if (!started) continue
      const until = started + TRIAL_DAYS * DAY
      const left = Math.ceil((until - now) / DAY)
      const day = new Date(until).toISOString().slice(0, 10)
      if (left > 0 && left <= 3) sent += Number(await emailOrg(db, doc.id, 'trialEnding', { days: String(left), until: day }).catch(() => false))
      // Only for a trial that ended lately: nobody is told weeks after the fact.
      else if (left <= 0 && left > -7) sent += Number(await emailOrg(db, doc.id, 'trialEnded', { until: day }).catch(() => false))
    }
    return json({ checked: trials.size, sent })
  } catch (e) {
    return failure(e)
  }
}
