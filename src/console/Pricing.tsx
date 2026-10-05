import { type FormEvent, useEffect, useState } from 'react'
import { Button, Card, EmptyState, inputClass } from '../components/ui'
import { type Coupon, can, couponLabel, couponUsable, deleteCoupon, saveCoupon, savePricing, subscribeCoupons } from '../data/platform'
import { type EditionId, EDITIONS as EDITION_LIST } from '../lib/editions'
import { addDays, formatDate, isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { type Catalog, type CatalogPlan, CYCLE_LABEL, type Cycle, type Launch, type StartPlan, defaultCatalog, toPlanCard, useCatalog, useLaunch } from '../lib/pricing'
import { PAYMENTS_OPEN } from '../lib/plan'
import { useLive } from '../hooks/useLive'
import { useOwner } from './context'
import { PageHead, Section, Tabs, td, th, useAction } from './ui'

type View = 'plans' | 'codes'

/** What Attend charges: the plans on the website, and the discount codes the team hands out. */
export default function Pricing() {
  const coupons = useLive<Coupon[]>((d, e) => subscribeCoupons(d, e), [])
  const [view, setView] = useState<View>('plans')
  return (
    <>
      <PageHead title={t('Pricing')} sub={t('Plans and prices shown on the website, and discount codes.')} />
      <Tabs value={view} onChange={setView} items={[['plans', t('Plans and prices')], ['codes', t('Discount codes'), coupons.data?.length ?? 0]]} />
      {view === 'plans' ? <Plans /> : <Codes coupons={coupons.data ?? []} />}
    </>
  )
}

function Plans() {
  const { me } = useOwner()
  const live = useCatalog()
  const { busy, run, messages, setError } = useAction()
  const [edition, setEdition] = useState<EditionId>('lecturers')
  const [draft, setDraft] = useState<Catalog>(live)
  const liveLaunch = useLaunch()
  const [launch, setLaunch] = useState<Launch>(liveLaunch)
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (!dirty) {
      setDraft(live)
      setLaunch(liveLaunch)
    }
  }, [live, liveLaunch, dirty])
  const edit = can(me.role, 'settings')
  const plans = draft[edition] ?? []
  const set = (next: CatalogPlan[]) => {
    setDraft({ ...draft, [edition]: next })
    setDirty(true)
  }
  const patch = (i: number, p: Partial<CatalogPlan>) => set(plans.map((x, j) => (j === i ? { ...x, ...p } : p.best ? { ...x, best: false } : x)))
  const move = (i: number, by: number) => {
    const next = [...plans]
    const [x] = next.splice(i, 1)
    next.splice(Math.max(0, Math.min(next.length, i + by)), 0, x)
    set(next)
  }
  const save = () => {
    for (const list of Object.values(draft)) if (list.some((p) => !p.name.trim())) return setError(t('Every plan needs a name.'))
    run('save', async () => {
      await savePricing(draft, me, `Price list saved (${EDITION_LIST.map((e) => `${e.label}: ${draft[e.id].filter((p) => !p.hidden).map((p) => `${p.name} RM${p.priceMyr}`).join(', ')}; new accounts start ${launch[e.id] === 'free' ? 'free' : 'on early access'}`).join(' · ')})`, launch)
      setDirty(false)
    }, t('Prices saved. The website shows them now.'))
  }
  const ed = EDITION_LIST.find((e) => e.id === edition)!
  return (
    <>
      {messages}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={edition} onChange={setEdition} items={EDITION_LIST.map((e) => [e.id, e.label, draft[e.id]?.filter((p) => !p.hidden).length])} />
        {edit && (
          <div className="flex flex-wrap gap-2">
            {dirty && <span className="self-center text-sm text-[#b25e00]">{t('Not saved yet')}</span>}
            <Button variant="secondary" onClick={() => { setDraft({ ...draft, [edition]: defaultCatalog()[edition] }); setDirty(true) }}>{t('Reset to original prices')}</Button>
            <Button busy={busy === 'save'} disabled={!dirty} onClick={save}>{t('Save and publish')}</Button>
          </div>
        )}
      </div>
      {!edit && <p className="text-sm text-muted">{t('Your role can see the prices but not change them.')}</p>}
      <Section
        title={t('While payment is not connected')}
        sub={PAYMENTS_OPEN ? t('Online payment is open: new accounts start a 14-day Pro trial.') : t('Customers cannot pay in the app yet. The website shows these prices as “opens soon”. Record bank transfers under Billing, and upgrade a customer by hand.')}
      >
        <p className="text-xs font-medium text-muted">{t('When a new account signs up, it starts on')}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {EDITION_LIST.map((e) => (
            <label key={e.id} className="block text-sm">
              <span className="font-medium">{e.label}</span>
              <select
                disabled={!edit || PAYMENTS_OPEN}
                value={launch[e.id]}
                onChange={(x) => { setLaunch({ ...launch, [e.id]: x.target.value as StartPlan }); setDirty(true) }}
                className={`${inputClass} mt-1`}
              >
                <option value="free">{t('Free plan')} · {draft[e.id]?.find((p) => p.cycle === 'free')?.items[0] ?? ''}</option>
                <option value="early">{t('Early access (no limits)')}</option>
              </select>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">{t('Only affects accounts created from now on. Existing customers keep their plan; change one by hand on the customer’s page.')}</p>
      </Section>
      <div className="grid gap-4 xl:grid-cols-2">
        {plans.map((p, i) => (
          <Card key={p.id} className={`p-5 ${p.hidden ? 'opacity-60' : ''}`}>
            <fieldset disabled={!edit} className="space-y-3">
              <div className="flex items-center gap-2">
                <input value={p.name} onChange={(e) => patch(i, { name: e.target.value })} maxLength={40} placeholder={t('Plan name')} className={`${inputClass} font-semibold`} aria-label={t('Plan name')} />
                {edit && (
                  <span className="flex shrink-0 gap-1 text-muted">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded px-1.5 hover:bg-canvas disabled:opacity-30" aria-label={t('Move up')}>↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === plans.length - 1} className="rounded px-1.5 hover:bg-canvas disabled:opacity-30" aria-label={t('Move down')}>↓</button>
                    <button type="button" onClick={() => window.confirm(t('Remove the plan “{name}”?', { name: p.name })) && set(plans.filter((_, j) => j !== i))} className="rounded px-1.5 hover:bg-canvas hover:text-bad" aria-label={t('Remove plan')}>×</button>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="text-xs font-medium text-muted">RM<input type="number" min="0" step="0.01" value={p.priceMyr} onChange={(e) => patch(i, { priceMyr: Number(e.target.value) })} className={`${inputClass} mt-1`} /></label>
                <label className="text-xs font-medium text-muted">US$<input type="number" min="0" step="0.01" value={p.priceUsd} onChange={(e) => patch(i, { priceUsd: Number(e.target.value) })} className={`${inputClass} mt-1`} /></label>
                <label className="text-xs font-medium text-muted">{t('Billed')}<select value={p.cycle} onChange={(e) => patch(i, { cycle: e.target.value as Cycle })} className={`${inputClass} mt-1`}>{(Object.keys(CYCLE_LABEL) as Cycle[]).map((c) => <option key={c} value={c}>{t(CYCLE_LABEL[c])}</option>)}</select></label>
                {edition === 'workplace' && <label className="text-xs font-medium text-muted">{t('Staff limit')}<input type="number" min="0" step="1" value={p.seats ?? 0} onChange={(e) => patch(i, { seats: Number(e.target.value) })} className={`${inputClass} mt-1`} /></label>}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input value={p.noteMyr ?? ''} onChange={(e) => patch(i, { noteMyr: e.target.value })} maxLength={120} placeholder={t('Line under the price (RM), optional')} className={inputClass} />
                <input value={p.noteUsd ?? ''} onChange={(e) => patch(i, { noteUsd: e.target.value })} maxLength={120} placeholder={t('Line under the price (US$), optional')} className={inputClass} />
              </div>
              <label className="block text-xs font-medium text-muted">
                {t('What is included (one per line; start a line with ✕ for not included)')}
                <textarea rows={Math.min(14, Math.max(3, p.items.length))} value={p.items.join('\n')} onChange={(e) => patch(i, { items: e.target.value.split('\n').map((x) => x.trimStart()).slice(0, 16) })} className={`${inputClass} mt-1`} />
              </label>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="radio" name={`best-${edition}`} checked={Boolean(p.best)} onChange={() => patch(i, { best: true })} className="accent-accent" />{t('Most popular')}</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(p.hidden)} onChange={(e) => patch(i, { hidden: e.target.checked })} className="size-4 accent-accent" />{t('Hidden from the website')}</label>
              </div>
            </fieldset>
            <Preview plan={p} />
          </Card>
        ))}
      </div>
      {edit && plans.length < 10 && (
        <button type="button" onClick={() => set([...plans, { id: `${edition}-${Date.now()}`, name: 'New plan', priceMyr: 0, priceUsd: 0, cycle: 'month', items: ['Every feature included'] }])} className="text-sm font-medium text-accent">
          + {t('Add a plan to {edition}', { edition: ed.label })}
        </button>
      )}
      <p className="text-xs text-muted">{t('Trial length and the free plan’s limits are fixed in the app for now. Plan names and features show in English on the website unless they match an existing translation.')}</p>
    </>
  )
}

/** How the plan looks on the website. */
function Preview({ plan }: { plan: CatalogPlan }) {
  const card = toPlanCard(plan)
  return (
    <div className="mt-4 rounded-xl border border-line bg-canvas/50 p-4">
      <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{t('On the website')}{plan.hidden ? ` · ${t('hidden')}` : ''}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-semibold">{card.name}</span>
        {card.best && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">{t('Most popular')}</span>}
      </div>
      <p className="mt-1"><span className="text-2xl font-semibold">{card.price.myr}</span> <span className="text-sm text-muted">{t(card.per)}</span> <span className="text-xs text-muted">· {card.price.usd}</span></p>
      {card.alt && typeof card.alt !== 'string' && card.alt.myr && <p className="text-xs text-muted">{card.alt.myr}</p>}
      <ul className="mt-2 space-y-0.5 text-xs text-slate-700">{card.items.filter(Boolean).map((x) => <li key={x}>✓ {x}</li>)}</ul>
    </div>
  )
}

function Codes({ coupons }: { coupons: Coupon[] }) {
  const { me } = useOwner()
  const { busy, run, messages, setError } = useAction()
  const moneyOk = can(me.role, 'money')
  const blank: Coupon = { code: '', kind: 'percent', value: 10, currency: 'MYR', editions: [], duration: 'once', cycles: 3, validFrom: isoDate(), validTo: addDays(isoDate(), 30), maxUses: 0, uses: 0, active: true, note: '' }
  const [draft, setDraft] = useState<Coupon>(blank)
  const [editing, setEditing] = useState(false)
  const today = isoDate()
  const state = (c: Coupon) => (!c.active ? ['Off', 'bg-slate-100 text-muted'] : c.validFrom && c.validFrom > today ? ['Scheduled', 'bg-accent-soft text-accent'] : c.validTo && c.validTo < today ? ['Expired', 'bg-slate-100 text-muted'] : c.maxUses && c.uses >= c.maxUses ? ['Used up', 'bg-slate-100 text-muted'] : ['Active', 'bg-good-soft text-good'])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const code = draft.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '')
    if (code.length < 3) return setError(t('Use a code of at least 3 letters or numbers.'))
    if (!editing && coupons.some((c) => c.code === code)) return setError(t('That code already exists.'))
    if (!(draft.value > 0) || (draft.kind === 'percent' && draft.value > 100)) return setError(t('Enter a discount between 1 and 100%, or an amount above zero.'))
    const clean: Coupon = { ...draft, code, value: Number(draft.value), maxUses: Math.max(0, Math.floor(Number(draft.maxUses) || 0)), cycles: draft.duration === 'repeating' ? Math.max(1, Math.floor(Number(draft.cycles) || 1)) : undefined, currency: draft.kind === 'amount' ? draft.currency : undefined }
    Object.keys(clean).forEach((k) => (clean as unknown as Record<string, unknown>)[k] === undefined && delete (clean as unknown as Record<string, unknown>)[k])
    run('save', async () => { await saveCoupon(clean, me, !editing); setDraft(blank); setEditing(false) }, editing ? t('Code updated.') : t('Code {code} created.', { code }))
  }
  const label = 'block text-xs font-medium text-muted'
  return (
    <>
      {messages}
      <div className="grid gap-4 lg:grid-cols-5">
        {moneyOk && (
          <Section title={editing ? t('Edit {code}', { code: draft.code }) : t('New discount code')} className="lg:col-span-2">
            <form onSubmit={submit} className="space-y-3">
              <label className={label}>{t('Code')}<input value={draft.code} disabled={editing} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} maxLength={20} placeholder="RAYA20" className={`${inputClass} mt-1 font-mono uppercase`} /></label>
              <div className="grid grid-cols-3 gap-2">
                <label className={label}>{t('Type')}<select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Coupon['kind'] })} className={`${inputClass} mt-1`}><option value="percent">{t('Percent off')}</option><option value="amount">{t('Amount off')}</option></select></label>
                <label className={label}>{draft.kind === 'percent' ? '%' : t('Amount')}<input type="number" min="0" step="0.01" value={draft.value} onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) })} className={`${inputClass} mt-1`} /></label>
                {draft.kind === 'amount' && <label className={label}>{t('Currency')}<select value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value as 'MYR' | 'USD' })} className={`${inputClass} mt-1`}><option value="MYR">RM</option><option value="USD">US$</option></select></label>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>{t('Lasts')}<select value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value as Coupon['duration'] })} className={`${inputClass} mt-1`}><option value="once">{t('One invoice')}</option><option value="repeating">{t('Several billing periods')}</option><option value="forever">{t('For as long as they pay')}</option></select></label>
                {draft.duration === 'repeating' && <label className={label}>{t('Billing periods')}<input type="number" min="1" step="1" value={draft.cycles ?? 3} onChange={(e) => setDraft({ ...draft, cycles: Number(e.target.value) })} className={`${inputClass} mt-1`} /></label>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className={label}>{t('From')}<input type="date" value={draft.validFrom ?? ''} onChange={(e) => setDraft({ ...draft, validFrom: e.target.value })} className={`${inputClass} mt-1`} /></label>
                <label className={label}>{t('Until')}<input type="date" value={draft.validTo ?? ''} onChange={(e) => setDraft({ ...draft, validTo: e.target.value })} className={`${inputClass} mt-1`} /></label>
                <label className={label}>{t('Max uses (0 = any)')}<input type="number" min="0" step="1" value={draft.maxUses} onChange={(e) => setDraft({ ...draft, maxUses: Number(e.target.value) })} className={`${inputClass} mt-1`} /></label>
              </div>
              <fieldset>
                <legend className={label}>{t('For')}</legend>
                <div className="mt-1 flex flex-wrap gap-3 text-sm">
                  {EDITION_LIST.map((e) => (
                    <label key={e.id} className="flex items-center gap-1.5"><input type="checkbox" className="size-4 accent-accent" checked={draft.editions.includes(e.id)} onChange={(x) => setDraft({ ...draft, editions: x.target.checked ? [...draft.editions, e.id] : draft.editions.filter((y) => y !== e.id) })} />{e.label}</label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted">{t('None ticked means every edition.')}</p>
              </fieldset>
              <input value={draft.note ?? ''} onChange={(e) => setDraft({ ...draft, note: e.target.value })} maxLength={200} placeholder={t('Note for the team, e.g. Hari Raya campaign')} className={inputClass} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} className="size-4 accent-accent" />{t('Switched on')}</label>
              <div className="flex gap-2">
                <Button type="submit" busy={busy === 'save'}>{editing ? t('Save') : t('Create code')}</Button>
                {editing && <Button type="button" variant="secondary" onClick={() => { setDraft(blank); setEditing(false) }}>{t('Cancel')}</Button>}
              </div>
            </form>
          </Section>
        )}
        <div className={moneyOk ? 'lg:col-span-3' : 'lg:col-span-5'}>
          {coupons.length === 0 ? (
            <EmptyState title={t('No discount codes yet')} text={t('Create one for a campaign, a reseller or a big customer.')} />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="bg-slate-50"><tr>{['Code', 'Discount', 'For', 'Valid', 'Used', 'Status', ''].map((h) => <th key={h} className={th}>{h && t(h)}</th>)}</tr></thead>
                <tbody className="divide-y divide-line">
                  {[...coupons].sort((a, b) => Number(couponUsable(b)) - Number(couponUsable(a)) || a.code.localeCompare(b.code)).map((c) => {
                    const [s, style] = state(c)
                    return (
                      <tr key={c.code}>
                        <td className={`${td} font-mono font-semibold`}>{c.code}{c.note && <span className="block font-sans text-xs font-normal text-muted">{c.note}</span>}</td>
                        <td className={td}>{couponLabel(c).replace(`${c.code} (`, '').replace(/\)$/, '')}<span className="block text-xs text-muted">{c.duration === 'once' ? t('one invoice') : c.duration === 'forever' ? t('for as long as they pay') : t('{n} billing periods', { n: c.cycles ?? 1 })}</span></td>
                        <td className={td}>{c.editions?.length ? c.editions.map((e) => EDITION_LIST.find((x) => x.id === e)?.label).join(', ') : t('All')}</td>
                        <td className={`${td} whitespace-nowrap text-xs`}>{c.validFrom ? formatDate(c.validFrom) : '—'} – {c.validTo ? formatDate(c.validTo) : t('no end')}</td>
                        <td className={`${td} tabular`}>{c.uses ?? 0}{c.maxUses ? ` / ${c.maxUses}` : ''}</td>
                        <td className={td}><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{t(s)}</span></td>
                        <td className={`${td} text-right whitespace-nowrap`}>
                          {moneyOk && <button type="button" className="text-xs font-medium text-accent" onClick={() => { setDraft({ ...blank, ...c }); setEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>{t('Edit')}</button>}
                          {moneyOk && <button type="button" className="ml-3 text-xs font-medium text-accent" disabled={busy === c.code} onClick={() => run(c.code, () => saveCoupon({ ...c, active: !c.active }, me, false), c.active ? t('Code switched off.') : t('Code switched on.'))}>{c.active ? t('Switch off') : t('Switch on')}</button>}
                          {can(me.role, 'suspend') && <button type="button" className="ml-3 text-xs font-medium text-bad" onClick={() => run(`d${c.code}`, () => deleteCoupon(c, me), t('Code deleted.'), t('Delete the code {code}? Invoices that used it keep their discount.', { code: c.code }))}>{t('Delete')}</button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
