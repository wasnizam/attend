import { randomBytes } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { newCode, tidyCode } from './_lib/gift.js'
import { HttpError, failure, firebase, json, staff } from './_lib/server.js'

const EDITIONS = ['any', 'lecturers', 'trainers', 'workplace']
const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}

/**
 * Free access codes for Dobry's team (owner, admin or finance): make a batch, list them, or
 * switch one off. Codes live where no browser can read them, so they cannot be guessed at or listed
 * by anyone else.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const me = await staff(request, ['owner', 'admin', 'finance'])
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const { db } = firebase()
    const codes = db.collection('giftCodes')
    const audit = (detail: string) => db.collection('platformAudit').add({ actor: me.uid, actorEmail: me.email, action: 'free code', detail, at: FieldValue.serverTimestamp() })

    if (body.action === 'create') {
      const edition = EDITIONS.includes(String(body.edition)) ? String(body.edition) : 'any'
      const months = int(body.months, 1, 60, 1)
      const seats = edition === 'trainers' ? 0 : int(body.seats, 0, 100000, 0)
      const count = int(body.count, 1, 50, 1)
      const maxUses = int(body.maxUses, 1, 10000, 1)
      const redeemBy = typeof body.redeemBy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.redeemBy) ? body.redeemBy : null
      const note = String(body.note ?? '').trim().slice(0, 120)
      // One code may be given a name of the team's choosing (e.g. UITM2026) instead of a random one.
      const custom = count === 1 && typeof body.code === 'string' && body.code.trim() ? tidyCode(body.code) : ''
      if (custom && !/^[A-Z0-9-]{4,40}$/.test(custom)) throw new HttpError(400, 'A code uses 4 to 40 letters, digits and dashes.')
      const made: string[] = []
      for (let i = 0; i < count; i++) {
        // A clash with an existing code is as good as impossible for a random one, and an error for a chosen one.
        for (let tries = 0; ; tries++) {
          const code = custom || newCode(randomBytes(8))
          const created = await codes.doc(code).create({ code, edition, months, seats, maxUses, uses: 0, redeemBy, note, disabled: false, redeemedBy: [], createdBy: me.email || me.uid, createdAt: FieldValue.serverTimestamp() }).then(() => true, () => false)
          if (created) {
            made.push(code)
            break
          }
          if (custom) throw new HttpError(400, 'That code already exists. Choose another.')
          if (tries > 4) throw new HttpError(500, 'Something went wrong. Please try again.')
        }
      }
      await audit(`Made ${made.length} code${made.length === 1 ? '' : 's'}: ${months} month${months === 1 ? '' : 's'} free, ${edition}${seats ? `, ${seats} staff` : ''}, ${maxUses} use${maxUses === 1 ? '' : 's'} each${note ? ` (${note})` : ''}: ${made.join(', ')}`.slice(0, 1000))
    } else if (body.action === 'disable' || body.action === 'enable') {
      const code = tidyCode(String(body.code ?? ''))
      const ref = codes.doc(code)
      if (!code || !(await ref.get()).exists) throw new HttpError(404, 'That code does not exist.')
      await ref.update({ disabled: body.action === 'disable' })
      await audit(`${body.action === 'disable' ? 'Switched off' : 'Switched on'} ${code}`)
    } else if (body.action !== 'list') {
      throw new HttpError(400, 'Unknown request.')
    }

    const snap = await codes.orderBy('createdAt', 'desc').limit(300).get()
    return json({
      codes: snap.docs.map((d) => {
        const c = d.data()
        return { code: c.code, edition: c.edition, months: c.months, seats: c.seats ?? 0, maxUses: c.maxUses, uses: c.uses ?? 0, redeemBy: c.redeemBy ?? null, note: c.note ?? '', disabled: Boolean(c.disabled), redeemedBy: c.redeemedBy ?? [], createdBy: c.createdBy ?? '', createdAt: c.createdAt?.toMillis?.() ?? null }
      }),
    })
  } catch (e) {
    return failure(e)
  }
}
