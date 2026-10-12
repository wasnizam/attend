import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/ui'
import { describePage } from '../lib/seo'

/**
 * The Terms of Service and the Privacy Policy. Written in plain English on purpose: they are a
 * promise to customers, and the people reading them are lecturers and shop owners, not lawyers.
 * English only, so there is one text to stand by.
 */
const WHO = { product: 'Dobry', site: 'dobry.app', email: 'hello@dobry.app', country: 'Malaysia', updated: '12 October 2026' }

type Part = [title: string, paragraphs: (string | string[])[]]

const TERMS: Part[] = [
  ['1. Who we are', [
    `${WHO.product} (“we”, “us”) is an attendance service based in ${WHO.country}. These terms are the agreement between us and you, the person or organisation that makes a ${WHO.product} account.`,
    'By making an account or using Dobry, you agree to these terms. If you use Dobry for an organisation, you confirm you are allowed to agree on its behalf.',
  ]],
  ['2. Your account', [
    'You need an account to take attendance. Keep your login to yourself and tell us if you think someone else has used it.',
    'One Lecturers Free or Pro account is for one lecturer. Sharing one login between several people is not allowed; the Faculty plan is for that.',
    'You must be at least 18, or old enough to enter a contract where you live.',
  ]],
  ['3. What Dobry does', [
    'Dobry lets you show a QR code, lets people scan it to record that they were there, and gives you lists and reports of that attendance.',
    'Dobry records what people do with it. It cannot prove on its own that a person was really present, and you remain responsible for decisions you make from its records, such as warnings, barring, pay or discipline.',
  ]],
  ['4. Plans and payment', [
    'Dobry has a free plan and paid plans. What each includes, and its price, is shown on our website and on your Account page.',
    'Paid plans are charged in advance, by the month or the year, through our payment provider Stripe. They renew by themselves until you cancel.',
    'You can cancel at any time from your Account page. Your plan then stays on until the end of the period you have paid for, and is not renewed.',
    'Payments already made are not refunded for a period that has started, except where the law gives you that right. If you were charged by mistake, write to us within 14 days and we will put it right.',
    'We may change prices. We will tell you at least 30 days before a new price applies to you, and you can cancel before it does.',
    'If a plan’s limits are exceeded (for example more lecturers, classes or staff than the plan covers), new sessions may not start until the account fits its plan again. Your records are never deleted for this reason.',
  ]],
  ['5. Your records and your responsibilities', [
    'The attendance records you collect are yours. We keep and process them only to provide Dobry to you, as our Privacy Policy explains.',
    'You are responsible for having the right to collect this information from your students, participants or staff, and for telling them about it as the law where you are requires. This includes the optional location check and phone registration.',
    'You can export your records at any time on a plan that includes export, and you can ask us to delete your account and its records.',
  ]],
  ['6. Fair use', [
    'Please do not:',
    ['use Dobry to break the law or to harm, harass or secretly track anyone;', 'try to get round a plan’s limits, or resell Dobry, without our written agreement;', 'attack, overload, copy or reverse-engineer the service;', 'record false attendance, or help anyone else do so.'],
    'We may pause or close an account that does these things. Where we reasonably can, we will warn you first.',
  ]],
  ['7. Availability and changes', [
    'We work to keep Dobry running and your records safe, but we do not promise it will never be interrupted. Please keep your own copy of anything you cannot afford to lose; exports make that easy.',
    'We improve Dobry all the time, so features may change. We will not remove something you pay for without telling you first.',
  ]],
  ['8. Ending', [
    'You can stop using Dobry at any time. We can end your account if you break these terms or do not pay, and will give you a reasonable chance to export your records first unless the law prevents it.',
  ]],
  ['9. Our responsibility to you', [
    'Dobry is provided as it is. To the extent the law allows, we are not liable for indirect losses, lost profit or lost data, and our total liability to you is limited to what you paid us in the 12 months before the claim.',
    'Nothing in these terms takes away rights the law gives you that cannot be given up.',
  ]],
  ['10. Law', [`These terms are governed by the laws of ${WHO.country}, and its courts settle any dispute, unless the law where you live says otherwise.`]],
  ['11. Changes to these terms', ['If we change these terms in a way that matters, we will tell you in the app or by email before the change applies. Carrying on using Dobry after that means you accept the new terms.']],
  ['12. Contact', [`Questions about these terms: ${WHO.email}.`]],
]

