import { describe, expect, it } from 'vitest'
import { emailText, longDate, render } from '../api/_lib/emailText'

describe('emails to customers', () => {
  it('greets by first name, and speaks each edition’s language', () => {
    const lecturer = emailText('welcome', { name: 'Aisha Bello', organisation: 'FSKM', purpose: 'education' })
    expect(lecturer.subject).toBe('Welcome to Dobry')
    expect(lecturer.lines[0]).toBe('Hello Aisha,')
    expect(lecturer.lines.join(' ')).toMatch(/Lecturers account/)
    expect(lecturer.lines.join(' ')).toMatch(/Students scan/)
    const work = emailText('welcome', { name: '  ', purpose: 'workplace' })
    expect(work.lines[0]).toBe('Hello,')
    expect(work.lines.join(' ')).toMatch(/Workplace account/)
    expect(work.lines.join(' ')).toMatch(/clock in and out/)
  })

  it('says when a trial ends, and that nothing is deleted', () => {
    const three = emailText('trialEnding', { name: 'Ali', organisation: 'Sunrise Café' }, { days: '3', until: '2026-10-15' })
    expect(three.subject).toBe('Your Dobry Pro trial ends in 3 days')
    expect(three.lines.join(' ')).toMatch(/Sunrise Café ends on 15 October 2026/)
    expect(three.lines.join(' ')).toMatch(/Nothing is deleted/)
    expect(three.button).toEqual({ label: 'Choose a plan', path: '/app/account#plan' })
    expect(emailText('trialEnding', {}, { days: '1', until: '2026-10-15' }).subject).toBe('Your Dobry Pro trial ends in 1 day')
    expect(emailText('trialEnded', { organisation: 'X' }).lines.join(' ')).toMatch(/Nothing was deleted/)
  })

  it('tells a customer whose card failed how much, when it is tried again, and where to fix it', () => {
    const e = emailText('paymentFailed', { name: 'Ali', organisation: 'MAXU' }, { amount: 'MYR 19.00', retry: '2026-10-18' })
    expect(e.lines.join(' ')).toMatch(/MYR 19\.00 for MAXU/)
    expect(e.lines.join(' ')).toMatch(/try again on 18 October 2026/)
    expect(e.button?.path).toBe('/app/account#plan')
    expect(emailText('paymentFailed', {}, {}).lines.join(' ')).toMatch(/a few more days/)
  })

  it('writes dates in words, and nothing for a bad date', () => {
    expect(longDate('2027-01-05')).toBe('5 January 2027')
    expect(longDate('soon')).toBe('')
    expect(longDate(undefined)).toBe('')
  })

  it('renders as HTML and as plain text, with the button’s full address, and never lets a name inject HTML', () => {
    const { html, text } = render(emailText('trialEnded', { name: '<b>Eve</b>', organisation: 'A & B <script>' }), 'https://dobry.app', 'Dobry')
    expect(html).toContain('href="https://dobry.app/app/account#plan"')
    expect(html).not.toContain('<script>')
    expect(html).toContain('A &amp; B &lt;script&gt;')
    expect(text).toContain('See the plans: https://dobry.app/app/account#plan')
    expect(text).toContain('Hello <b>Eve</b>,')
  })

  it('sends a receipt with the amount, the invoice and Stripe’s own page for it', () => {
    const e = emailText('paymentReceived', { name: 'Ali', organisation: 'MAXU' }, { amount: 'MYR 19.00', number: 'INV-0007', until: '2026-11-12', invoiceUrl: 'https://invoice.stripe.com/i/abc' })
    expect(e.subject).toBe('Your Dobry receipt: MYR 19.00')
    expect(e.lines.join(' ')).toMatch(/MYR 19\.00 for MAXU \(invoice INV-0007\)/)
    expect(e.lines.join(' ')).toMatch(/paid until 12 November 2026/)
    expect(render(e, 'https://dobry.app', 'Dobry').html).toContain('href="https://invoice.stripe.com/i/abc"')
    // With no invoice page, the button goes to the account.
    expect(render(emailText('paymentReceived', {}, {}), 'https://dobry.app', 'Dobry').html).toContain('href="https://dobry.app/app/account#plan"')
  })

  it('confirms a cancellation with the date it stays on until, and how to undo it', () => {
    const e = emailText('planCancelled', { name: 'Ali', organisation: 'DeepQalby HQ' }, { until: '2026-11-12' })
    expect(e.subject).toBe('Your Dobry plan is cancelled')
    expect(e.lines.join(' ')).toMatch(/DeepQalby HQ is cancelled and will not renew/)
    expect(e.lines.join(' ')).toMatch(/stays on until 12 November 2026/)
    expect(e.lines.join(' ')).toMatch(/resume the plan with one click/)
    expect(emailText('planEnded', { organisation: 'X' }).lines.join(' ')).toMatch(/Nothing was deleted/)
  })

  it('confirms a resumed plan and a changed plan, with what it covers and costs', () => {
    const back = emailText('planResumed', { name: 'Ali', organisation: 'MAXU' }, { until: '2026-11-12' })
    expect(back.subject).toBe('Your Dobry plan is resumed')
    expect(back.lines.join(' ')).toMatch(/renews by itself on 12 November 2026/)
    const moved = emailText('planChanged', { name: 'Ali', organisation: 'MAXU' }, { plan: 'Faculty', covers: '5 lecturers', price: 'MYR 75.00 a month', until: '2026-11-12' })
    expect(moved.subject).toBe('Your Dobry plan is now Faculty')
    expect(moved.lines.join(' ')).toMatch(/MAXU is now on Faculty, covering 5 lecturers\./)
    expect(moved.lines.join(' ')).toMatch(/costs MYR 75\.00 a month/)
    expect(moved.lines.join(' ')).toMatch(/next bill is on 12 November 2026/)
    // With nothing known, it still reads properly and has no empty line.
    const bare = emailText('planChanged', {}, {})
    expect(bare.subject).toBe('Your Dobry plan is now changed')
    expect(bare.lines.every((l) => l.length > 0)).toBe(true)
  })
})
