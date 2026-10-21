import { inMalaysia } from '../lib/currency'
import { LANGS, getLang, setLang } from '../lib/i18n'

/**
 * Two-letter toggle for public pages (landing, sign-in, student check-in). Bahasa Melayu is offered
 * in Malaysia, or to someone already reading it (so they can switch back). Czech is offered on the
 * website's own pages (`czech`), the only place it is translated.
 */
export function LanguageSwitch({ className = '', czech = false }: { className?: string; czech?: boolean }) {
  const shown = LANGS.filter((l) => l.id === 'en' || (l.id === 'ms' && (inMalaysia() || getLang() === 'ms')) || (l.id === 'cs' && czech))
  if (shown.length < 2) return null
  return (
    <div role="group" aria-label="Language" className={`inline-flex rounded-md bg-canvas p-0.5 text-xs font-semibold ${className}`}>
      {shown.map((l) => (
        <button
          key={l.id}
          aria-pressed={getLang() === l.id || (l.id === 'en' && getLang() === 'cs' && !czech)}
          title={l.label}
          onClick={() => setLang(l.id)}
          className={`rounded-md px-2.5 py-1 uppercase ${getLang() === l.id || (l.id === 'en' && getLang() === 'cs' && !czech) ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}
        >
          {l.id === 'ms' ? 'BM' : l.id === 'cs' ? 'CS' : 'EN'}
        </button>
      ))}
    </div>
  )
}
