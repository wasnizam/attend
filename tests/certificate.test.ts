import { describe, expect, it } from 'vitest'
import { CODE_LENGTH, earns, newCode, sessionHours, tally, tidyCode, tidyText } from '../api/_lib/certificate'

describe('certificate codes', () => {
  it('are eight characters with none that are easily misread', () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
  })

  it('are read from a link or from paper, with dashes and spaces', () => {
    expect(tidyCode('k7q2-m9xd')).toBe('K7Q2M9XD')
    expect(tidyCode(' K7Q2 M9XD ')).toBe('K7Q2M9XD')
    expect(tidyCode('K7Q2M9X0')).toBe('') // 0 is never used
    expect(tidyCode('K7Q2')).toBe('')
    expect(tidyCode(undefined)).toBe('')
    expect(CODE_LENGTH).toBe(8)
  })

  it('keep typed text to one tidy line', () => {
    expect(tidyText('  Excel\n for   Managers ', 100)).toBe('Excel for Managers')
    expect(tidyText('x'.repeat(300), 160)).toHaveLength(160)
  })
})

describe('the figures on a certificate', () => {
  it('count a session’s length from its times, past midnight too', () => {
    expect(sessionHours({ startTime: '09:00', endTime: '17:00' })).toBe(8)
    expect(sessionHours({ startTime: '09:00', endTime: '10:30' })).toBe(1.5)
    expect(sessionHours({ startTime: '22:00', endTime: '01:00' })).toBe(3)
    expect(sessionHours({})).toBe(0)
  })

  const held = [
    { id: 'a', date: '2026-10-12', startTime: '09:00', endTime: '13:00' },
    { id: 'b', date: '2026-10-12', startTime: '14:00', endTime: '17:00' },
    { id: 'c', date: '2026-10-13', startTime: '09:00', endTime: '13:00' },
    { id: 'd', date: '2026-10-13', startTime: '14:00', endTime: '17:00' },
  ]

  it('come from the records: sessions, hours, attendance and the days attended', () => {
    const rows = tally(held, [
      { sessionId: 'a', studentKey: 'ali', studentName: 'Ali' },
      { sessionId: 'b', studentKey: 'ali', studentName: 'Ali', status: 'late' },
      { sessionId: 'c', studentKey: 'ali', studentName: 'Ali' },
      { sessionId: 'd', studentKey: 'ali', studentName: 'Ali' },
      { sessionId: 'a', studentKey: 'siti', studentName: 'Siti' },
      { sessionId: 'c', studentKey: 'siti', studentName: 'Siti', status: 'mc' },
      { sessionId: 'zzz', studentKey: 'siti', studentName: 'Siti' }, // not a session of this course
    ])
    expect(rows.get('ali')).toMatchObject({ attended: 4, counted: 4, hours: 14, rate: 100, from: '2026-10-12', to: '2026-10-13' })
    // MC is left out of what counts, as in the reports: 1 of 3.
    expect(rows.get('siti')).toMatchObject({ attended: 1, counted: 3, hours: 4, rate: 33, from: '2026-10-12', to: '2026-10-12' })
  })

  it('are only given to people at or above the minimum, who attended at least once', () => {
    const rows = tally(held, [
      { sessionId: 'a', studentKey: 'ali', studentName: 'Ali' },
      { sessionId: 'b', studentKey: 'ali', studentName: 'Ali' },
      { sessionId: 'c', studentKey: 'ali', studentName: 'Ali' },
      { sessionId: 'a', studentKey: 'mc', studentName: 'Away', status: 'mc' },
    ])
    expect(earns(rows.get('ali')!, 75)).toBe(true)
    expect(earns(rows.get('ali')!, 80)).toBe(false)
    expect(earns(rows.get('mc')!, 0)).toBe(false)
  })
})
