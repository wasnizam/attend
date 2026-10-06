# Attend

**Start a session. Share the QR. Attendance is done.**

QR attendance for lecturers, trainers and event organisers. Participants scan with their
phone camera and type their ID and name — no app, no account.

Stack: React + TypeScript + Vite + Tailwind, Firebase Auth + Firestore + Hosting, installable PWA.
There are no Cloud Functions; everything is enforced by `firestore.rules`.

## Run locally (no Firebase project needed)

Uses the Firebase emulators. The Firestore emulator needs Java 11+.

```bash
npm install
npm run emulators      # terminal 1: Auth on :9099, Firestore on :8080
npm run dev:emulator   # terminal 2: app on http://localhost:5173
```

`dev:emulator` also serves on your LAN address. Open the app from that address
(e.g. `http://192.168.1.20:5173`) and a phone on the same Wi-Fi can scan the QR.
Emulator data is wiped when the emulators stop.

## Run against a real Firebase project

1. Create a Firebase project. Enable **Authentication → Email/Password** and **Firestore**.
2. Add a Web app and copy its config into `.env.local` (see `.env.example`).
3. `npx firebase login && npx firebase use --add`
4. `npx firebase deploy --only firestore` (rules + indexes)
5. `npm run dev`

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | yes | Web app config |
| `VITE_FIREBASE_AUTH_DOMAIN` | yes | Web app config |
| `VITE_FIREBASE_PROJECT_ID` | yes | Web app config |
| `VITE_FIREBASE_APP_ID` | yes | Web app config |
| `VITE_PUBLIC_URL` | no | Base URL encoded in the QR. Defaults to the origin the lecturer is on. |
| `VITE_USE_EMULATORS` | no | `true` to use the local emulators. |

## Live deployment

- **Site:** https://attend-psi-blush.vercel.app (Vercel project `attend`, deploys automatically on every push to `main`)
- **Code:** https://github.com/wasnizam/attend
- **Firebase project:** `attend-d2744` (Firestore in `asia-southeast1`, Singapore). Its web config is in
  `.env.production`; those values are public by design, and access is controlled by `firestore.rules`.

To change the app: commit and push to `main`; Vercel rebuilds and publishes it.

To change the security rules or indexes, either paste `firestore.rules` into the Firebase console
(Firestore → Rules → Publish), or use the CLI once:

```bash
npx firebase login
npx firebase deploy --only firestore
```

Pushing to GitHub does **not** update the rules. If a change touches `firestore.rules`, publish
the rules as well, or the live site and its rules will disagree.

## Sample data for the emulator

```bash
node scripts/seed-demo.mjs <uid> <organisationId> "<lecturer name>"
```

Adds a "Data Structures" class with 12 students and eight past sessions to the **local emulator**
so the reports have something to show. It never touches a real project.

## Tests

```bash
npm run test:rules   # security rules, against the Firestore emulator
npm run typecheck
```

## How it works

