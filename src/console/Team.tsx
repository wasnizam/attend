import { type FormEvent, useState } from 'react'
import { Button, Card, inputClass } from '../components/ui'
import { ROLE_HELP, ROLE_LABEL, STAFF_ROLES, type StaffRole, can, cancelInvite, changeRole, inviteStaff, removeStaff } from '../data/platform'
import { t } from '../lib/i18n'
import { dateOf, useOwner } from './context'
import { PageHead, Section, td, th, useAction } from './ui'

/** Who works on Attend's back office, and what each may do. */
export default function Team() {
  const { team, invites, me } = useOwner()
  const { busy, run, messages } = useAction()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<StaffRole>('support')
  const owner = can(me.role, 'team')
  const invite = (e: FormEvent) => {
    e.preventDefault()
    const v = email.trim().toLowerCase()
    if (!v) return
    run('invite', async () => { await inviteStaff(v, role, me); setEmail('') }, t('Invitation saved. Ask {email} to sign in at /console with that email (verified).', { email: v }))
  }
  return (
    <>
      <PageHead title={t('Team & roles')} sub={t('The people who run Attend, each with a role. Only owners can change the team.')} />
      {messages}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-x-auto lg:col-span-2">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="bg-slate-50"><tr>{['Member', 'Role', 'Added', ''].map((h) => <th key={h} className={th}>{h && t(h)}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {team.map((m) => (
                <tr key={m.id}>
                  <td className={td}>{m.name || m.email}{m.id === me.id && <span className="ml-1.5 rounded bg-accent-soft px-1.5 text-[11px] text-accent">{t('you')}</span>}<span className="block text-xs text-muted">{m.email}</span></td>
                  <td className={td}>
                    {owner && m.id !== me.id ? (
                      <select value={m.role} disabled={busy === m.id} onChange={(e) => run(m.id, () => changeRole(m, e.target.value as StaffRole, me), t('Role changed.'))} className={`${inputClass} w-auto py-1`}>
                        {STAFF_ROLES.map((r) => <option key={r} value={r}>{t(ROLE_LABEL[r])}</option>)}
                      </select>
                    ) : (
                      t(ROLE_LABEL[m.role])
                    )}
                  </td>
                  <td className={`${td} whitespace-nowrap text-muted`}>{dateOf(m.addedAt?.toMillis())}</td>
                  <td className={`${td} text-right`}>
                    {owner && m.id !== me.id && <button type="button" className="text-xs font-medium text-bad" onClick={() => run(`x${m.id}`, () => removeStaff(m, me), t('Removed from the team.'), t('Remove {email} from the Attend team?', { email: m.email }))}>{t('Remove')}</button>}
                  </td>
                </tr>
              ))}
              {invites.map((i) => (
                <tr key={i.id} className="bg-canvas/60">
                  <td className={td}>{i.id}<span className="block text-xs text-muted">{t('Invited, not signed in yet')}</span></td>
                  <td className={td}>{t(ROLE_LABEL[i.role])}</td>
                  <td className={`${td} text-muted`}>{dateOf(i.at?.toMillis())}</td>
                  <td className={`${td} text-right`}>{owner && <button type="button" className="text-xs font-medium text-bad" onClick={() => run(`i${i.id}`, () => cancelInvite(i.id, me), t('Invitation cancelled.'))}>{t('Cancel')}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="space-y-4">
          {owner && (
            <Section title={t('Invite someone')}>
              <form onSubmit={invite} className="space-y-2">
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('name@company.com')} className={inputClass} />
                <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className={inputClass}>{STAFF_ROLES.map((r) => <option key={r} value={r}>{t(ROLE_LABEL[r])}</option>)}</select>
                <Button type="submit" busy={busy === 'invite'}>{t('Invite')}</Button>
              </form>
              <p className="mt-2 text-xs text-muted">{t('They sign in at /console with this email (Google, or a verified email account), and join with this role.')}</p>
            </Section>
          )}
          <Section title={t('What each role can do')}>
            <ul className="space-y-2 text-sm">
              {STAFF_ROLES.map((r) => <li key={r}><span className="font-medium">{t(ROLE_LABEL[r])}</span><span className="block text-muted">{t(ROLE_HELP[r])}</span></li>)}
            </ul>
          </Section>
        </div>
      </div>
    </>
  )
}
