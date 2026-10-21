import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, EmptyState, PageLoader, inputClass } from '../components/ui'
import { type FeedbackRow, type GrowthData, type GrowthStage, type GrowthTemplate, feedbackList, growthData, saveGrowth, testGrowth } from '../data/billing'
import { formatDate, isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { DAY, editionName, useOwner } from './context'
import { Kpi, PageHead, Section, Tabs, td, th, useAction } from './ui'

type Tab = 'emails' | 'sources' | 'feedback'

const STAGE_NAME: Record<GrowthStage, string> = {
  firstSession: 'First session nudge',
  invite: 'Invite friends',
  tips: 'Tips for their edition',
  quiet: 'Quiet for a week',
  winback: 'Come back',
}
const EDITION_LABEL: Record<string, string> = { lecturers: 'Lecturers', trainers: 'Trainers', workplace: 'Workplace' }

/** Getting customers in and keeping them: follow-up emails, where sign-ups come from, and what customers say. */
export default function Growth() {
  const [tab, setTab] = useState<Tab>('emails')
  return (
    <>
      <PageHead title={t('Growth')} sub={t('Emails that bring customers back, where new customers come from, and what they say about Dobry.')} />
      <Tabs value={tab} onChange={setTab} items={[['emails', t('Follow-up emails')], ['sources', t('Sign-up sources')], ['feedback', t('Feedback')]]} />
      {tab === 'emails' && <FollowUps />}
      {tab === 'sources' && <Sources />}
      {tab === 'feedback' && <Feedback />}
    </>
  )
}

// ---------- Follow-up emails ----------

function FollowUps() {
  const [data, setData] = useState<GrowthData | null>(null)
  const [draft, setDraft] = useState<GrowthData['settings'] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [failed, setFailed] = useState('')
  const { busy, run, messages } = useAction()

  useEffect(() => {
    growthData().then(
      (d) => {
        setData(d)
        setDraft(d.settings)
      },
      (e) => setFailed(e instanceof Error ? e.message : String(e)),
    )
  }, [])

  if (failed) return <p className="rounded-lg bg-bad-soft px-4 py-2 text-sm text-bad">{failed}</p>
  if (!data || !draft) return <PageLoader />
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings)
  const setTemplate = (id: string, patch: Partial<GrowthTemplate>) => setDraft({ ...draft, templates: { ...draft.templates, [id]: { ...draft.templates[id], ...patch } } })
  const on = Object.values(draft.templates).filter((x) => x.on).length
  const sent30 = Object.values(data.stats).reduce((a, s) => a + s.sent30, 0)
  const measured = Object.values(data.stats).reduce((a, s) => a + s.measured, 0)
  const back = Object.values(data.stats).reduce((a, s) => a + s.cameBack, 0)

  return (
    <div className="space-y-4">
      {messages}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t('Emails switched on')} value={`${on} / ${Object.keys(draft.templates).length}`} />
        <Kpi label={t('Sent in 30 days')} value={sent30} note={t('up to {n} a day', { n: draft.dailyCap })} />
        <Kpi label={t('Came back within 7 days')} value={measured ? `${Math.round((back / measured) * 100)}%` : '—'} note={measured ? t('{n} of {m} emailed customers ran a session', { n: back, m: measured }) : t('shows after the first week')} />
        <Kpi label={t('Stopped the tips')} value={data.unsubscribed} note={t('customers who unsubscribed')} />
      </div>

      <Section
        title={t('How it works')}
        sub={t('Once a day Dobry checks every customer and sends the one email that fits where they are, never more than one every 3 days. Each email goes to the account owner, has an unsubscribe link, and is never sent twice.')}
        actions={
          data.canEdit && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm whitespace-nowrap text-muted">
                {t('Most a day')}
                <input type="number" min={0} max={500} value={draft.dailyCap} onChange={(e) => setDraft({ ...draft, dailyCap: Math.max(0, Math.min(500, Number(e.target.value) || 0)) })} className={`${inputClass} !h-9 w-20`} />
              </label>
              <Button busy={busy === 'save'} disabled={!dirty} onClick={() => run('save', async () => { const r = await saveGrowth(draft); setData({ ...data, settings: r.settings }); setDraft(r.settings) }, t('Follow-up emails saved.'))}>
                {t('Save')}
              </Button>
            </div>
          )
        }
      >
        <p className="text-xs text-muted">{t('The free Resend plan sends about 100 emails a day and 3,000 a month in all, including welcome and payment emails. Keep the daily limit well under that.')}</p>
      </Section>

      {data.stages.map((stage) => {
        const s = data.stats[stage.id]
        const ids = stage.perEdition ? ['lecturers', 'trainers', 'workplace'].map((e) => `${stage.id}.${e}`) : [stage.id]
        return (
          <Section
            key={stage.id}
            title={t(STAGE_NAME[stage.id])}
            sub={t(stage.when)}
            actions={
              <span className="tabular text-xs text-muted">
                {t('{n} sent in 30 days', { n: s.sent30 })} · {s.measured ? t('{p}% came back', { p: Math.round((s.cameBack / s.measured) * 100) }) : t('no results yet')}
              </span>
            }
          >
            <ul className="divide-y divide-line">
              {ids.map((id) => {
                const tpl = draft.templates[id]
                const edition = id.split('.')[1]
                return (
                  <li key={id} className="py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={tpl.on} disabled={!data.canEdit} onChange={(e) => setTemplate(id, { on: e.target.checked })} className="size-4 accent-accent" />
                        <span className={tpl.on ? 'font-medium' : 'text-muted'}>{tpl.on ? t('On') : t('Off')}</span>
                      </label>
                      {edition && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">{t(EDITION_LABEL[edition])}</span>}
                      <span className="min-w-0 flex-1 truncate text-sm">{tpl.subject}</span>
                      <button type="button" onClick={() => setOpen(open === id ? null : id)} className="text-sm font-medium text-accent" aria-expanded={open === id}>
                        {open === id ? t('Close') : data.canEdit ? t('Edit') : t('View')}
                      </button>
                    </div>
                    {open === id && (
                      <Editor
                        tpl={tpl}
                        canEdit={data.canEdit}
                        onChange={(patch) => setTemplate(id, patch)}
                        onReset={() => setTemplate(id, data.defaults[id])}
                        onTest={() => run(`test-${id}`, async () => { const r = await testGrowth(draft, id); return r }, t('Test sent to your email.'))}
                        testing={busy === `test-${id}`}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          </Section>
        )
      })}
      {dirty && data.canEdit && (
        <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4">
          <Button busy={busy === 'save'} onClick={() => run('save', async () => { const r = await saveGrowth(draft); setData({ ...data, settings: r.settings }); setDraft(r.settings) }, t('Follow-up emails saved.'))}>
            {t('Save changes')}
          </Button>
        </div>
      )}
    </div>
  )
}

function Editor({ tpl, canEdit, onChange, onReset, onTest, testing }: { tpl: GrowthTemplate; canEdit: boolean; onChange: (p: Partial<GrowthTemplate>) => void; onReset: () => void; onTest: () => void; testing: boolean }) {
  const preview = (s: string) => s.replace(/Hello \{name\},/g, 'Hello Aisyah,').replace(/\{name\}/g, 'Aisyah').replace(/\{organisation\}/g, 'Maju Jaya Sdn Bhd').replace(/\{invite\}/g, 'https://dobry.app/?ref=K7Q2M9XD')
  return (
    <div className="mt-3 grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        <label className="block text-xs font-medium text-muted">{t('Subject')}<input value={tpl.subject} disabled={!canEdit} maxLength={150} onChange={(e) => onChange({ subject: e.target.value })} className={`${inputClass} mt-1`} /></label>
        <label className="block text-xs font-medium text-muted">{t('Heading')}<input value={tpl.heading} disabled={!canEdit} maxLength={150} onChange={(e) => onChange({ heading: e.target.value })} className={`${inputClass} mt-1`} /></label>
        <label className="block text-xs font-medium text-muted">{t('Message')}<textarea value={tpl.body} disabled={!canEdit} rows={10} maxLength={4000} onChange={(e) => onChange({ body: e.target.value })} className={`${inputClass} mt-1 !h-auto py-2 leading-relaxed`} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs font-medium text-muted">{t('Button')}<input value={tpl.button} disabled={!canEdit} maxLength={60} onChange={(e) => onChange({ button: e.target.value })} className={`${inputClass} mt-1`} /></label>
          <label className="block text-xs font-medium text-muted">{t('Button opens')}<input value={tpl.path} disabled={!canEdit} maxLength={300} onChange={(e) => onChange({ path: e.target.value })} placeholder="/app" className={`${inputClass} mt-1`} /></label>
        </div>
        <p className="text-xs text-muted">{t('Leave a blank line between paragraphs. {name} is their first name, {organisation} their organisation, and {invite} their own invite link.')}</p>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" busy={testing} onClick={onTest}>{t('Send a test to me')}</Button>
            <Button variant="ghost" onClick={onReset}>{t('Use the standard wording')}</Button>
          </div>
        )}
      </div>
      <div className="rounded-xl bg-canvas p-3 ring-1 ring-line">
        <p className="px-1 pb-2 text-xs font-semibold tracking-wider text-muted uppercase">{t('Preview')}</p>
        <div className="overflow-hidden rounded-lg bg-white ring-1 ring-line">
          <div className="bg-night px-5 py-3 font-bold text-sun">Dobry</div>
          <div className="space-y-3 px-5 py-4 text-sm leading-relaxed text-slate-700">
            <p className="text-xs text-muted">{t('Subject')}: <span className="font-medium text-ink">{preview(tpl.subject)}</span></p>
            <p className="text-lg font-semibold text-ink">{preview(tpl.heading)}</p>
            {preview(tpl.body).split(/\n\s*\n/).filter(Boolean).map((para, i) => <p key={i} className="whitespace-pre-line">{para}</p>)}
            {tpl.button && tpl.path && <span className="inline-block rounded-lg bg-sun px-4 py-2 font-bold text-night">{preview(tpl.button)}</span>}
          </div>
          <p className="border-t border-line px-5 py-3 text-xs text-muted">{t('Dobry · dobry.app. Stop these tips; emails about your account and payments still arrive.')}</p>
        </div>
      </div>
    </div>
  )
}

// ---------- Sign-up sources ----------

const PAGES: [string, string][] = [['', 'Homepage'], ['lecturers', 'Lecturers page'], ['trainers', 'Trainers page'], ['workplace', 'Workplace page'], ['signup', 'Sign-up page']]
const SOURCE_NAME: Record<string, string> = {
  direct: 'Typed in or bookmarked',
  invite: 'Invite link',
  checkin: 'Check-in screen',
  certificate: 'Certificate page',
  google: 'Google',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  x: 'X (Twitter)',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  '': 'Before tracking began',
}

function Sources() {
  const { customers } = useOwner()
  const [range, setRange] = useState<30 | 90 | 0>(90)
  const now = Date.now()
  const rows = useMemo(() => {
    const list = customers.filter((c) => !range || (c.joined && now - c.joined < range * DAY))
    const groups = new Map<string, { key: string; signups: number; active: number; paying: number; campaigns: Map<string, number>; editions: Map<string, number> }>()
    for (const c of list) {
      const key = c.org.source?.source ?? ''
      const g = groups.get(key) ?? { key, signups: 0, active: 0, paying: 0, campaigns: new Map(), editions: new Map() }
      g.signups += 1
      if (c.lastSeen) g.active += 1
      if (c.status === 'pro') g.paying += 1
      const camp = c.org.source?.campaign
      if (camp) g.campaigns.set(camp, (g.campaigns.get(camp) ?? 0) + 1)
      const ed = editionName(c.org)
      g.editions.set(ed, (g.editions.get(ed) ?? 0) + 1)
      groups.set(key, g)
    }
    return [...groups.values()].sort((a, b) => b.signups - a.signups)
  }, [customers, range, now])
  const total = rows.reduce((a, r) => a + r.signups, 0)
  const activeTotal = rows.reduce((a, r) => a + r.active, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-line bg-white p-0.5 text-sm">
          {([[30, 'Last 30 days'], [90, 'Last 90 days'], [0, 'All time']] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setRange(v)} className={`rounded-md px-3 py-1.5 font-medium ${range === v ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}>{t(label)}</button>
          ))}
        </div>
        <p className="text-sm text-muted">{t('{n} sign-ups, {m} have run a session', { n: total, m: activeTotal })}</p>
      </div>
      <Section title={t('Where customers come from')} sub={t('The first page they visited, remembered for 30 days. “Ran a session” means they used Dobry in the last 12 weeks, which matters more than the sign-up itself.')}>
        {rows.length === 0 ? (
          <EmptyState title={t('No sign-ups in this period')} text={t('Sign-ups appear here as they come in.')} />
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead><tr className="border-b border-line"><th className={th}>{t('Source')}</th><th className={`${th} text-right`}>{t('Sign-ups')}</th><th className={`${th} text-right`}>{t('Ran a session')}</th><th className={`${th} text-right`}>{t('Paying')}</th><th className={th}>{t('Share')}</th></tr></thead>
              <tbody className="tabular divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className={td}>
                      <span className="font-medium">{t(SOURCE_NAME[r.key] ?? r.key)}</span>
                      {r.campaigns.size > 0 && <span className="block text-xs text-muted">{[...r.campaigns].map(([c, n]) => `${c} (${n})`).join(', ')}</span>}
                      <span className="block text-xs text-muted">{[...r.editions].map(([e, n]) => `${e} ${n}`).join(' · ')}</span>
                    </td>
                    <td className={`${td} text-right`}>{r.signups}</td>
                    <td className={`${td} text-right`}>{r.active} <span className="text-xs text-muted">({Math.round((r.active / r.signups) * 100)}%)</span></td>
                    <td className={`${td} text-right`}>{r.paying}</td>
                    <td className={td}><span className="block h-2 w-32 rounded-full bg-slate-100"><span className="block h-full rounded-full bg-accent" style={{ width: `${total ? (r.signups / total) * 100 : 0}%` }} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <LinkBuilder />
    </div>
  )
}

/** Tagged links for posts and campaigns, so their sign-ups show up by name above. */
function LinkBuilder() {
  const [page, setPage] = useState('lecturers')
  const [source, setSource] = useState('facebook')
  const [campaign, setCampaign] = useState('')
  const [copied, setCopied] = useState(false)
  const clean = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const q = new URLSearchParams({ utm_source: clean(source) || 'other', ...(clean(campaign) ? { utm_campaign: clean(campaign) } : {}) })
  const link = `https://dobry.app/${page}?${q}`
  return (
    <Section title={t('Make a tracked link')} sub={t('Use a tracked link in every post, message and campaign. Its sign-ups then appear in the table above under its own name.')}>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-muted">{t('Page')}
          <select value={page} onChange={(e) => setPage(e.target.value)} className={`${inputClass} mt-1`}>{PAGES.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select>
        </label>
        <label className="block text-xs font-medium text-muted">{t('Where you post it')}
          <input list="growth-sources" value={source} onChange={(e) => setSource(e.target.value)} className={`${inputClass} mt-1`} />
          <datalist id="growth-sources">{['facebook', 'whatsapp', 'telegram', 'linkedin', 'instagram', 'tiktok', 'email', 'poster', 'event'].map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <label className="block text-xs font-medium text-muted">{t('Campaign (optional)')}
          <input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder={t('e.g. uitm-lecturers-oct')} className={`${inputClass} mt-1`} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 rounded-lg bg-canvas px-3 py-2 text-sm break-all ring-1 ring-line">{link}</code>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            } catch {
              // The link is on screen to copy by hand.
            }
          }}
        >
          {copied ? t('Copied') : t('Copy link')}
        </Button>
      </div>
    </Section>
  )
}

// ---------- Feedback ----------

function Feedback() {
  const [rows, setRows] = useState<FeedbackRow[] | null>(null)
  const [failed, setFailed] = useState('')
  const [filter, setFilter] = useState<'all' | 'quote' | 'unhappy'>('all')
  useEffect(() => {
    feedbackList().then(setRows, (e) => setFailed(e instanceof Error ? e.message : String(e)))
  }, [])
  if (failed) return <p className="rounded-lg bg-bad-soft px-4 py-2 text-sm text-bad">{failed}</p>
  if (!rows) return <PageLoader />
  const promoters = rows.filter((r) => r.score >= 9).length
  const detractors = rows.filter((r) => r.score <= 6).length
  const score = rows.length ? Math.round(((promoters - detractors) / rows.length) * 100) : null
  const shown = rows.filter((r) => (filter === 'quote' ? r.quoteOk && r.comment : filter === 'unhappy' ? r.score <= 6 : true))
  const tone = (s: number) => (s >= 9 ? 'bg-good-soft text-good' : s >= 7 ? 'bg-slate-100 text-ink' : 'bg-bad-soft text-bad')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t('Net Promoter Score')} value={score === null ? '—' : score} note={t('from −100 to 100; above 30 is good')} tone={score !== null && score < 0 ? 'warn' : undefined} />
        <Kpi label={t('Answers')} value={rows.length} note={t('asked after 3 sessions and 2 weeks of use')} />
        <Kpi label={t('Would recommend (9–10)')} value={promoters} />
        <Kpi label={t('Unhappy (0–6)')} value={detractors} tone={detractors ? 'warn' : undefined} note={detractors ? t('worth a call') : undefined} />
      </div>
      <Section
        title={t('What customers said')}
        actions={
          <div className="inline-flex rounded-lg border border-line bg-white p-0.5 text-sm">
            {([['all', 'All'], ['quote', 'Can be quoted'], ['unhappy', 'Unhappy']] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setFilter(v)} className={`rounded-md px-3 py-1 font-medium ${filter === v ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}>{t(l)}</button>
            ))}
          </div>
        }
      >
        {shown.length === 0 ? (
          <EmptyState title={t('No answers yet')} text={t('Customers are asked once they have run 3 sessions, the first at least 2 weeks ago. Answers appear here.')} />
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((r) => (
              <li key={r.id} className="flex gap-3 py-3">
                <span className={`tabular flex size-10 shrink-0 items-center justify-center rounded-lg font-display text-lg font-bold ${tone(r.score)}`}>{r.score}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{r.name || r.email}</span>
                    <span className="text-muted"> · <Link to={`/console/customers/${r.orgId}`} className="text-accent hover:underline">{r.organisation || t('Customer')}</Link> · {formatDate(isoDate(new Date(r.at)))}</span>
                  </p>
                  {r.comment ? <p className="mt-1 text-sm whitespace-pre-line text-slate-700">“{r.comment}”</p> : <p className="mt-1 text-sm text-muted">{t('No comment.')}</p>}
                  {r.quoteOk && <span className="mt-1.5 inline-block rounded-full bg-good-soft px-2 py-0.5 text-xs font-medium text-good">{t('May be quoted on the website')}</span>}
                </div>
                <a href={`mailto:${r.email}`} className="hidden shrink-0 self-start text-sm font-medium text-accent sm:block">{t('Email')}</a>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Card className="p-4 text-sm text-muted">{t('Only quote someone who ticked “may be quoted”, and only the words they wrote.')}</Card>
    </div>
  )
}
