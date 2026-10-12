import { useEffect, useState } from 'react'
import { type Invites, myInvites } from '../data/billing'
import { formatDate, isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { Button, inputClass } from './ui'

/**
 * Pro, earned by sharing: the account's own invite link, how many friends have joined and how
 * many count (a friend counts once they have run a real session), and what has been earned.
 */
export function InviteFriends() {
  const [invites, setInvites] = useState<Invites | null>(null)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    myInvites().then(setInvites, () => setFailed(true))
  }, [])

  if (failed) return <p className="text-sm text-muted">{t('Your invite link could not be loaded just now. Reload the page to try again.')}</p>
  if (!invites) return <p className="text-sm text-muted">{t('Getting your invite link…')}</p>

  const { friendsForPro: need, rewardMonths: months, counted, joined, toGo, rewards, maxRewards } = invites
  const done = rewards >= maxRewards
  const inRound = done ? need : counted % need
  const words = t('I take attendance with Dobry: people scan a QR with their own phone and the list fills itself. Free to start:')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invites.link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // The link is in the box to copy by hand.
    }
  }
  const share = async () => {
    try {
      await navigator.share({ title: 'Dobry', text: words, url: invites.link })
    } catch {
      // Closed without sharing, or not offered on this device.
    }
  }
  return (
    <div>
      <p className="text-sm text-slate-700">
        {t(months === 1 ? 'Invite {n} friends and get Pro free for a month. A friend counts once they have run their first real session.' : 'Invite {n} friends and get Pro free for {m} months. A friend counts once they have run their first real session.', { n: need, m: months })}
      </p>

      <div className="mt-4 flex items-center gap-1.5" role="img" aria-label={t('{n} of {m} friends count so far', { n: inRound, m: need })}>
        {Array.from({ length: need }, (_, i) => (
          <span key={i} className={`h-2.5 flex-1 rounded-full ${i < inRound ? 'bg-sun' : 'bg-slate-200'}`} />
        ))}
      </div>
      <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold">
          {done ? t('You have earned every reward. Thank you for sharing Dobry.') : inRound === 0 && counted === 0 ? t('{n} friends to go', { n: need }) : t(toGo === 1 ? '1 more friend to go' : '{n} more friends to go', { n: toGo })}
        </span>
        <span className="text-xs text-muted">
          {t('{n} joined', { n: joined })} · {t('{n} count', { n: counted })}
          {invites.proUntil ? ` · ${t('Pro until {date}', { date: formatDate(isoDate(new Date(invites.proUntil))) })}` : ''}
        </span>
      </p>
      {joined > counted && <p className="mt-1 text-xs text-muted">{t('{n} have joined but not run a session yet. A nudge from you may help.', { n: joined - counted })}</p>}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input readOnly value={invites.link} onFocus={(e) => e.target.select()} aria-label={t('Your invite link')} className={`${inputClass} font-mono !text-sm`} />
        <Button variant="secondary" onClick={copy} className="shrink-0">{copied ? t('Copied') : t('Copy link')}</Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(`${words} ${invites.link}`)}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-lg bg-[#25d366] px-4 text-sm font-semibold text-white hover:brightness-95">
          {t('Share on WhatsApp')}
        </a>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <Button variant="secondary" onClick={share}>{t('Share another way')}</Button>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">{t(months === 1 ? 'Every {n} friends who count earn you another month, up to a year. Nothing to pay, and nothing to cancel.' : 'Each time {n} friends count, you earn {m} more months, up to a year. Nothing to pay, and nothing to cancel.', { n: need, m: months })}</p>
    </div>
  )
}
