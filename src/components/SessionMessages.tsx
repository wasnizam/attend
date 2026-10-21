import { useEffect, useState } from 'react'
import { t } from '../lib/i18n'
import { type MessageContext, type MessageKind, messagesFor, whatsappLink } from '../lib/messages'
import { getPurpose } from '../lib/purpose'
import { Button, Card, inputClass } from './ui'

const WHO = () => (getPurpose() === 'workplace' ? 'Message your staff' : getPurpose() === 'education' ? 'Message your students' : 'Message your participants')

/**
 * A ready message for the people in a session, to send on WhatsApp or copy anywhere: a reminder
 * before, the check-in link while it runs, a note after. Dobry has no way to reach them itself,
 * so the organiser sends it from their own phone. The text can be changed before sending.
 */
export function SessionMessages({ kinds, ctx, open: startOpen = false }: { kinds: MessageKind[]; ctx: MessageContext; open?: boolean }) {
  const list = messagesFor(kinds, ctx)
  const [open, setOpen] = useState(startOpen)
  const [kind, setKind] = useState<MessageKind | null>(list[0]?.kind ?? null)
  const chosen = list.find((m) => m.kind === kind) ?? list[0]
  const [text, setText] = useState(chosen?.text ?? '')
  const [copied, setCopied] = useState(false)
  // A different message, or new details, start from the ready wording again.
  useEffect(() => setText(chosen?.text ?? ''), [chosen?.text])

  if (!list.length) return null
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t(WHO())}
      </Button>
    )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // The text is on screen to select and copy by hand.
    }
  }

  return (
    <Card className="w-full space-y-3 p-5 text-left">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t(WHO())}</h2>
          <p className="text-sm text-muted">{t('A ready message to send from your phone. Change anything before you send it.')}</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-sm font-medium text-muted hover:text-ink">{t('Close')}</button>
      </div>
      {list.length > 1 && (
        <div className="flex flex-wrap gap-1 rounded-md bg-slate-100 p-1 text-sm font-medium">
          {list.map((m) => (
            <button key={m.kind} type="button" onClick={() => setKind(m.kind)} className={`rounded px-3 py-1.5 ${chosen?.kind === m.kind ? 'bg-white text-ink shadow-card' : 'text-muted hover:text-ink'}`}>
              {m.label}
            </button>
          ))}
        </div>
      )}
      <textarea id="session-message" value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={2000} className={`${inputClass} !h-auto py-2 leading-relaxed`} aria-label={t('Message')} />
      <div className="flex flex-wrap gap-2">
        <a href={whatsappLink(text)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#25d366] px-4 text-sm font-semibold text-white hover:bg-[#1ebe5b]">
          {t('Send on WhatsApp')}
        </a>
        <Button variant="secondary" onClick={copy}>{copied ? t('Copied') : t('Copy')}</Button>
      </div>
      <p className="text-xs text-muted">{t('WhatsApp opens with the message written in; you choose the group or person.')}</p>
    </Card>
  )
}
