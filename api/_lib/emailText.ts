/**
 * The emails Dobry sends to a customer, as plain words. No imports: tested on its own, and the
 * same text makes the HTML and the plain-text copy. Dates arrive as YYYY-MM-DD.
 */
export type EmailKind = 'welcome' | 'trialEnding' | 'trialEnded' | 'paymentFailed' | 'paymentReceived' | 'planCancelled' | 'planResumed' | 'planChanged' | 'planEnded' | 'referralReward' | 'test'

export interface EmailText {
  subject: string
  heading: string
  /** Paragraphs, in order. */
  lines: string[]
  /** One button: its words and where it goes (a path on the site). */
  /** `path` is a path on the site, or a full address elsewhere (Stripe's page for an invoice). */
  button?: { label: string; path: string }
}

const EDITION: Record<string, string> = { education: 'Lecturers', training: 'Trainers', workplace: 'Workplace' }

/** What each edition calls its work, and what its plans hold, so every email speaks its customer's language. */
const WORDS: Record<'education' | 'training' | 'workplace', { work: string; colleagues: string; pro: string; free: string; kept: string; stops: string }> = {
  education: {
    work: 'your classes',
    colleagues: 'colleagues',
    pro: 'up to 10 classes, export to your university portal, warning letters, the barring list and PDF reports',
    free: '1 class of up to 60 students, QR attendance and reports on screen',
    kept: 'Your class lists, attendance and reports',
    stops: 'portal export, warning letters and PDF reports',
  },
  training: {
    work: 'your courses',
    colleagues: 'other trainers',
    pro: 'unlimited courses and sessions, with every feature',
    free: '1 course, 5 single sessions a month, certificates and reports',
    kept: 'Your courses, attendance records and certificates',
    stops: 'unlimited courses and sessions',
  },
  workplace: {
    work: 'your team’s attendance',
    colleagues: 'other business owners',
    pro: 'more staff, several offices, shifts, overtime, leave, PDF and Excel reports, and pay with payslips',
    free: 'up to 5 staff clocking in and out, the door screen and reports on screen',
    kept: 'Your staff lists, clock-ins and reports',
    stops: 'overtime, leave, payslips and staff beyond 5',
  },
}
const wordsFor = (purpose?: string) => WORDS[purpose === 'workplace' ? 'workplace' : purpose === 'training' || purpose === 'events' ? 'training' : 'education']

