import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, EmptyState } from '../components/ui'
import { isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { DAY, csvDownload, dateOf, editionName, money, moneyMix, statusLabel, useOwner } from './context'
import { Kpi, PageHead, StatusBadge, Tabs, planUntil, td, th } from './ui'

type View = 'paying' | 'failed' | 'cancelling' | 'renewing' | 'trials' | 'lapsed' | 'all'

/** Every subscription: who pays what, how often, and when it renews. */
export default function Subscriptions() {
  const { customers } = useOwner()
  const navigate = useNavigate()
  const [view, setView] = useState<View>('paying')
  const now = Date.now()
  const lists: Record<View, typeof customers> = {
    paying: customers.filter((c) => c.status === 'pro'),
    // A card that Stripe could not charge: still on Pro while it retries, then for a few days of grace.
    failed: customers.filter((c) => c.org.paymentFailure || c.org.stripeStatus === 'past_due' || c.org.stripeStatus === 'unpaid'),
    cancelling: customers.filter((c) => c.status === 'pro' && c.org.stripeCancelAtPeriodEnd),
    renewing: customers.filter((c) => c.status === 'pro' && c.until && c.until - now < 30 * DAY),
    trials: customers.filter((c) => c.status === 'trial'),
    lapsed: customers.filter((c) => c.lapsed),
    all: customers,
  }
  const shown = [...lists[view]].sort((a, b) => (a.until ?? Infinity) - (b.until ?? Infinity))
  const mrr = (list: typeof customers) => list.reduce<Record<string, number>>((a, c) => (c.mrr && c.org.price ? { ...a, [c.org.price.currency]: (a[c.org.price.currency] ?? 0) + c.mrr } : a), {})
  const noPrice = lists.paying.filter((c) => !c.org.price).length
  const exportCsv = () =>
    csvDownload(`dobry-subscriptions-${isoDate()}.csv`, [
      ['Company', 'Edition', 'Plan', 'Price', 'Currency', 'Billed', 'Monthly revenue', 'Staff covered', 'Until'],
      ...shown.map((c) => [c.org.name, editionName(c.org), statusLabel(c.status), c.org.price?.amount ?? '', c.org.price?.currency ?? '', c.org.price?.cycle ?? '', c.mrr ? Math.round(c.mrr * 100) / 100 : 0, c.org.seats ?? '', dateOf(c.until)]),
    ])
  return (
    <>
      <PageHead title={t('Subscriptions')} sub={t('Plans, prices and renewal dates.')} actions={<Button variant="secondary" onClick={exportCsv} disabled={!shown.length}>{t('Export for Excel')}</Button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t('Monthly recurring revenue')} value={moneyMix(mrr(lists.paying))} note={noPrice ? t('{n} paying customers have no price set', { n: noPrice }) : undefined} tone={noPrice ? 'warn' : undefined} />
        <Kpi label={t('Paying')} value={lists.paying.length} />
        <Kpi label={t('Payment failed')} value={lists.failed.length} note={lists.failed.length ? moneyMix(mrr(lists.failed)) : t('Every card is going through.')} tone={lists.failed.length ? 'warn' : undefined} />
        <Kpi label={t('On trial')} value={lists.trials.length} />
      </div>
      <Tabs
        value={view}
        onChange={setView}
        items={[
          ['paying', t('Paying'), lists.paying.length],
          ['failed', t('Payment failed'), lists.failed.length],
          ['cancelling', t('Cancelling'), lists.cancelling.length],
          ['renewing', t('Renewing soon'), lists.renewing.length],
          ['trials', t('Trials'), lists.trials.length],
          ['lapsed', t('Lapsed'), lists.lapsed.length],
          ['all', t('All'), lists.all.length],
        ]}
      />
      {shown.length === 0 ? (
        <EmptyState title={t('Nothing here')} text={t('No subscriptions in this view.')} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-slate-50"><tr>{['Company', 'Edition', 'Plan', 'Price', 'Revenue / month', 'Staff covered', 'Ends or renews'].map((h) => <th key={h} className={th}>{t(h)}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {shown.map((c) => (
                <tr key={c.org.id} className="cursor-pointer hover:bg-canvas/60" onClick={() => navigate(`/console/customers/${c.org.id}`)}>
                  <td className={`${td} font-medium text-accent`}>{c.org.name}</td>
                  <td className={td}>{editionName(c.org)}</td>
                  <td className={td}>
                    <StatusBadge c={c} />
                    {c.org.paymentFailure && (
                      <span className="mt-1 block text-xs font-medium whitespace-nowrap text-bad">
                        {t('Card failed {date}', { date: dateOf(c.org.paymentFailure.at?.toMillis() ?? null) })} · {money(c.org.paymentFailure.amount, c.org.paymentFailure.currency)}
                        <span className="block font-normal text-muted">
                          {t('Try {n}', { n: c.org.paymentFailure.attempt })}
                          {c.org.paymentFailure.nextTry ? ` · ${t('next try {date}', { date: dateOf(c.org.paymentFailure.nextTry.toMillis()) })}` : ` · ${t('no more tries')}`}
                        </span>
                      </span>
                    )}
                    {c.status === 'pro' && c.org.stripeCancelAtPeriodEnd && <span className="mt-1 block text-xs font-medium whitespace-nowrap text-[#b25e00]">{t('Cancelled: will not renew')}</span>}
                  </td>
                  <td className={`${td} tabular`}>{c.org.price ? `${money(c.org.price.amount, c.org.price.currency)} / ${t(c.org.price.cycle)}` : <span className="text-muted">—</span>}</td>
                  <td className={`${td} tabular`}>{c.mrr ? money(Math.round(c.mrr * 100) / 100, c.org.price?.currency) : '—'}</td>
                  <td className={`${td} tabular`}>{c.org.purpose === 'workplace' ? (c.org.seats ? `${c.people} / ${c.org.seats}` : c.people) : '—'}</td>
                  <td className={`${td} whitespace-nowrap ${c.until && c.until - now < 7 * DAY && !c.lapsed ? 'font-semibold text-[#b25e00]' : ''}`}>{planUntil(c) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}
