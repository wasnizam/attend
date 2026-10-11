import { useEffect, useRef, useState } from 'react'
import { t } from '../lib/i18n'

/** How far the finger must travel (after the drag is softened) before letting go refreshes. */
const TRIGGER = 70

/**
 * Pull down at the top of a page to refresh, as in any phone app. An installed app has no
 * browser bar to do it, and iPhones offer nothing of their own there. Lists already update by
 * themselves; this is for peace of mind and for picking up a new version.
 */
export function PullToRefresh() {
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const start = useRef<number | null>(null)
  const dist = useRef(0)

  useEffect(() => {
    const down = (e: TouchEvent) => {
      // Only from the very top of the page, with one finger, and not inside something that scrolls itself.
      const scrolled = (e.target as Element | null)?.closest?.('[data-no-pull], dialog, [role="dialog"]')
      start.current = window.scrollY <= 0 && e.touches.length === 1 && !scrolled ? e.touches[0].clientY : null
      dist.current = 0
    }
    const move = (e: TouchEvent) => {
      if (start.current === null) return
      const dy = e.touches[0].clientY - start.current
      if (dy <= 0 || window.scrollY > 0) {
        dist.current = 0
        return setPull(0)
      }
      // The further it is pulled, the harder it gets.
      dist.current = Math.min(110, dy * 0.45)
      setPull(dist.current)
    }
    const up = () => {
      if (start.current === null) return
      start.current = null
      if (dist.current >= TRIGGER) {
        setBusy(true)
        setPull(TRIGGER)
        window.location.reload()
      } else setPull(0)
    }
    window.addEventListener('touchstart', down, { passive: true })
    window.addEventListener('touchmove', move, { passive: true })
    window.addEventListener('touchend', up)
    window.addEventListener('touchcancel', up)
    return () => {
      window.removeEventListener('touchstart', down)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', up)
      window.removeEventListener('touchcancel', up)
    }
  }, [])

  if (pull <= 0) return null
  const ready = pull >= TRIGGER
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center print:hidden" style={{ transform: `translateY(${pull - 44}px)` }}>
      <span className="flex items-center gap-2 rounded-full bg-night px-4 py-2 text-sm font-medium text-white shadow-pop">
        <svg viewBox="0 0 24 24" className={`size-4 ${busy ? 'animate-spin' : ''}`} style={busy ? undefined : { transform: `rotate(${pull * 4}deg)` }} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" />
        </svg>
        {busy ? t('Refreshing…') : ready ? t('Let go to refresh') : t('Pull to refresh')}
      </span>
    </div>
  )
}
