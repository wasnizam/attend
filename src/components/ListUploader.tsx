import { useMemo, useRef, useState } from 'react'
import { addToRoster } from '../data/roster'
import { t } from '../lib/i18n'
import { type ImportGrid, type RosterEntry, parseFile, parseText, toRoster } from '../lib/rosterImport'
import type { WeeklyClass } from '../lib/types'
import { Button, Card, ErrorNote, friendlyError, inputClass } from './ui'

interface Props {
  cls: WeeklyClass
  /** Students already on the list, so the class headcount stays right. */
  current: RosterEntry[]
  /** Shown next to the "saved" message, e.g. a link back to Today. */
  after?: React.ReactNode
}

/**
 * Upload a class list from Excel, CSV or PDF (or paste it), check what was found,
 * then save. Used on the class's own list page and on the Students page.
 */
export function ListUploader({ cls, current, after }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [grid, setGrid] = useState<ImportGrid | null>(null)
  const [source, setSource] = useState('')
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const found = useMemo(() => (grid ? toRoster(grid.rows, grid.idCol, grid.nameCol) : []), [grid])
  const width = grid ? Math.max(0, ...grid.rows.map((r) => r.length)) : 0

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await fn()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const preview = (next: ImportGrid, from: string) => {
    if (next.rows.length === 0) throw new Error(t('We could not find any students in {from}. Try an Excel or CSV file, or paste the list.', { from }))
    setGrid(next)
    setSource(from)
  }

  const pick = (file: File | undefined) => {
    if (!file) return
    run(async () => preview(await parseFile(file), file.name))
    if (fileInput.current) fileInput.current.value = ''
  }

  const save = () =>
    run(async () => {
      await addToRoster(cls, found, current)
      setNotice(t('{n} students saved to the list.', { n: found.length }))
      setGrid(null)
      setPasted('')
      setPasting(false)
    })

  return (
    <div className="space-y-3">
      <ErrorNote>{error}</ErrorNote>
      {notice && (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-good-soft px-4 py-3 text-sm text-good">
          {notice}
          {after}
        </p>
      )}
      {grid ? (
        <Card className="space-y-4 p-5 sm:p-6">
          <div>
            <h2 className="font-semibold">{t('Check the list')}</h2>
            <p className="mt-1 text-sm text-muted">
              {t('Students found in {source}:', { source })} <span className="font-semibold text-ink">{found.length}</span>
            </p>
          </div>
          {width > 2 && (
            <div className="grid grid-cols-2 gap-3">
              {(['idCol', 'nameCol'] as const).map((field) => (
                <label key={field} className="block text-xs font-medium text-muted">
                  {field === 'idCol' ? t('Student ID column') : t('Name column')}
                  <select
                    value={grid[field]}
                    onChange={(e) => setGrid({ ...grid, [field]: Number(e.target.value) })}
                    className={`${inputClass} mt-1`}
                  >
                    {Array.from({ length: width }, (_, i) => (
                      <option key={i} value={i}>
                        {`${t('Column')} ${i + 1}: ${grid.rows.slice(0, 6).map((r) => r[i]).filter(Boolean).slice(0, 2).join(', ').slice(0, 28) || t('empty')}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
          {found.length === 0 ? (
            <p className="rounded-lg bg-canvas px-4 py-3 text-sm text-muted">
              {t('No rows look like a student ID with a name.')} {width > 2 ? t('Try choosing different columns above.') : t('Try another file, or paste the list.')}
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-line">
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-line">
                  {found.map((s) => (
                    <tr key={s.studentKey}>
                      <td className="tabular w-36 px-4 py-2 font-medium break-all">{s.studentId}</td>
                      <td className="px-4 py-2 break-words">{s.studentName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" block disabled={busy} onClick={() => setGrid(null)}>{t('Cancel')}</Button>
            <Button block busy={busy} disabled={found.length === 0} onClick={save}>
              {t('Save {n} students', { n: found.length })}
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="space-y-4 p-5 sm:p-6">
          <div>
            <h2 className="font-semibold">{t('Upload a student list')}</h2>
            <p className="mt-1 text-sm text-muted">
              {t('Excel (.xlsx), CSV or PDF, with a student ID and a name on each row. You will check it before anything is saved.')}
            </p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls,.csv,.tsv,.txt,.pdf"
            className="sr-only"
            aria-label={t('Class list file')}
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <Button busy={busy} onClick={() => fileInput.current?.click()}>{busy ? t('Reading the file…') : t('Choose file')}</Button>
            <Button variant="secondary" disabled={busy} onClick={() => setPasting(!pasting)}>{t('Paste a list')}</Button>
          </div>
          {pasting && (
            <div className="space-y-3">
              <textarea
                rows={6}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={'A21CS0042  Ahmad bin Ali\nA21CS0043  Siti Aminah'}
                aria-label={t('Pasted class list')}
                className={`${inputClass} h-auto py-3 font-mono text-sm`}
              />
              <Button variant="secondary" disabled={!pasted.trim() || busy} onClick={() => run(async () => preview(parseText(pasted), t('the pasted text')))}>
                {t('Check pasted list')}
              </Button>
            </div>
          )}
        </Card>
      )}

    </div>
  )
}
