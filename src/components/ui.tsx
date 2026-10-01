import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { t } from '../lib/i18n'
import type { SessionStatus } from '../lib/types'

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'lg'
  block?: boolean
  busy?: boolean
}

const variants = {
  primary: 'bg-accent text-white hover:bg-accent-strong shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(15_23_42/0.25)]',
  secondary: 'bg-white text-ink shadow-card hover:bg-canvas',
  ghost: 'text-accent hover:bg-accent-soft',
  danger: 'bg-bad text-white hover:bg-red-700 shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(15_23_42/0.25)]',
}

export function buttonClass({ variant = 'primary', size = 'md', block = false }: Pick<ButtonProps, 'variant' | 'size' | 'block'> = {}) {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors active:translate-y-px',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    'disabled:opacity-50 disabled:pointer-events-none select-none',
    size === 'lg' ? 'h-12 px-6 text-[15px] font-semibold' : 'h-10 px-4 text-sm',
    // Side-by-side block buttons share the row; standalone buttons never get squeezed.
    block ? 'w-full min-w-0' : 'shrink-0',
    variants[variant],
  )
}

export function Button({ variant, size, block, busy, children, className, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      className={cx(buttonClass({ variant, size, block }), className)}
    >
      {busy && <Spinner small />}
      {children}
    </button>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-xl bg-white shadow-card', className)}>{children}</div>
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }

export function Field({ label, hint, className, ...rest }: FieldProps) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-ink">
        {label}
        {hint && <span className="font-normal text-muted">{hint}</span>}
      </span>
      <input className={inputClass} {...rest} />
    </label>
  )
}

export const inputClass =
  'block w-full min-w-0 h-11 rounded-lg border border-slate-300 bg-white px-3.5 text-ink shadow-xs placeholder:text-slate-400 ' +
  'outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15'

export function Spinner({ small = false }: { small?: boolean }) {
  return (
    <span
      role="status"
      aria-label={t('Loading')}
      className={cx(
        'inline-block animate-spin rounded-full border-2 border-current border-r-transparent',
        small ? 'size-4' : 'size-7 text-muted',
      )}
    />
  )
}

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner />
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-sm text-bad">
      {children}
    </p>
  )
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      <p className="text-base font-semibold">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

const statusStyle: Record<SessionStatus, [string, string]> = {
  scheduled: ['Not started', 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200'],
  active: ['Session Active', 'bg-good-soft text-good ring-1 ring-inset ring-green-600/20'],
  ended: ['Ended', 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200'],
}

export function StatusBadge({ status }: { status: SessionStatus }) {
  const [label, style] = statusStyle[status]
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', style)}>
      {status === 'active' && <span className="size-1.5 animate-pulse rounded-full bg-good" />}
      {t(label)}
    </span>
  )
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-white px-4 py-3 shadow-card">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2 text-lg font-semibold tracking-tight', className)}>
      <img src="/favicon.svg" alt="" className="size-7 rounded-md" />
      Attend
    </span>
  )
}

/** Turns Firebase error codes into something a lecturer can act on. */
export function friendlyError(e: unknown): string {
  const code = (e as { code?: string }).code ?? ''
  const map: Record<string, string> = {
    'auth/invalid-credential': 'That email and password do not match.',
    'auth/invalid-email': 'That email address does not look right.',
    'auth/user-not-found': 'No account found for that email.',
    'auth/wrong-password': 'That email and password do not match.',
    'auth/email-already-in-use': 'An account with that email already exists. Try logging in.',
    'auth/weak-password': 'Please choose a password with at least 6 characters.',
    'auth/auth-domain-config-required': 'That sign-in method is not switched on for this project yet.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups and try again.',
    'auth/operation-not-allowed': 'That sign-in method is not switched on for this project yet.',
    'auth/requires-recent-login': 'Please log out, log in again, and retry.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'permission-denied': 'You do not have permission to do that.',
    unavailable: 'No connection. Check your internet and try again.',
  }
  const known = map[code]
  if (known) return t(known)
  return e instanceof Error && !code ? t(e.message) : t('Something went wrong. Please try again.')
}
