import { type FormEvent, useState } from 'react'
import { Button, inputClass } from '../components/ui'
import { changePassword, resetPassword, signOut } from '../data/account'
import { ROLE_HELP, ROLE_LABEL, updateMyName } from '../data/platform'
import { auth } from '../lib/auth'
import { t } from '../lib/i18n'
import { useOwner } from './context'
import { PageHead, Section, useAction } from './ui'

const MIN = 10

/** The signed-in team member's own account: name, sign-in method and password. */
export default function Account() {
  const { me, team } = useOwner()
  const user = auth.currentUser
  const mine = team.find((m) => m.id === me.id)
  const { busy, run, messages, setError } = useAction()
  const [name, setName] = useState(mine?.name ?? user?.displayName ?? '')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const providers = (user?.providerData ?? []).map((p) => p.providerId)
  const hasPassword = providers.includes('password')
  const google = providers.includes('google.com')
  const strength = [next.length >= MIN, /[a-z]/.test(next) && /[A-Z]/.test(next), /\d/.test(next), /[^A-Za-z0-9]/.test(next)]

  const saveName = (e: FormEvent) => {
    e.preventDefault()
    run('name', () => updateMyName(name, me), t('Name saved.'))
  }
  const savePassword = (e: FormEvent) => {
    e.preventDefault()
    if (next.length < MIN) return setError(t('Use at least {n} characters.', { n: MIN }))
    if (next !== again) return setError(t('The two new passwords are not the same.'))
    if (next === current) return setError(t('The new password must be different from the current one.'))
    run(
      'password',
      async () => {
        try {
          await changePassword(current, next)
        } catch (err) {
          const code = String((err as { code?: string }).code ?? '')
          // Turn Firebase's codes into plain words; anything else is reported as a failed save.
          if (code.includes('wrong-password') || code.includes('invalid-credential')) throw Object.assign(new Error(), { message: t('Your current password is not right.') })
          if (code.includes('too-many-requests')) throw Object.assign(new Error(), { message: t('Too many tries. Wait a few minutes, or use the reset email below.') })
          if (code.includes('weak-password')) throw Object.assign(new Error(), { message: t('That password is too weak. Try a longer one.') })
          throw err
        }
        setCurrent('')
        setNext('')
        setAgain('')
      },
      t('Password changed. Use the new one next time you sign in.'),
    )
  }
  const lastIn = user?.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString() : '—'
  const created = user?.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : '—'

  return (
    <>
      <PageHead title={t('My account')} sub={t('Your own sign-in for the Attend back office.')} />
      {messages}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('Profile')}>
          <form onSubmit={saveName} className="space-y-3">
            <label className="block text-xs font-medium text-muted">
              {t('Your name')}
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required className={`${inputClass} mt-1`} />
            </label>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted">{t('Email')}</dt><dd className="break-all">{me.email}</dd></div>
              <div><dt className="text-xs text-muted">{t('Role')}</dt><dd>{t(ROLE_LABEL[me.role])}</dd></div>
              <div><dt className="text-xs text-muted">{t('Last sign-in')}</dt><dd>{lastIn}</dd></div>
              <div><dt className="text-xs text-muted">{t('Account created')}</dt><dd>{created}</dd></div>
            </dl>
            <p className="text-xs text-muted">{t(ROLE_HELP[me.role])} {t('Only an owner can change your role or email.')}</p>
            <Button type="submit" variant="secondary" busy={busy === 'name'} disabled={!name.trim() || name.trim() === (mine?.name ?? '')}>{t('Save name')}</Button>
          </form>
        </Section>

        <Section title={t('Password')} sub={hasPassword ? t('Change it here. You need your current password.') : undefined}>
          {hasPassword ? (
            <form onSubmit={savePassword} className="space-y-3">
              <input type="email" value={me.email} autoComplete="username" readOnly hidden />
              <label className="block text-xs font-medium text-muted">
                {t('Current password')}
                <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={`${inputClass} mt-1`} />
              </label>
              <label className="block text-xs font-medium text-muted">
                {t('New password')}
                <input type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} className={`${inputClass} mt-1`} />
              </label>
              {next && (
                <ul className="grid grid-cols-2 gap-1 text-xs">
                  {[t('At least {n} characters', { n: MIN }), t('Upper and lower case'), t('A number'), t('A symbol')].map((label, i) => (
                    <li key={label} className={strength[i] ? 'text-good' : 'text-muted'}>{strength[i] ? '✓' : '○'} {label}</li>
                  ))}
                </ul>
              )}
              <label className="block text-xs font-medium text-muted">
                {t('New password again')}
                <input type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} className={`${inputClass} mt-1`} />
              </label>
              {again && next !== again && <p className="text-xs text-bad">{t('The two new passwords are not the same.')}</p>}
              <Button type="submit" busy={busy === 'password'}>{t('Change password')}</Button>
            </form>
          ) : (
            <p className="text-sm text-muted">{google ? t('You sign in with Google, so there is no Attend password. Change your password in your Google account.') : t('This account has no password.')}</p>
          )}
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-sm text-muted">{t('Forgot your current password? We can email you a link to set a new one.')}</p>
            <Button className="mt-2" variant="secondary" busy={busy === 'reset'} onClick={() => run('reset', () => resetPassword(me.email), t('Reset link sent to {email}. Check your inbox (and spam).', { email: me.email }))}>
              {t('Email me a reset link')}
            </Button>
          </div>
        </Section>

        <Section title={t('Sign-in method')}>
          <ul className="space-y-1 text-sm">
            {hasPassword && <li>✓ {t('Email and password')}</li>}
            {google && <li>✓ {t('Google')}</li>}
          </ul>
          <p className="mt-2 text-xs text-muted">{user?.emailVerified ? t('Your email is verified.') : t('Your email is not verified yet.')}</p>
        </Section>

        <Section title={t('Sign out')}>
          <p className="text-sm text-muted">{t('On a shared computer, always sign out when you finish.')}</p>
          <Button className="mt-2" variant="secondary" onClick={() => signOut()}>{t('Log out')}</Button>
        </Section>
      </div>
    </>
  )
}
