import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { t } from '../lib/i18n'
import { type Feature, allows } from '../lib/plan'

/** Shown in place of something the free plan does not include: what it is, and the way to the plans. */
export function UpgradeNote({ what, className = '' }: { what: string; className?: string }) {
  return (
    <Link to="/app/account" className={`inline-flex items-center gap-2 rounded-lg bg-[#fff4d6] px-3 py-2 text-sm font-medium text-[#8a5a00] hover:bg-[#ffecb8] print:hidden ${className}`}>
      <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" />
      </svg>
      <span>
        {what} <span className="font-semibold underline-offset-2 hover:underline">{t('See plans')} ›</span>
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
  window.alert(`${what} ${t('Open Account to see the plans.')}`)
  return false
}
