import { inMalaysia } from '../lib/currency'
import { LANGS, getLang, setLang } from '../lib/i18n'

/**
 * Two-letter toggle for public pages (landing, sign-in, student check-in). Shown only in Malaysia,
 * or to someone already reading in Bahasa Melayu (so they can switch back).
 */
export function LanguageSwitch({ className = '' }: { className?: string }) {
  if (!inMalaysia() && getLang() !== 'ms') return null
  return (
    <div role="group" aria-label="Language" className={`inline-flex rounded-md bg-canvas p-0.5 text-xs font-semibold ${className}`}>
      {LANGS.map((l) => (
        <button
          key={l.id}
          aria-pressed={getLang() === l.id}
          title={l.label}
          onClick={() => setLang(l.id)}
          className={`rounded-md px-2.5 py-1 uppercase ${getLang() === l.id ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}
        >
          {l.id === 'ms' ? 'BM' : 'EN'}
        </button>
      ))}
    </div>
  )
}
