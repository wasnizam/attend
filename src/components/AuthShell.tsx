import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LanguageSwitch } from './LanguageSwitch'
import { Logo } from './ui'

/**
 * The night-blue frame around the sign-in, sign-up and staff clock-in cards, matching the
 * website's top section, so every first screen of Attend feels like one place.
 */
export function AuthShell({ children, footer, below }: { children: ReactNode; footer?: ReactNode; below?: ReactNode }) {
  return (
    <div className="relative isolate min-h-dvh overflow-hidden bg-night text-white">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(40rem_25rem_at_90%_0%,rgb(255_200_61/0.16),transparent_60%),radial-gradient(40rem_30rem_at_0%_100%,rgb(99_102_241/0.45),transparent_60%)]" />
      <div aria-hidden className="absolute inset-0 -z-10 [background-image:radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
        <Link to="/" className="mx-auto mb-8 text-white">
          <Logo className="text-xl" />
        </Link>
        <div className="rounded-2xl bg-white p-6 text-ink shadow-[0_30px_80px_-20px_rgb(0_0_0/0.55)]">{children}</div>
        {below && <div className="text-ink">{below}</div>}
        {footer && <div className="mt-6 text-center text-sm text-indigo-100/80 [&_a]:font-semibold [&_a]:text-sun [&_button]:font-semibold [&_button]:text-sun">{footer}</div>}
        <LanguageSwitch className="mx-auto mt-5 !bg-white/10 [&_[aria-pressed=false]]:!text-white/70" />
      </div>
    </div>
  )
}
