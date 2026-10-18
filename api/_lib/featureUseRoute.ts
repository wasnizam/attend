import { failure, firebase, json, staff } from './server.js'

/**
 * For Dobry's team: how much the features that keep customers are used. Certificates issued and
 * companies working out pay, in total and per organisation. Only counts leave the server: never a
 * certificate holder's name, and never anyone's salary.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    await staff(request, ['owner', 'admin', 'finance', 'support', 'viewer'])
    const { db } = firebase()
    const since = Date.now() - 30 * 86_400_000

    const certs = await db.collection('certificates').select('orgId', 'issuedAt', 'revoked').limit(50_000).get()
    const certificates = { total: 0, last30: 0, byOrg: {} as Record<string, number> }
    for (const d of certs.docs) {
      const c = d.data()
      if (c.revoked) continue
      certificates.total += 1
      if (typeof c.issuedAt === 'number' && c.issuedAt >= since) certificates.last30 += 1
      if (c.orgId) certificates.byOrg[c.orgId] = (certificates.byOrg[c.orgId] ?? 0) + 1
    }

    const settings = await db.collection('paySettings').limit(10_000).get()
    const pay = { companies: 0, staff: 0, byOrg: {} as Record<string, number> }
    for (const d of settings.docs) {
      const people = Object.keys(d.data().staff ?? {}).length
      if (!people) continue
      pay.companies += 1
      pay.staff += people
      pay.byOrg[d.id] = people
    }
    return json({ certificates, pay })
  } catch (e) {
    return failure(e)
  }
}
