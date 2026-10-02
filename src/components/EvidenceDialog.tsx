import { type FormEvent, useRef, useState } from 'react'
import { type Evidence, LEAVE_LABEL, LEAVE_TYPES, type LeaveType } from '../data/evidence'
import { type PreparedFile, openEvidence, prepareEvidence } from '../lib/evidenceFile'
import { t } from '../lib/i18n'
import { has } from '../lib/purpose'
import type { AttendanceStatus } from '../lib/types'
import { Button, ErrorNote, Field, friendlyError, inputClass } from './ui'

interface Props {
  student: { studentId: string; studentName: string }
  status: AttendanceStatus
  current?: Evidence
  onCancel: () => void
  /** file: a new file, null to remove the saved one, undefined to keep it. */
  onSave: (details: { remarks: string; mcNumber?: string; clinic?: string; leaveType?: LeaveType }, file: PreparedFile | null | undefined) => Promise<void>
}

/** Details and proof for an MC or excused absence. An MC needs its number and the clinic's name. */
export function EvidenceDialog({ student, status, current, onCancel, onSave }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [remarks, setRemarks] = useState(current?.remarks ?? '')
  const [mcNumber, setMcNumber] = useState(current?.mcNumber ?? '')
  const [clinic, setClinic] = useState(current?.clinic ?? '')
  const [file, setFile] = useState<PreparedFile | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mc = status === 'mc'
  // A workplace records what kind of leave it was, for payroll.
  const leave = !mc && has('clock')
  const [leaveType, setLeaveType] = useState<LeaveType>(current?.leaveType ?? 'annual')
  // What will be on record after saving: the new pick, or whatever is already saved.
  const shown = file === undefined ? (current?.dataUrl ? { fileName: current.fileName ?? '', dataUrl: current.dataUrl } : null) : file

  const pick = async (picked: File | undefined) => {
    if (!picked) return
    setBusy(true)
    setError('')
    try {
      setFile(await prepareEvidence(picked))
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (mc && (!mcNumber.trim() || !clinic.trim())) return setError(t('Please enter the MC number and the clinic name.'))
    setBusy(true)
    setError('')
    try {
      await onSave(mc ? { remarks, mcNumber, clinic } : leave ? { remarks, leaveType } : { remarks }, file)
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={mc ? t('MC details') : t('Reason for absence')}>
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-t-xl bg-white p-5 shadow-pop sm:rounded-xl sm:p-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{mc ? t('MC details') : t('Reason for absence')}</h2>
          <p className="text-sm text-muted">
            {student.studentName} · <span className="tabular">{student.studentId}</span>
          </p>
        </div>

        {leave && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t('Type of leave')}</span>
            <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)} className={inputClass}>
              {LEAVE_TYPES.map((type) => (
                <option key={type} value={type}>{t(LEAVE_LABEL[type])}</option>
              ))}
            </select>
          </label>
        )}
        {mc && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('MC number')} required autoFocus maxLength={40} placeholder={t('e.g. MC 0123456')} value={mcNumber} onChange={(e) => setMcNumber(e.target.value)} />
            <Field label={t('Clinic or hospital')} required maxLength={100} placeholder={t('e.g. Klinik Kesihatan UTM')} value={clinic} onChange={(e) => setClinic(e.target.value)} />
          </div>
        )}

        <label className="block">
          <span className="mb-1.5 flex justify-between text-sm font-medium">
            {t('Remarks')}
            <span className="font-normal text-muted">{t('Optional')}</span>
          </span>
          <textarea
            rows={2}
            maxLength={500}
            autoFocus={!mc}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder={mc ? t('e.g. Covers 9–10 Sept, fever') : has('clock') ? t('e.g. Annual leave') : t('e.g. Representing the university at a competition')}
            className={`${inputClass} h-auto py-3`}
          />
        </label>

        <div>
          <p className="mb-1.5 flex justify-between text-sm font-medium">
            {t('Evidence')}
            <span className="font-normal text-muted">{t('Photo or PDF')}</span>
          </p>
          <input ref={input} type="file" accept="image/*,application/pdf" className="sr-only" aria-label={t('Evidence file')} onChange={(e) => pick(e.target.files?.[0])} />
          {shown ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2 text-sm">
              <button type="button" className="min-w-0 truncate font-medium text-accent hover:underline" onClick={() => openEvidence(shown.dataUrl)}>
                {shown.fileName || t('View evidence')}
              </button>
              <span className="flex shrink-0 gap-3">
                <button type="button" className="font-medium text-accent" onClick={() => input.current?.click()}>{t('Replace')}</button>
                <button type="button" className="font-medium text-bad" onClick={() => setFile(null)}>{t('Remove')}</button>
              </span>
            </div>
          ) : (
            <>
              <Button variant="secondary" busy={busy} onClick={() => input.current?.click()}>
                {t('Add a photo or PDF')}
              </Button>
              {mc && <p className="mt-2 text-xs text-[#b25e00]">{t('No evidence yet. You can save now and add it later; the record will show “Evidence missing”.')}</p>}
            </>
          )}
        </div>

        <ErrorNote>{error}</ErrorNote>
        <div className="flex gap-2">
          <Button variant="secondary" block disabled={busy} onClick={onCancel}>{t('Cancel')}</Button>
          <Button type="submit" block busy={busy}>{t('Save')}</Button>
        </div>
        <p className="text-xs text-muted">{t('Only you and your organisation’s admin can see remarks and evidence.')}</p>
      </form>
    </div>
  )
}
