import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATES, type Facts, due, editionOf, fill, nps, templateId, tidySettings, tidySource, unsubscribeToken } from '../api/_lib/growth'

const DAY = 86_400_000
const now = Date.UTC(2026, 9, 21, 1)
const base = (patch: Partial<Facts> = {}): Facts => ({ createdAt: now - 10 * DAY, first: null, last: null, days: 0, emailed: {}, off: false, suspended: false, ...patch })

describe('which follow-up is due', () => {
  it('nudges a new account with no session after a day, but not on the first day or after a week', () => {
    expect(due(base({ createdAt: now - 2 * DAY }), now)).toBe('firstSession')
    expect(due(base({ createdAt: now - 10 * 3_600_000 }), now)).toBeNull()
    expect(due(base({ createdAt: now - 8 * DAY }), now)).toBeNull()
    expect(due(base({ createdAt: now - 2 * DAY, emailed: { firstSession: now - 5 * DAY } }), now)).toBeNull()
  })

  it('asks for invites after the first session, then sends tips three days on', () => {
    expect(due(base({ first: now - DAY, last: now - DAY, days: 1 }), now)).toBe('invite')
    expect(due(base({ first: now - 4 * DAY, last: now - DAY, days: 3, emailed: { invite: now - 4 * DAY } }), now)).toBe('tips')
    expect(due(base({ first: now - 4 * DAY, last: now - DAY, days: 3, emailed: { invite: now - 4 * DAY, tips: now - 3 * DAY } }), now)).toBeNull()
  })

  it('never sends two within three days', () => {
    expect(due(base({ first: now - 4 * DAY, last: now - DAY, days: 3, emailed: { invite: now - DAY } }), now)).toBeNull()
  })

  it('checks in after a quiet week, and tries to win back after a month', () => {
    const old = { createdAt: now - 200 * DAY, emailed: { invite: now - 150 * DAY, tips: now - 140 * DAY } }
    expect(due(base({ ...old, first: now - 60 * DAY, last: now - 8 * DAY, days: 12 }), now)).toBe('quiet')
    expect(due(base({ ...old, first: now - 60 * DAY, last: now - 8 * DAY, days: 1 }), now)).toBeNull()
    expect(due(base({ ...old, first: now - 70 * DAY, last: now - 31 * DAY, days: 6 }), now)).toBe('winback')
    expect(due(base({ ...old, first: now - 70 * DAY, last: now - 31 * DAY, days: 6, emailed: { ...old.emailed, winback: now - 40 * DAY } }), now)).toBeNull()
    expect(due(base({ createdAt: now - 35 * DAY }), now)).toBe('winback')
  })

  it('does not treat an old account’s first session in the window as its first ever', () => {
    expect(due(base({ createdAt: now - 400 * DAY, first: now - DAY, last: now - DAY, days: 1 }), now)).toBeNull()
  })

  it('sends nothing to someone who unsubscribed or is suspended', () => {
    expect(due(base({ createdAt: now - 2 * DAY, off: true }), now)).toBeNull()
    expect(due(base({ createdAt: now - 2 * DAY, suspended: true }), now)).toBeNull()
  })
})

describe('the emails', () => {
  it('have a template for every edition where the stage differs by edition', () => {
    for (const e of ['lecturers', 'trainers', 'workplace'] as const) {
      expect(DEFAULT_TEMPLATES[templateId('firstSession', e)]).toBeTruthy()
      expect(DEFAULT_TEMPLATES[templateId('tips', e)]).toBeTruthy()
    }
    expect(templateId('invite', 'workplace')).toBe('invite.workplace')
    // Every stage has its own wording for each edition.
    expect(Object.keys(DEFAULT_TEMPLATES)).toHaveLength(15)
    expect(editionOf('training')).toBe('trainers')
    expect(editionOf(undefined)).toBe('lecturers')
  })

  it('fill in the first name, the organisation and the invite link', () => {
    const words = fill(DEFAULT_TEMPLATES['invite.lecturers'], { name: 'Siti Aminah binti Yusof', invite: 'https://dobry.app/?ref=ABCD2345' })
    expect(words.lines[0]).toBe('Hello Siti,')
    expect(words.lines).toContain('Your invite link: https://dobry.app/?ref=ABCD2345')
    expect(words.button).toEqual({ label: 'Share your invite link', path: 'https://dobry.app/?ref=ABCD2345' })
    expect(fill(DEFAULT_TEMPLATES['quiet.lecturers'], {}).lines[0]).toBe('Hello,')
  })

  it('keep saved wording and fill gaps from the standard', () => {
    const s = tidySettings({ dailyCap: 9999, templates: { 'quiet.trainers': { on: false, subject: 'Hi' } } })
    expect(s.dailyCap).toBe(500)
    expect(s.templates['quiet.trainers']).toMatchObject({ on: false, subject: 'Hi', heading: DEFAULT_TEMPLATES['quiet.trainers'].heading })
    expect(s.templates['invite.workplace']).toEqual(DEFAULT_TEMPLATES['invite.workplace'])
  })

  it('sign unsubscribe links per organisation', () => {
    expect(unsubscribeToken('s', 'a')).toHaveLength(24)
    expect(unsubscribeToken('s', 'a')).not.toBe(unsubscribeToken('s', 'b'))
  })
})

describe('sources and feedback', () => {
  it('keep a sign-up source tidy', () => {
    expect(tidySource({ source: 'Facebook<script>', campaign: 'UiTM Oct' })).toMatchObject({ source: 'facebookscript', campaign: 'uitm oct' })
    expect(tidySource({})).toMatchObject({ source: 'direct' })
    expect(tidySource(null)).toBeNull()
  })

  it('work out the Net Promoter Score', () => {
    expect(nps([10, 9, 8, 7, 3])).toBe(20)
    expect(nps([])).toBeNull()
  })
})
