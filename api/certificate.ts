import { type PublicCertificate, earns, newCode, tally, tidyCode, tidyText } from './_lib/certificate.js'
import { HttpError, failure, firebase, json, member } from './_lib/server.js'

/**
 * Certificates of attendance, kept in `certificates/{code}`, a place no browser can read or
 * write: only this function does, so a certificate's figures always come from the records.
 *
 * GET ?code=…  Anyone: the certificate behind a code, for the public check page.
 * POST issue   The organiser: certificates for everyone chosen who meets the minimum attendance.
 *              Asking again updates the figures and keeps each person's code.
 * POST list    The organiser: the certificates already issued for a class or session.
 * POST revoke  The organiser: withdraw certificates; their check page then says so.
 */

const COLLECTION = 'certificates'
const MAX_PEOPLE = 500

type Doc = PublicCertificate & { orgId: string; ownerId: string; sourceKind: string; sourceId: string; key: string; min: number }

const shown = (d: Doc): PublicCertificate => ({
  code: d.code,
  name: d.name,
  course: d.course,
  issuer: d.issuer,
  signedBy: d.signedBy,
  from: d.from,
  to: d.to,
  hours: d.hours,
  sessions: d.sessions,
  rate: d.rate,
  issuedAt: d.issuedAt,
  revoked: Boolean(d.revoked),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const code = tidyCode(new URL(request.url).searchParams.get('code'))
    if (!code) return json({ error: 'not_found' }, 404)
    const snap = await firebase().db.doc(`${COLLECTION}/${code}`).get()
    if (!snap.exists) return json({ error: 'not_found' }, 404)
    return json({ certificate: shown(snap.data() as Doc) })
  } catch (e) {
    return failure(e)
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const me = await member(request)
    const { db } = firebase()
    const body = (await request.json().catch(() => ({}))) as {
      action?: string
      source?: { kind?: string; id?: string }
      keys?: unknown
      codes?: unknown
      min?: unknown
      course?: unknown
      issuer?: unknown
      signedBy?: unknown
    }
    const kind = body.source?.kind === 'session' ? 'session' : body.source?.kind === 'class' ? 'class' : null
    const sourceId = tidyText(body.source?.id, 200)
    if (!kind || !sourceId || sourceId.includes('/')) throw new HttpError(400, 'Unknown request.')

    // The class or session must be theirs, or in their organisation when they are its admin.
    const source = (await db.doc(`${kind === 'class' ? 'classes' : 'sessions'}/${sourceId}`).get()).data()
    if (!source || source.organisationId !== me.orgId || (source.ownerId !== me.uid && me.role !== 'admin')) {
      throw new HttpError(404, 'That class could not be found.')
    }
    const issued = async () => (await db.collection(COLLECTION).where('sourceId', '==', sourceId).get()).docs.map((d) => d.data() as Doc).filter((d) => d.orgId === me.orgId)

    if (body.action === 'list') {
      return json({ certificates: (await issued()).map((d) => ({ ...shown(d), key: d.key })) })
    }

    if (body.action === 'revoke') {
      const codes = new Set((Array.isArray(body.codes) ? body.codes : []).map(tidyCode).filter(Boolean))
      const mine = (await issued()).filter((d) => codes.has(d.code))
      const batch = db.batch()
      for (const d of mine) batch.update(db.doc(`${COLLECTION}/${d.code}`), { revoked: true })
      if (mine.length) await batch.commit()
      return json({ revoked: mine.length })
    }

    if (body.action !== 'issue') throw new HttpError(400, 'Unknown request.')
    const keys = [...new Set((Array.isArray(body.keys) ? body.keys : []).map((k) => tidyText(k, 200)).filter(Boolean))]
    if (!keys.length) throw new HttpError(400, 'Choose who gets a certificate.')
    if (keys.length > MAX_PEOPLE) throw new HttpError(400, 'That is too many people at once.')
    const min = Math.min(100, Math.max(0, Math.round(Number(body.min) || 0)))
    const course = tidyText(body.course, 160) || tidyText(source.name, 160)
    const issuer = tidyText(body.issuer, 160) || tidyText(me.org.name, 160)
    const signedBy = tidyText(body.signedBy, 120)

    // The sessions that were held, and every check-in to them.
    const held =
      kind === 'session'
        ? source.startedAt ? [{ id: sourceId, date: source.date, startTime: source.startTime, endTime: source.endTime }] : []
        : (await db.collection('sessions').where('classId', '==', sourceId).get()).docs
            .map((d) => ({ id: d.id, ...(d.data() as { date: string; startTime?: string; endTime?: string; startedAt?: unknown; organisationId?: string }) }))
            .filter((s) => s.startedAt && s.organisationId === me.orgId)
    if (!held.length) throw new HttpError(400, 'No sessions have been held yet.')
    const marks = []
    for (let i = 0; i < held.length; i += 30) {
      const ids = held.slice(i, i + 30).map((s) => s.id)
      const snap = await db.collection('attendance').where('sessionId', 'in', ids).get()
      for (const d of snap.docs) {
        const r = d.data()
        if (r.organisationId === me.orgId) marks.push({ sessionId: r.sessionId, studentKey: r.studentKey, studentName: r.studentName, studentId: r.studentId, status: r.status })
      }
    }
    const rows = tally(held, marks)

    const before = new Map((await issued()).map((d) => [d.key, d]))
    const now = Date.now()
    const out: (PublicCertificate & { key: string })[] = []
    const batch = db.batch()
    let skipped = 0
    for (const key of keys) {
      const row = rows.get(key)
      if (!row || !earns(row, min) || !row.name) {
        skipped += 1
        continue
      }
      const old = before.get(key)
      const doc: Doc = {
        code: old?.code ?? newCode(),
        name: tidyText(row.name, 120),
        course,
        issuer,
        signedBy,
        from: row.from,
        to: row.to,
        hours: row.hours,
        sessions: row.attended,
        rate: row.rate,
        issuedAt: old?.issuedAt ?? now,
        revoked: false,
        orgId: me.orgId,
        ownerId: source.ownerId,
        sourceKind: kind,
        sourceId,
        key,
        min,
      }
      // A new code is created only if it is free; with 32^8 codes a clash is all but impossible.
      if (!old && (await db.doc(`${COLLECTION}/${doc.code}`).get()).exists) doc.code = newCode()
      batch.set(db.doc(`${COLLECTION}/${doc.code}`), doc)
      out.push({ ...shown(doc), key })
    }
    if (out.length) await batch.commit()
    return json({ certificates: out, skipped })
  } catch (e) {
    return failure(e)
  }
}