const PRIVACY: Part[] = [
  ['1. In short', [
    'Dobry records attendance. We collect only what that needs, we do not sell it, we do not show adverts, and we do not use it for anything except running Dobry for the organisation that collected it.',
  ]],
  ['2. Who is responsible', [
    `${WHO.product} is based in ${WHO.country}.`,
    'For attendance records, the lecturer, trainer or employer who uses Dobry decides what is collected and why. They are responsible for those records; we look after them on their behalf. If you are a student, participant or staff member with a question about your attendance record, please ask them first.',
    'For account details of the people who log in to Dobry (lecturers, trainers, managers), we are responsible.',
  ]],
  ['3. What we collect', [
    'From people who log in (lecturers, trainers, managers and admins):',
    ['name and email address;', 'the organisation’s name;', 'the classes, lists, sessions and settings they create;', 'a record of payments, if they pay. Card details go straight to Stripe; we never see or store them.'],
    'From people who check in or clock in (students, participants, staff):',
    ['the name and ID they type, or that is on the list their lecturer or employer uploaded;', 'the date and time of the scan, and whether it was by QR or added by hand;', 'a random label for the phone, used to notice one phone checking in for several people. It does not identify the phone’s owner to anyone else;', 'their location at the moment of the scan, only if the organiser has switched the location check on, and only after the phone asks for permission;', 'a document such as a medical certificate, only if the organiser asks for one and it is uploaded.'],
    'People who check in do not need an account, and we do not ask for their email or phone number.',
  ]],
  ['4. What we use it for', [
    ['to record attendance and show it to the organiser who collected it;', 'to make their lists, reports, letters and exports;', 'to run accounts, plans and payments;', 'to send a few emails about the account, such as a welcome, a trial ending or a failed payment;', 'to keep the service safe and working, and to stop misuse.'],
    'We do not use this information for advertising, and we do not sell or rent it to anyone.',
  ]],
  ['5. Who else handles it', [
    'We use a small number of companies to run Dobry. They may only handle the information to provide their service to us:',
    ['Google (Firebase): sign-in and the database. The database is kept in Singapore.', 'Vercel: hosting the website and the app.', 'Stripe: payments.', 'Resend: sending account emails.'],
    'We may also share information if the law requires it.',
  ]],
  ['6. How long we keep it', [
    'Records are kept for as long as the organiser’s account is open, because attendance records are often needed for a whole course or a whole year of work.',
    'When an account is closed, or when the organiser asks, we delete its records within 30 days, except what the law requires us to keep, such as payment records.',
  ]],
  ['7. Your choices', [
    'You can ask to see, correct or delete information about you.',
    ['If you log in to Dobry: change your name on your Account page, or write to us.', 'If you checked in to someone’s class or workplace: ask that organiser, since the record is theirs. If they do not help, write to us and we will pass it on.'],
    'You can refuse the location permission on your phone. The organiser decides whether a check-in without it is accepted.',
  ]],
  ['8. Cookies and your device', [
    'Dobry does not use advertising or tracking cookies. It keeps a few things on your device so it works: that you are logged in, your language, and small preferences. Installing Dobry on your home screen keeps a copy of the app on the device so it opens quickly.',
  ]],
  ['9. Keeping it safe', [
    'Each organisation’s records are kept apart, and access rules decide what each person can see. An attendance time cannot be changed by the person who checked in, and anything added by hand is labelled. All traffic is encrypted.',
    'No service is perfectly safe. If something happens that puts your information at risk, we will tell the organisations affected without delay.',
  ]],
  ['10. Children', ['Dobry is made for universities, training providers and workplaces. It is not meant for children under 13, and should not be used to record them without the consent the law requires.']],
  ['11. Changes', ['If we change this policy in a way that matters, we will say so in the app or by email before the change applies.']],
  ['12. Contact', [`Questions or requests about your information: ${WHO.email}.`]],
]

export function Legal({ doc }: { doc: 'terms' | 'privacy' }) {
  const terms = doc === 'terms'
  const title = terms ? 'Terms of Service' : 'Privacy Policy'
  useEffect(() => {
    describePage(doc)
    window.scrollTo(0, 0)
  }, [title])
  return (
    <div className="min-h-dvh bg-white">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link to="/" aria-label="Dobry home"><Logo /></Link>
          <Link to={terms ? '/privacy' : '/terms'} className="text-sm font-medium text-accent">{terms ? 'Privacy Policy' : 'Terms of Service'} ›</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="font-display text-4xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {WHO.updated}</p>
        <div className="mt-8 space-y-8">
          {(terms ? TERMS : PRIVACY).map(([heading, paragraphs]) => (
            <section key={heading}>
              <h2 className="text-lg font-semibold tracking-tight">{heading}</h2>
              <div className="mt-2 space-y-3 leading-relaxed text-slate-700">
                {paragraphs.map((p, i) =>
                  typeof p === 'string' ? (
                    <p key={i}>{p}</p>
                  ) : (
                    <ul key={i} className="list-disc space-y-1 pl-5">
                      {p.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-muted">
          <span>© {new Date().getFullYear()} {WHO.product}</span>
          <span className="flex gap-4">
            <Link to="/terms" className="hover:text-ink">Terms</Link>
            <Link to="/privacy" className="hover:text-ink">Privacy</Link>
            <Link to="/" className="hover:text-ink">{WHO.site}</Link>
          </span>
        </div>
      </footer>
    </div>
  )
}
