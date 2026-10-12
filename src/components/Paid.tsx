import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { t } from '../lib/i18n'
import { type Feature, allows, canPay } from '../lib/plan'

/** Shown in place of something the free plan does not include: what it is, and the way to the plans. */
/** While Pro cannot be bought, it is earned: the same notes speak of Pro, and lead to the invite. */
const earned = (what: string) => what.replace(/the paid plans|a paid plan/g, 'Pro').replace(/pelan berbayar/g, 'Pro')

export function UpgradeNote({ what, className = '' }: { what: string; className?: string }) {
  const buying = canPay()
  return (
    <Link to={buying ? '/app/account#plan' : '/app/account#invite'} className={`inline-flex items-center gap-2 rounded-lg bg-[#fff4d6] px-3 py-2 text-sm font-medium text-[#8a5a00] hover:bg-[#ffecb8] print:hidden ${className}`}>
      <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" />
      </svg>
      <span>
        {buying ? what : earned(what)} <span className="font-semibold underline-offset-2 hover:underline">{buying ? t('See plans') : t('Invite friends to unlock it')} ›</span>
      </span>
    </Link>
  )
}

/** Its children when the plan includes the feature; otherwise a note that leads to the plans. */
export function Paid({ feature, what, children, className }: { feature: Feature; what: string; children: ReactNode; className?: string }) {
  return allows(feature) ? <>{children}</> : <UpgradeNote what={what} className={className} />
}

/** For a handler: true when allowed; otherwise tells the person and returns false. */
export function allowedOrTell(feature: Feature, what: string): boolean {
  if (allows(feature)) return true
  window.alert(canPay() ? `${what} ${t('Open Account to see the plans.')}` : `${earned(what)} ${t('Invite 5 friends from your Account page to unlock it.')}`)
  return false
}
