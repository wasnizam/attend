import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, EmptyState, inputClass } from '../components/ui'
import { can, resetPassword, setUserStatus } from '../data/platform'
import { isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { csvDownload, dateOf, useOwner } from './context'
import { PageHead, td, th, useAction } from './ui'

/** Every person with an account, across all customers: find anyone, help them sign in. */
export default function Users() {
  const { users, customers, me } = useOwner()
  const { busy, run, messages } = useAction()
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const orgName = (id: string) => customers.find((c) => c.org.id === id)?.org.name ?? id
  const term = q.trim().toLowerCase()
  const shown = users
    .filter((u) => (!term || `${u.name} ${u.email} ${orgName(u.organisationId)}`.toLowerCase().includes(term)) && (!role || u.role === role) && (!status || u.status === status))
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
  const exportCsv = () =>
    csvDownload(`attend-users-${isoDate()}.csv`, [['Name', 'Email', 'Customer', 'Role', 'Status', 'Joined'], ...shown.map((u) => [u.name, u.email, orgName(u.organisationId), u.role, u.status, dateOf(u.createdAt?.toMillis())])])
  return (
    <>
      <PageHead title={t('Users')} sub={t('{n} people with an account, across all customers.', { n: users.length })} actions={<Button variant="secondary" onClick={exportCsv} disabled={!shown.length}>{t('Export for Excel')}</Button>} />
      {messages}
      <div className="flex flex-wrap gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search name, email or customer')} className={`${inputClass} max-w-xs`} />
        <select value={role} onChange={(e) => setRole(e.target.value)} className={`${inputClass} w-auto`}><option value="">{t('Any role')}</option><option value="admin">{t('Admin')}</option><option value="lecturer">{t('Manager')}</option></select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} w-auto`}><option value="">{t('Any status')}</option><option value="active">{t('Active')}</option><option value="disabled">{t('Disabled')}</option></select>
      </div>
      {shown.length === 0 ? (
        <EmptyState title={t('Nobody matches')} text={t('Try another search.')} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-slate-50"><tr>{['Name', 'Email', 'Customer', 'Role', 'Joined', 'Status', ''].map((h) => <th key={h} className={th}>{h && t(h)}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {shown.slice(0, 500).map((u) => (
                <tr key={u.id}>
                  <td className={td}>{u.name}</td>
                  <td className={td}>{u.email}</td>
                  <td className={td}><Link to={`/console/customers/${u.organisationId}`} className="text-accent hover:underline">{orgName(u.organisationId)}</Link></td>
                  <td className={td}>{u.role === 'admin' ? t('Admin') : t('Manager')}</td>
                  <td className={`${td} whitespace-nowrap`}>{dateOf(u.createdAt?.toMillis())}</td>
                  <td className={td}>{u.status === 'active' ? t('Active') : <span className="text-bad">{t('Disabled')}</span>}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    {can(me.role, 'support') && <button type="button" className="text-xs font-medium text-accent" disabled={busy === `r${u.id}`} onClick={() => run(`r${u.id}`, () => resetPassword(u, me), t('Password reset email sent to {email}.', { email: u.email }), t('Send a password reset email to {email}?', { email: u.email }))}>{t('Reset password')}</button>}
                    {can(me.role, 'users') && (
                      <button type="button" className={`ml-3 text-xs font-medium ${u.status === 'active' ? 'text-bad' : 'text-accent'}`} disabled={busy === `s${u.id}`} onClick={() => run(`s${u.id}`, () => setUserStatus(u, u.status === 'active' ? 'disabled' : 'active', me), u.status === 'active' ? t('User disabled.') : t('User enabled.'), u.status === 'active' ? t('Disable {email}? They will not be able to sign in to their organisation.', { email: u.email }) : undefined)}>
                        {u.status === 'active' ? t('Disable') : t('Enable')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length > 500 && <p className="px-5 py-3 text-xs text-muted">{t('Showing the newest 500. Search to narrow it down, or export everything.')}</p>}
        </Card>
      )}
    </>
  )
}
