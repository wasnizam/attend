/**
 * What search engines and link previews are told about each public page. Used twice: written
 * into each page's own file when the site is built (vite.config.ts), and set again in the
 * browser when someone moves between pages, so the two never disagree.
 */
export const SITE = 'https://dobry.app'

export const HOME = {
  title: 'Dobry: QR attendance in seconds. No machine, no app',
  description:
    'QR attendance for lecturers, trainers and workplaces. Show a QR on any screen, people scan with their own phone, and the list fills itself. No machine to buy, no app to install. Free to start.',
}

export const PAGES: Record<string, { title: string; description: string }> = {
  lecturers: {
    title: 'QR attendance for lecturers: seconds, and no signing for friends | Dobry',
    description: 'Take attendance for a full lecture hall in seconds. Students scan a QR that changes every 45 seconds, so nobody signs for a friend. Exports to your university portal. Free to start.',
  },
  workplace: {
    title: 'QR clock-in for workplaces: no machine, no app | Dobry',
    description: 'Staff clock in and out with their own phone. No fingerprint machine to buy and no app to install. See who is in, late or on leave, with hours ready for payroll. Free for up to 5 staff.',
  },
  trainers: {
    title: 'QR attendance for trainers, courses and seminars | Dobry',
    description: 'Check participants in at courses, workshops and seminars with a QR. Nothing for them to install, and a clean attendance report for your client. Free to start.',
  },
  privacy: { title: 'Privacy Policy | Dobry', description: 'What Dobry collects, why, who handles it and how to ask about your information. No adverts, and attendance data is never sold.' },
  terms: { title: 'Terms of Service | Dobry', description: 'The agreement between Dobry and the people and organisations that use it, in plain English.' },
}

/** Sets the page's title, description and address in the browser, for a move between pages. */
export function describePage(path: '' | keyof typeof PAGES) {
  const page = path ? PAGES[path] : HOME
  if (!page || typeof document === 'undefined') return
  document.title = page.title
  document.querySelector('meta[name="description"]')?.setAttribute('content', page.description)
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', `${SITE}/${path}`)
}