| Route | Who | What |
| --- | --- | --- |
| `/` | anyone | Landing page |
| `/signup`, `/login` | lecturer / admin | Email + password or Google. `/signup?join=CODE` joins an existing organisation |
| `/app` | lecturer | Today's sessions, each with one obvious next action |
| `/app/new` | lecturer | Create a one-off session, or a weekly class |
| `/app/timetable` | lecturer | Weekly classes. Each appears on Today on its weekdays, ready to start |
| `/app/session/:id` | lecturer | Start → live QR + live list → ended record + export |
| `/app/timetable/:id/students` | lecturer | Class student list: upload Excel (.xlsx), CSV or PDF, or paste; preview, then save |
| `/app/reports` | lecturer | Every class at a glance: classes held, average attendance, students on track / warning due / barring due |
| `/app/reports/subject/:code` | lecturer | Subject report: classes sharing a course code, one row per student with Lecture / Tutorial / Lab attendance side by side |
| `/app/timetable/:id/report` | lecturer | Class report: attendance-by-session chart, warning and barring list with "can still miss", each student's full record, the dates × students attendance sheet, CSV export and print. **Export for university system**: the lecturer's own file format (one row per student or per class, P/A or 1/0 or own codes, date order, separator, extra columns), remembered on the device (`src/lib/uniExport.ts`). **Counting rules** (`src/lib/report.ts`): classes marked as no class (Calendar → Holidays and semester breaks, `cancelRange`) are left out of the semester total; a student's classes before they joined or after they dropped (`class.enrol[studentKey]`, set in the student's row) are not counted, and a dropped student gets no warning; a scan more than `class.lateAfter` minutes after the start is late (off unless set); three absences in a row are flagged; **Download PDF** makes the semester report with the attendance sheet and signature lines. The subject report adds a **Whole course** figure by class hours. **Letters and barring list**: warning and barring letters as one-letter-per-page PDF from an editable template with `{placeholders}`, and a barring list PDF with signature lines (`src/lib/lettersPdf.ts`) |
| `/app/account` | lecturer | Name, password, organisation name (admin), language, log out |
| `/app/calendar` | lecturer | Month calendar of sessions and class meetings (held, running, scheduled, not held). Today also shows a week summary |
| `/app/students` | lecturer | Everyone by class (student lists) and by event (who attended), with search |
| `/app/history` | lecturer | Past sessions |
| `/admin` | admin | Overview, all sessions, all records, users |
| `/session/:token` | participant | Check-in form (separate small bundle, no Auth) |

The first person to sign up creates an organisation and is its admin (and can run sessions
like any lecturer). Colleagues join with the invite link under **Admin → Users**.

### Firestore collections

| Collection | Document ID | Notes |
| --- | --- | --- |
| `organisations` | auto | `name`, `ownerId`, `inviteCode` |
| `invites` | invite code | `organisationId`, `organisationName`. Public `get` only |
| `users` | Auth uid | `name`, `email`, `role` (`lecturer`/`admin`), `status`, `organisationId` |
| `sessions` | auto | `organisationId`, `ownerId`, `name`, `date`, `startTime`, `endTime`, `expected`, `status` (`scheduled`→`active`→`ended`), `token`, `expiresAt`, `presentCount` |
| `classes` | auto | Semester classes: `name`, `slots` (one or more weekly `{day, startTime, endTime}`), `startDate`, `endDate`, `code`, `section`, `venue`, `startTime`, `endTime`, `expected`. Starting a meeting creates session `{classId}_{date}_{HHmm}` |
| `rosters/{classId}/students` | normalised student ID | Class list: `studentId`, `studentName`. Public `get` of one exact ID only |
| `evidence` | `{sessionId}_{studentKey}` | Remarks and the certificate (photo or PDF, stored inline) for an MC or excused absence. Lecturer and admin only |
| `locations` | `{sessionId}_{studentKey}` | Where a phone was at check-in. Readable only by the session's lecturer and their admin |
| `checkins` | `{sessionId}_{n}_{studentKey}` | One "still here" confirmation per student per presence check |
| `sessionLinks` | QR token | Public summary of a live session. The only thing a participant can read |
| `attendance` | `{sessionId}_{studentKey}` | `studentId`, `studentName`, `timestamp`, `status` (`present` / `late` / `excused`), `method` (`qr` / `manual`), plus `organisationId`, `ownerId`, `sessionName`, `date` for filtering |

### One engine, several purposes

An organisation has a `purpose` (`education`, `training`, `events` or `workplace`; missing means education),
chosen at sign-up and changeable by an admin under Account. It decides two things, both in
`src/lib/purpose.ts`:

- **Words.** Interface text is written for education and passed through `t()`; for other purposes
  `applyTerms()` swaps the vocabulary (student → participant / attendee, lecturer → trainer /
  organiser, semester class → course).
- **Features.** `has('recurring' | 'classKind' | 'barring' | 'mc')` hides what a purpose does not
  need: events have no timetable, class reports, class type, 80% rule or MC; training keeps
  repeating courses and MC but not class type or the barring ladder.

