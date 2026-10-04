import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, EmptyState, inputClass } from '../components/ui'
import { addTask, can, removeTask, setTaskDone } from '../data/platform'
import { addDays, formatDate, isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { useOwner } from './context'
import { PageHead, Section, Tabs, useAction } from './ui'

type View = 'mine' | 'open' | 'overdue' | 'done'

/** Follow-ups for the team: who does what, by when. */
export default function Tasks() {
  const { tasks, team, customers, me, staffName } = useOwner()
  const { busy, run, messages } = useAction()
  const [view, setView] = useState<View>('mine')
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(addDays(isoDate(), 3))
  const [assignee, setAssignee] = useState(me.id)
  const [orgId, setOrgId] = useState('')
  const today = isoDate()
  const lists: Record<View, typeof tasks> = {
    mine: tasks.filter((x) => !x.done && x.assignee === me.id),
    open: tasks.filter((x) => !x.done),
    overdue: tasks.filter((x) => !x.done && x.due < today),
    done: tasks.filter((x) => x.done),
  }
  const shown = [...lists[view]].sort((a, b) => (view === 'done' ? (b.doneAt?.toMillis() ?? 0) - (a.doneAt?.toMillis() ?? 0) : a.due.localeCompare(b.due)))
  const support = can(me.role, 'support')
  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const m = team.find((x) => x.id === assignee)
    const org = customers.find((c) => c.org.id === orgId)?.org
    run('add', async () => { await addTask({ title: title.trim(), due, assignee, assigneeEmail: m?.email ?? '' }, me, org); setTitle('') }, t('Task added.'))
  }
  return (
    <>
      <PageHead title={t('Tasks')} sub={t('Follow-ups for the team, with a due date and someone responsible.')} />
      {messages}
      {support && (
        <Section title={t('New task')}>
          <form onSubmit={add} className="flex flex-wrap gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder={t('e.g. Call Maju Trading about renewal')} className={`${inputClass} min-w-64 flex-1`} />
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className={`${inputClass} w-auto`} aria-label={t('Customer')}>
              <option value="">{t('No customer')}</option>
              {[...customers].sort((a, b) => a.org.name.localeCompare(b.org.name)).map((c) => <option key={c.org.id} value={c.org.id}>{c.org.name}</option>)}
            </select>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={`${inputClass} w-auto`} aria-label={t('For')}>{team.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}</select>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${inputClass} w-auto`} aria-label={t('Due date')} />
            <Button type="submit" busy={busy === 'add'} disabled={!title.trim()}>{t('Add task')}</Button>
          </form>
        </Section>
      )}
      <Tabs value={view} onChange={setView} items={[['mine', t('Mine'), lists.mine.length], ['open', t('All open'), lists.open.length], ['overdue', t('Overdue'), lists.overdue.length], ['done', t('Done'), lists.done.length]]} />
      {shown.length === 0 ? (
        <EmptyState title={t('Nothing here')} text={view === 'mine' ? t('No open tasks for you.') : t('No tasks in this view.')} />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {shown.map((x) => (
              <li key={x.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <input type="checkbox" checked={x.done} disabled={!support} onChange={(e) => run(x.id, () => setTaskDone(x, e.target.checked), '')} className="size-4 accent-accent" aria-label={t('Done')} />
                <span className={`min-w-0 flex-1 ${x.done ? 'text-muted line-through' : ''}`}>
                  {x.title}
                  <span className="block text-xs text-muted">
                    {x.organisationId && <Link to={`/owner/customers/${x.organisationId}`} className="text-accent hover:underline">{x.organisationName}</Link>}
                    {x.organisationId && ' · '}
                    {staffName(x.assignee)}
                  </span>
                </span>
                <span className={`shrink-0 text-xs ${!x.done && x.due < today ? 'font-semibold text-bad' : 'text-muted'}`}>{formatDate(x.due)}</span>
                {(can(me.role, 'suspend') || x.by === me.id) && (
                  <button type="button" onClick={() => run(`d${x.id}`, () => removeTask(x), '', t('Delete this task?'))} className="text-muted hover:text-bad" aria-label={t('Delete')}>×</button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
