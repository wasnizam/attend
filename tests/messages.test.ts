import { describe, expect, it } from 'vitest'
import { messagesFor, nextMeeting, whatsappLink } from '../src/lib/messages'
import { setPurpose } from '../src/lib/purpose'
import type { WeeklyClass } from '../src/lib/types'

describe('messages to the people in a session', () => {
  it('speak each edition’s language', () => {
    setPurpose('education')
    const lect = messagesFor(['before', 'rule'], { course: 'SECJ2013 Data Structures', date: '2026-10-23', startTime: '09:00', endTime: '11:00', venue: 'DK1', required: 80 })
    expect(lect[0].text).toMatch(/^Reminder: SECJ2013 Data Structures is on Friday .*9:00 AM – 11:00 AM at DK1\. .*student ID/)
    expect(lect[1].text).toMatch(/at least 80% of the classes of SECJ2013 Data Structures/)
    setPurpose('training')
    const trn = messagesFor(['before', 'after', 'rule'], { course: 'Excel for Managers', date: '2026-10-23', online: true })
    expect(trn).toHaveLength(2)
    expect(trn[0].text).toMatch(/online on Friday/)
    expect(trn[1].text).toMatch(/certificate of attendance/)
    setPurpose('workplace')
    expect(messagesFor(['before', 'intro', 'clockOut'], { course: '', date: '2026-10-26' }).map((m) => m.kind)).toEqual(['intro', 'clockOut'])
  })

  it('gives an online session its check-in link', () => {
    setPurpose('education')
    expect(messagesFor(['during'], { course: 'Stats', online: true, link: 'https://dobry.app/session/ABC123' })[0].text).toMatch(/Open https:\/\/dobry\.app\/session\/ABC123/)
  })

  it('finds a class’s next meeting, skipping cancelled ones', () => {
    const cls = { slots: [{ day: 5, startTime: '09:00', endTime: '11:00' }], days: [5], startTime: '09:00', endTime: '11:00', startDate: '2026-09-01', endDate: '2026-12-31', cancelled: { '2026-10-23_0900': 'Holiday' } } as unknown as WeeklyClass
    expect(nextMeeting(cls, '2026-10-21')).toEqual({ date: '2026-10-30', startTime: '09:00', endTime: '11:00' })
    expect(nextMeeting({ ...cls, endDate: '2026-10-22' } as WeeklyClass, '2026-10-21')).toBeNull()
  })

  it('opens WhatsApp with the text written in', () => {
    expect(whatsappLink('Hi & bye')).toBe('https://wa.me/?text=Hi%20%26%20bye')
  })
})