**Editions and plans.** Attend is sold as one brand in three editions (`src/lib/editions.ts`):
Lecturers (`/lecturers`, purpose `education`), Trainers (`/trainers`, `training`) and Workplace
(`/workplace`, `workplace`). It is one landing page with a switch; each address opens it on its
own tab with its own words and pricing. Sign-up takes the edition from `?for=` (or the last
landing page visited), so there is no picker, and the security rules refuse any later change of
`purpose`. Events still works for organisations that already have it but is not offered.

**Plans** (`src/lib/plan.ts`, prices in `src/lib/editions.ts`):

| Edition | Free | Pro |
|---|---|---|
| Lecturers | 1 class | RM39 per semester, unlimited classes |
| Trainers | 1 course | RM39 a month or RM390 a year, unlimited courses |
| Workplace | 5 staff | RM49 / RM99 / RM179 a month for 20 / 50 / 100 staff |

Prices are shown in ringgit to visitors whose device is on a Malaysian time zone and in US
dollars to everyone else (`src/lib/currency.ts`); the pricing section has an RM / USD switch.
USD prices are round numbers of their own: $9 per semester, $9 a month or $90 a year, and
$12 / $24 / $45 a month.

An organisation stores `plan` (`early`, `trial`, `free`, `pro`), `trialStarted`, `paidUntil` and
(workplace) `seats`. `activePlan()` works out what applies now: a trial is Pro for 14 days and
then Free; Pro falls back to Free when `paidUntil` passes; nothing is ever deleted. Limits are
checked when a class is created or people are added to a list.

Payment is **not connected yet**: `PAYMENTS_OPEN` is `false`, so every sign-up is `early` (no
limits) and the Upgrade button is disabled. To go live: connect the gateway, have its webhook
(admin rights) write `plan: 'pro'`, `paidUntil` and `seats`, set `PAYMENTS_OPEN = true`, and
remove `'early'` from the organisation create rule. The client can never write these fields.
The limits are enforced in the app only, not yet in the rules.

**Workplace** adds one thing, behind `has('clock')`: clocking out. A second scan of the same QR
writes `clockouts/{sessionId}_{studentKey}` (a manager can also clock someone out, or undo it).
Hours are clock-out minus clock-in; lateness is worked out from the clock-in time (more than
10 minutes after the start) instead of being set by hand; the report gains an Hours column.

The **door screen** (`/app/door`, `src/pages/Kiosk.tsx`) is a full-screen view to leave on a
tablet: anything on today's timetable opens by itself 30 minutes before its start, always with
the rotating QR, and closes when its window lapses. It needs the manager to be signed in on
that device, and the page to stay open (it asks the browser to keep the screen awake).

**First-run setup** (`/app/setup`, `src/pages/Setup.tsx`). A workplace with nothing set up is
sent here from Today. Four steps, each saved as it is completed: company (name, optional
location), people (staff list with departments), working rules (days, hours, grace, shifts or
not), and how people clock in (the door screen; phone-only is shown as not available yet,
because opening a day without a screen needs a server).

**Several offices.** An office (or branch) is a set of working hours with its own name (`venue`),
its own location check and its own staff list. Setup step one lists the offices; the working-hours
form has "Office or branch" and "Where it is". On a door screen with more than one office the
manager picks which office that screen is in (kept on the device), and it opens only that
office's hours.

