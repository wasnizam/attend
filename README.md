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
| `/app/timetable/:id/report` | lecturer | Class report: attendance-by-session chart, warning and barring list with "can still miss", each student's full record, the dates × students attendance sheet, CSV export and print |
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