/** "12 October 2026", or nothing when there is no date. */
export const longDate = (iso: string | undefined) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}`
}

export function emailText(kind: EmailKind, who: { name?: string; organisation?: string; purpose?: string }, data: Record<string, string> = {}): EmailText {
  const hello = who.name?.trim() ? `Hello ${who.name.trim().split(/\s+/)[0]},` : 'Hello,'
  const workplace = who.purpose === 'workplace'
  const trainer = who.purpose === 'training' || who.purpose === 'events'
  const w = wordsFor(who.purpose)
  switch (kind) {
    case 'welcome':
      return {
        subject: 'Welcome to Dobry',
        heading: 'Welcome to Dobry',
        lines: [
          hello,
          `Your Dobry ${EDITION[who.purpose ?? 'education'] ?? 'Lecturers'} account is ready.`,
          workplace
            ? 'Next: set your working hours and add your staff, then open the door screen on any tablet or laptop at the entrance. Staff scan the QR with their own phone to clock in and out.'
            : trainer
              ? 'Next: add your course or workshop, then start a session and show the QR. Participants scan it with their own phone, and the list fills itself. For online sessions they type a short code instead.'
              : 'Next: add a class and its student list, then start a session and show the QR. Students scan it with their own phone, and the list fills itself.',
          workplace
            ? 'When the month ends, the same clock-ins give you hours, overtime and lateness for payroll.'
            : trainer
              ? 'When a course ends, one click makes a certificate of attendance for everyone who came.'
              : 'As the semester goes on, Dobry works out the 80% rule for every student, and exports to your university portal.',
          'Tip: add Dobry to your phone’s home screen from the Account page. It opens like an app and keeps you logged in.',
          'Reply to this email if you need a hand. A real person reads it.',
        ],
        button: { label: 'Open Dobry', path: '/app' },
      }
    case 'trialEnding':
      return {
        subject: `Your Dobry Pro trial ends in ${data.days === '1' ? '1 day' : `${data.days} days`}`,
        heading: 'Your Pro trial is nearly over',
        lines: [
          hello,
          `Your free Pro trial for ${who.organisation || 'your account'} ends on ${longDate(data.until)}.`,
          `During the trial you have ${w.pro}.`,
          'To keep everything in Pro, choose a plan before then. It takes a minute, and you can cancel at any time.',
          `If you do nothing, your account moves to the free plan, which keeps ${w.free}. Nothing is deleted: your records stay, ready to view.`,
        ],
        button: { label: 'Choose a plan', path: '/app/account#plan' },
      }
    case 'trialEnded':
      return {
        subject: 'Your Dobry Pro trial has ended',
        heading: 'You are now on the free plan',
        lines: [
          hello,
          `The Pro trial for ${who.organisation || 'your account'} has ended, so the account is on the free plan now: ${w.free}.`,
          `Nothing was deleted. ${w.kept} are all there, ready to view.`,
          `You can move back to Pro at any time from the Account page, or get it free by inviting ${w.colleagues}: every 5 who start using Dobry earn you a month.`,
        ],
        button: { label: 'See the plans', path: '/app/account#plan' },
      }
    case 'paymentFailed':
      return {
        subject: 'We could not take your Dobry payment',
        heading: 'Your payment did not go through',
        lines: [
          hello,
          `We tried to take ${data.amount || 'your payment'} for ${who.organisation || 'your Dobry plan'}, and the card was refused.`,
          data.retry ? `We will try again on ${longDate(data.retry)}. Your plan stays on until then.` : 'Your plan stays on for a few more days while you sort it out.',
          'Most often the card has expired or reached its limit. You can check or change the card in a minute from the Account page.',
          `If it cannot be paid, the account moves to the free plan, and Pro features such as ${w.stops} stop. ${w.kept} stay safe either way.`,
        ],
        button: { label: 'Update your card', path: '/app/account#plan' },
      }
    case 'paymentReceived':
      return {
        subject: `Your Dobry receipt: ${data.amount || 'payment received'}`,
        heading: 'Thank you. Your payment was received',
        lines: [
          hello,
          `We received ${data.amount || 'your payment'} for ${who.organisation || 'your Dobry plan'}${data.number ? ` (invoice ${data.number})` : ''}.`,
          data.until ? `Your plan is paid until ${longDate(data.until)}, and renews by itself. You can cancel at any time from the Account page.` : 'Your plan renews by itself. You can cancel at any time from the Account page.',
          'On your bank statement this payment appears as DOBRY.',
          `Thank you for running ${w.work} on Dobry.`,
        ],
        button: data.invoiceUrl ? { label: 'View your invoice', path: data.invoiceUrl } : { label: 'Open your account', path: '/app/account#plan' },
      }
    case 'planCancelled':
      return {
        subject: 'Your Dobry plan is cancelled',
        heading: 'Your plan is cancelled',
        lines: [
          hello,
          `As you asked, the paid plan for ${who.organisation || 'your account'} is cancelled and will not renew. You will not be charged again.`,
          data.until ? `Everything in your plan stays on until ${longDate(data.until)}. After that the account moves to the free plan.` : 'Everything in your plan stays on until the end of the period you paid for. After that the account moves to the free plan.',
          `Nothing is deleted: your records stay, ready to view. The free plan keeps ${w.free}.`,
          'If something in Dobry made you leave, reply and tell us. A real person reads it.',
          'Changed your mind? You can resume the plan with one click on the Account page, any time before that date.',
          'If you did not ask for this, reply to this email straight away.',
        ],
        button: { label: 'Open your account', path: '/app/account#plan' },
      }
    case 'planResumed':
      return {
        subject: 'Your Dobry plan is resumed',
        heading: 'Your plan is back on',
        lines: [
          hello,
          `The paid plan for ${who.organisation || 'your account'} is resumed. It carries on as before, with nothing lost: ${w.pro}.`,
          data.until ? `It renews by itself on ${longDate(data.until)}. You can cancel at any time from the Account page.` : 'It renews by itself. You can cancel at any time from the Account page.',
          'If you did not ask for this, reply to this email straight away.',
        ],
        button: { label: 'Open your account', path: '/app/account#plan' },
      }
    case 'planChanged':
      return {
        subject: `Your Dobry plan is now ${data.plan || 'changed'}`,
        heading: 'Your plan is changed',
        lines: [
          hello,
          `${who.organisation || 'Your account'} is now on ${data.plan || 'its new plan'}${data.covers ? `, covering ${data.covers}` : ''}.`,
          data.price ? `From now on it costs ${data.price}. The change applies at once, and the difference for the time already paid is worked out on your next bill.` : 'The change applies at once, and the difference for the time already paid is worked out on your next bill.',
          data.until ? `Your next bill is on ${longDate(data.until)}.` : '',
          'If you did not ask for this, reply to this email straight away.',
        ].filter(Boolean),
        button: { label: 'Open your account', path: '/app/account#plan' },
      }
    case 'planEnded':
      return {
        subject: 'Your Dobry plan has ended',
        heading: 'You are now on the free plan',
        lines: [
          hello,
          `The paid plan for ${who.organisation || 'your account'} has ended, so the account is on the free plan now: ${w.free}.`,
          `Nothing was deleted. ${w.kept} are all there, ready to view.`,
          `You can choose a plan again at any time from the Account page, or get Pro free by inviting ${w.colleagues}: every 5 who start using Dobry earn you a month.`,
        ],
        button: { label: 'See the plans', path: '/app/account#plan' },
      }
    case 'referralReward':
      return {
        subject: 'You have earned Dobry Pro',
        heading: 'Pro is yours. Thank you for sharing Dobry',
        lines: [
          hello,
          `${data.friends || 'Several'} of the friends you invited now use Dobry, so ${who.organisation || 'your account'} has Pro free for ${data.months === '1' ? '1 month' : `${data.months || 'some'} months`}.`,
          `That means ${w.pro}.`,
          data.until ? `It runs until ${longDate(data.until)}. There is nothing to pay and nothing to cancel: after that the account goes back to the free plan, with nothing deleted.` : 'There is nothing to pay and nothing to cancel.',
          `Keep inviting ${w.colleagues}: every 5 more who start using Dobry earn you another month, up to a year.`,
        ],
        button: { label: 'Open Dobry', path: '/app/account#invite' },
      }
    case 'test':
      return {
        subject: 'Dobry email test',
        heading: 'Emails are working',
        lines: [hello, 'This is a test from your Dobry Console. If you are reading it, Dobry can send emails to your customers.'],
      }
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The email as HTML (simple, so every mail app shows it properly) and as plain text. */
export function render(text: EmailText, site: string, company: string, unsubscribe?: string): { html: string; text: string } {
  const link = text.button ? (/^https:\/\//.test(text.button.path) ? text.button.path : `${site}${text.button.path}`) : ''
  const html = `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;border:1px solid #e2e8f0">
<tr><td style="background:#16123f;border-radius:14px 14px 0 0;padding:20px 28px;color:#ffc83d;font-size:20px;font-weight:700">Dobry</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${esc(text.heading)}</h1>
${text.lines.map((l) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#334155">${esc(l)}</p>`).join('\n')}
${link ? `<p style="margin:22px 0 6px"><a href="${esc(link)}" style="display:inline-block;background:#ffc83d;color:#16123f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">${esc(text.button!.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b">${esc(company)} · <a href="${esc(site)}" style="color:#64748b">${esc(site.replace(/^https?:\/\//, ''))}</a><br>${unsubscribe ? `You get this because you have a Dobry account. <a href="${esc(unsubscribe)}" style="color:#64748b">Stop these tips</a>; emails about your account and payments still arrive.` : 'You get this because you have a Dobry account. It is about your account, not marketing.'}</td></tr>
</table></td></tr></table></body></html>`
  const plain = [text.heading, '', ...text.lines, ...(link ? ['', `${text.button!.label}: ${link}`] : []), '', `${company} · ${site}`, ...(unsubscribe ? [`Stop these tips: ${unsubscribe}`] : [])].join('\n')
  return { html, text: plain }
}