An admin can **hand an office over** to a branch manager (edit the working hours, "Who manages
this office"): the class's `ownerId` changes, and its staff list and shift plans follow because
the rules now go by who owns the class, not by the `ownerId` stored on each record. Past
sessions stay with whoever ran them. The monthly report has an Office column and filter. In
setup the distance and flag-or-refuse choice is made once for every office; the working-hours
form can still set one office differently.

**What the workplace report and screens take care of.** Each check-in carries a random label kept
on the phone (`device`); two people with the same label in one day are flagged as "Same phone as…".
A clock-out more than the grace before the end is "Left N min early". Scanning again after a
clock-out moves the time to now (accidental clock-out, or coming back). Hours start at the start
time unless `countEarly` is set; an unpaid `breakMin` comes off days over five hours. A staff list
added while a day is already open is attached to that day. Leave is recorded with a kind (annual,
emergency, unpaid, other), kept with the private evidence, and split in the monthly report.

**Registered phones.** A person's first clock-in registers their phone, written in the same batch
as the check-in: `phones/{org}_{staffKey}` (their phone) and `devices/{org}_{label}` (whose phone
it is). Later clock-ins are compared: "Phone belongs to …" or "Not their usual phone" (a cleared
or private browser looks like a new phone). A manager approves a new phone from the day's list.
The organisation's `phoneCheck` setting (Account) is copied onto each day: `flag` allows and marks
it; `block` makes the rules refuse any clock-in that is not from the person's own registered
phone (`phoneOk`). Phones are readable only by members of the organisation.

**Admin, for a workplace.** The Admin overview is by office (expected, came, late, on leave or MC,
absent), the monthly report covers every office for an admin (`subscribeOrgSessions`), and the
Users tab lists the offices with who runs each. A manager who joins through an invite lands on
Today ("no office is yours yet"), not on company setup, which is for admins only.

An admin can open, edit and take back any office (the rules accept the admin as well as the
office's manager on classes, staff lists and shift plans). Phone approvals and resets are
limited to an admin, or the manager whose staff list the person is on (`canManagePhone`; each
phone record keeps that list as `listId`).

**The Working hours page, for a workplace** (`src/components/WorkHours.tsx`) shows one card per
set of hours or shift, grouped by office: the week as day chips, the rules (grace, break,
location, rotation, minimum), and the staff list. Shifts are offered at the bottom of that page
("Do some people work shifts?"), where a company looks for them; with shifts on, the page is
"Shifts", with the Shift plan beside "+ Add shift" and a three-step explanation. The shift form
suggests existing offices and files a shift under the office of the list it shares.

**Early leave with permission, and half days.** On the day's list a manager can allow an early
leave with a reason (`earlyOk`: clinic, personal, work outside, other) and mark a morning or an
afternoon off (`halfDay`). A morning off is never late and an afternoon off never early
(`lateFor`, `earlyFor`); the monthly report keeps allowed early leave and half days apart from
plain early leaving.

**HR reporting.** The monthly report runs for a month or any dates (pay cut-off). Each person
gets an attendance rate (days worked out of days due; MC and leave left out). Work on a rest
day (a weekday the working hours do not run) or a public holiday (a day called off on the
Calendar) is counted apart from normal overtime, for the Employment Act rates (1.5x / 2x / 3x),
and nobody is absent on those days. A "Needs attention" card lists absences, three or more late
or early days, missing clock-outs and wrong shifts. "Day by day" shows the month grid (people
by dates, with letters), and a name opens that person's timesheet, printable with signature
lines. `buildPayroll` returns the `entries` behind both.

**Report period, charts, PDF and builder.** The report runs by Week, Month, Year or picked dates.
Charts (`ReportCharts`): attendance over time (stacked by on time / late / leave or MC / absent;
days for up to two months, months beyond), attendance by group (lowest first) and the five people
late most often. "Customise report" picks the sections, the columns and the grouping; the screen,
the PDF and the Excel file follow it, saved per device (`attend.reportSetup`). "Download PDF" makes a
real PDF file in the browser (`src/lib/reportPdf.ts`: jsPDF + autotable, everything drawn as vector text and shapes, so the
layout does not depend on the screen; loaded only on click). Page 1 is an executive summary: company,
title, period, who prepared it, six headline figures, the trend chart, key findings written from
the numbers, and the group and lateness charts and downloads it straight away: A4
landscape, headline figures, charts, needs attention, the people table, the grid, notes and page
numbers. A timesheet PDF has signature lines.

**The same numbers on every page.** Hours shown anywhere to a manager come from one function,
`countedMinutes` (start-time rule, unpaid break); the staff member's own phone shows plain time
at work. A staff list change updates the open day's list and expected number. Class reports
leave out a day still under way, and while a working day is open the gap is "Not in yet", not
"Absent". A headcount that later additions have passed is not shown (`headcount`), so a page
never says "5 / 4". A workplace has one report, the monthly one.

**Office first, shifts as an extra.** A workplace starts as a plain office: the menu reads
"Working hours", the form opens on Monday to Friday, nine to five, and nothing mentions shifts.
An admin ticks "We work in shifts" on the Account page (`organisations.shifts`, `has('shifts')`)
to get the shift wording, shared staff lists, rotation, minimum staffing and the Shift plan.

**Working patterns.** A shift (a class, for workplaces) carries how it works: `graceMin` (minutes
before a clock-in is late; default 10), `flexible` (never late, only hours), `rotating` (nobody
is counted absent) and `rosterFrom` (use another shift's staff list). These are copied onto the
session when the day is opened. An end time at or before the start means a night shift ending
the next day (`endOf()`). The form has "Mon–Fri / Mon–Sat / Every day" quick fills for office
hours.

**One QR for every open shift.** The door screen gives all open shifts the same rotating code.
With one shift open the QR is the ordinary check-in link; with several it is
`/door?t=TOKEN,TOKEN&c=CODE` (`src/pages/DoorEntry.tsx`), a public page that asks for the staff
ID once and picks the shift: the one they are clocked in to (to clock out), else the one whose
list they are on, else they choose when they are on several.

**Smart shifts (phase 1).** No weekly schedule is entered. For people who rotate, the shift that
keeps the list sets `daysPerWeek`; the monthly report counts a week short of that (after leave
and MC) as absences (`buildPayroll`, pools). At the door, someone on several open shifts is put
on the one whose start is nearest; they are only asked when two start within half an hour of
each other. `minStaff` on a shift raises a "short of people" note on Today, and people who did
not clock out are listed there with one tap to set the shift's end time (a manager may write an
earlier clock-out; staff cannot choose a time). Not built yet: learning rotation patterns and
suggesting next week's schedule.

**Shift plan** (`/app/plan`, `src/pages/Schedule.tsx`, `plans/{listId}_{monday}`). A grid of
people by days for one staff list and one week: each cell is a shift, "Off", or not planned.
A whole week can be filled for a person or a department, and last week copied. A planned week
is checked day by day (absent on the planned day; a clock-in to another shift is counted as
"wrong shift"); the live list of a rotating shift shows who was planned and has not come. A week
without a plan falls back to days per week. Plans are private to the manager and admins, so the
public door page cannot use them: it still goes by the time.

Each person on a workplace list can carry a `department` (picked up from a sheet's Department
column, or typed). The **monthly report** (`/app/reports/monthly`, `src/lib/payroll.ts`) adds up
a month for everyone: days worked, hours, overtime (time after the shift's end), lateness, MC,
leave and absences, grouped by department, with an Excel export. "Excused" reads "On leave" for
workplaces. A public holiday is handled by cancelling that day's shift. The door screen can be
locked with a PIN kept on the device.

Apart from that, the data model and the security rules are the same for every purpose. To add a purpose, add it
to `PURPOSES`, `FEATURES` and `TERMS` in that file and to the allowed values in `firestore.rules`.

### Guarantees enforced by the rules

- **No duplicates.** The attendance document ID is the session plus the normalised student ID,
  and participants may only *create*. A second submission is an update, which is denied.
- **Class lists are enforced.** If a session uses a class list, a check-in is only accepted for an ID
  on that list, and the name is taken from the list, not from the student.
- **Dead QR after the session.** A check-in needs the session's token, `status == active`
  and a server time before `expiresAt` (the scheduled end, or 30 minutes after starting if later).
  The owner can reopen an ended session, but only with a brand-new token: a closed QR stays closed.
- **Rotating QR (optional, per session).** The live screen issues a new code every 45 seconds and a
  check-in must carry the current code or the one before it, so a forwarded link or a photo of the
  QR stops working within 45 to 90 seconds.
- **Online sessions.** A class or session can be In person, Online or Hybrid. Online and hybrid
  ones always use the rotating code: students open the plain link from the meeting chat and type
  the code on the lecturer's shared screen. The meeting link is stored on the session and is never
  exposed to participants.
- **Presence checks.** The lecturer can ask everyone who checked in to confirm they are still
  there (3 minutes). Only a student already on record can confirm, once per check, while it is open.
- **Location check (optional, per session).** The lecturer's position is saved as the class with a
  radius (default 150 m). In "warn only" mode far-away check-ins get a note; in "refuse check-in" mode the
  rules refuse a check-in whose location, written in the same batch, is outside the radius. Distance
  is computed in the rules from latitude/longitude; the built-in `latlng.distance()` is not used.
- **Corrections are the lecturer's.** Only the session's owner or an admin can record someone by
  hand or change a status, and the only field that can change on a record is `status`.
- **Server timestamps only.** Participants cannot choose their check-in time.
- **Tenant isolation.** Every read is scoped to the caller's `organisationId`; lecturers see only
  their own sessions and records, admins see their organisation's.

### Code layout

```
src/lib/         firebase init, types, formatting, CSV
src/data/        all Firestore/Auth reads and writes (no UI)
src/hooks/       auth context, live-listener hooks
src/components/  shared UI, session card, live session view
src/pages/       one file per screen
firestore.rules  access control          tests/rules.test.ts  its tests
```

## Known limitations

- **A student can still check in for a friend** by typing the friend's ID on their own phone.
  The rotating QR stops link and photo sharing, not this. Geofencing and one-phone-one-student
  checks are the next step; `sessionLinks` is where they plug in.
- A presence check proves someone tapped a button on a phone that had the session link; it needs
  no code, so a friend holding the student's ID and the link could confirm for them. Students
  marked by hand are not asked. Missed checks are shown in the list but do not change a status
  or appear in exports or the semester report.
- The location check trusts what the phone reports. Indoor accuracy is often 20–100 m, and a
  fake-GPS app can defeat it. It needs HTTPS (or localhost) for the browser to share location.
- MC evidence is stored inside a database document, not in file storage, so the project stays on
  Firebase's free plan. Photos are shrunk to fit; a PDF must be under about 700 KB.
- The rotating QR only rotates while the lecturer's live screen is open. If it is closed, the
  last code stays valid until the session ends.
- Google sign-in must be enabled in the Firebase console (Authentication → Sign-in method) and
  the hosting domain added to the authorised domains. Email verification is a reminder, not a gate.
- Bahasa Melayu covers the interface; emails sent by Firebase (verification, password reset) use
  the templates set in the Firebase console.
- A single attendance record can be read by anyone who knows both the session's internal ID and
  the student ID. This is what powers the "Already Recorded" screen without student accounts.
- No rate limiting on check-ins. Turn on Firebase App Check before a public launch.
- Admins change roles and disable users; removing someone's login entirely is done in the
  Firebase console. A disabled user is blocked by the rules immediately.
- A weekly class only becomes a session (and shows in History and Admin) on days it is actually started; it runs every week between its semester start and end dates. Mid-semester breaks and public holidays are not modelled, so it still appears in those weeks (just don't start it).
- Class list import: old `.xls` and scanned (image-only) PDFs are not supported; student IDs must contain
  at least one digit; PDF layouts vary, so the preview step is where mistakes get caught.
- Absentee names are worked out from the class list as it is now, so editing the list changes the
  absentees shown for past sessions.
- A one-off session's name and time cannot be edited after creation (delete and recreate; only
  un-started ones can be deleted). Classes can be edited at any time.
- Admin views load at most 1,000 sessions / 5,000 records per date range; history shows a
  lecturer's latest 300 sessions.
- Session dates and times use the lecturer's device time zone.

**Realistic test month (local emulator only).** `node scripts/seed-workplace.mjs <orgId> <ownerUid> <ownerName> <hqClassId> <branchClassId>`
fills two offices (16 + 6 staff) with September 2026 and 1–3 October: Mon–Fri 09:00–18:00 with a
1 h unpaid lunch (Penang also Sat 09:00–13:00), Malaysia Day 16 Sep as a public holiday with two
people working it, a Saturday stock-take, annual / emergency / unpaid leave, MC, half days, allowed
and unallowed early leave, habitual lateness, forgotten clock-outs and four days absent without
leave. A sixth argument (a night shift's ID) adds a week of rotating night shifts on the HQ list.
It uses a fixed random seed, so the same month comes out every time.

**Shifts in the reports.** A staff list with fixed hours and a rotating shift beside it (an office
with a night shift) is checked day by day: a day on any of its shifts accounts for the person, and
the Shift plan's days off and other shifts are respected; only lists where every shift rotates are
measured by the week. Rest days and holidays use the shift's own calendar. The report's Shifts
column shows days on each shift and nights worked (for a night allowance); the Admin overview counts
a list once per date, not once per shift.

**Shift and flexible test data.** `node scripts/seed-shifts.mjs <orgId> <ownerUid> <ownerName>` adds
Kilang Shah Alam (12 people rotating weekly between three 8-hour shifts, with a Shift plan for each
week of September) and Studio KL (flexible hours), and prints what the September report should show.

**Report loading.** The report reads attendance, clock-outs and leave kinds 30 days per query
(`fetchManyAttendance`, `fetchManyClockOuts`, `fetchManyLeaveTypes`, using `sessionId in [...]` with
the organisation and, for a manager, their own records), instead of three queries per day.

**Attend Console (`/console`).** Attend's own back office, separate from the customers' app (own bundle,
sign-in and dark sidebar; `src/console/`). The team lives in `platformOwners/{uid}` with a role: Owner
(everything, including the team), Admin (all but the team), Finance (plans, prices, invoices, payments,
refunds), Support (notes, tasks, tags, trial days, password resets), Viewer (read-only). The first
owner is added in the Firebase console; after that owners invite by email (`platformInvites`) and the
invitee joins on first sign-in with a verified email. Pages: Dashboard (MRR, run rate, received this
month, customers, churn, trial conversion, 12-month revenue, plan mix, renewals, at-risk customers,
my tasks, recent activity), Customers (health score, tags, account manager, filters, export) with a
page per customer (Overview, Subscription with price and billing cycle, Billing with invoices /
payments / refunds, Users with password reset and disable, Activity, Notes & tasks, Audit),
Subscriptions, Billing (numbered invoices with SST and a PDF, mark paid, void), Users (all customers),
Tasks, Announcements (banners in customers' apps by edition and dates, closable), Team & roles, Audit
log (append-only, exportable) and Settings (company on invoices, SST, numbering, how to pay). Each team member has My account
(name, change password with the current one, reset email, sign-in method, sign out); the sign-in
screen has Forgot password. A member may change only their own name on their team entry.

**Prices and discounts.** The price list lives in `platformConfig/pricing` (readable by anyone, written
by owners and admins from Back office → Pricing) and drives the website's pricing section and each
customer's Account page through `usePlans` / `useCatalog` (`src/lib/pricing.ts`); until it is saved, the
prices in `editions.ts` apply. Discount codes (`coupons/{CODE}`): percent or amount, editions, one
invoice / several billing periods / forever, valid dates, max uses, on/off; created by money roles.
A customer can have a standing discount (`organisation.discount`, from a code or by hand, until a
date), which lowers their recurring revenue and is offered on their invoices. Invoices carry a
discount line before SST; using a code (on an invoice or as a standing discount) counts it, in the same
transaction, and a used-up or expired code is refused. Changing the price list does not change what
existing customers pay: their own price is kept on their subscription.

**Before payment opens** (`PAYMENTS_OPEN = false`): the price list is shown on the website with an
"Opens soon" tag on paid plans and a note that you start free. What a new account starts on is set per
edition in Back office → Pricing (`platformConfig/pricing.launch`): the free plan (a workplace gets up to
5 staff, enforced when staff are added) or early access (no limits). Defaults: workplace free,
lecturers and trainers early access. Sign-up reads it, and the rules (`startPlan`) refuse any other
starting plan. Existing customers keep their plan; the team can upgrade one by hand. The
rules enforce every role; invoices, payments, notes and the audit log cannot be edited or deleted.

