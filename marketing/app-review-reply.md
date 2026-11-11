# App Review reply: Guideline 2.1 Information Needed (11 Nov 2026)

Paste everything between the lines into **App Review Information → Notes**.
Replace `[VIDEO LINK]` with the link to your screen recording.
Keep it under 4,000 characters.

---

1. SCREEN RECORDING
Recorded on a physical iPhone running the latest iOS: [VIDEO LINK]
It shows: launching the app, creating an account, signing in, adding a class, starting attendance (rotating QR code), a second phone checking in, the live list, a report exported through the share sheet, and deleting the account (Account → Delete account).

2. PURPOSE AND AUDIENCE
Dobry takes attendance with a QR code. It is for three groups: university and college lecturers (class attendance), trainers and course organisers (course check-in and attendance certificates), and small and medium workplaces (staff clock-in and clock-out).
The problem: paper sign-in sheets are slow and easy to fake, and fingerprint or card machines are expensive. With Dobry the organiser shows a QR code that changes every 45 seconds, and each person scans it with their own phone camera. The list fills itself and the reports are ready at the end (the 80% attendance rule and warning letters for lecturers, certificates for trainers, hours, lateness and overtime for workplaces).
Anyone can sign up for free. It is not built for one specific company or institution.

3. HOW TO USE IT
Sign in with the demo account in Sign-In Information (a lecturer account with a class ready).
- Today tab: open the class and tap Start Attendance. A QR code appears and changes every 45 seconds.
- To check in, use a second device: scan the QR with the Camera app, or open Dobry and tap "Scan QR to check in" on the sign-in screen. The name appears on the first device's live list.
- Reports tab: semester report, students at risk, export to PDF or Excel through the share sheet.
- Account tab: settings and Delete account.
The trainer and workplace modes are chosen when a new account is created (Create account → choose Classes, Training or Workplace). They use the same check-in flow, with different words and reports.
No sample files are needed.

4. EXTERNAL SERVICES
- Google Firebase: Authentication (email, Sign in with Apple, Google Sign-In), Cloud Firestore database, Cloud Storage for evidence files
- Vercel: hosting for the web app and server functions
- Resend: sending emails such as the welcome email
- date-holidays (open-source library, runs inside the app): public holiday calendars
No AI services, no advertising and no tracking. There are no in-app purchases: the iOS app has no paid content and does not offer purchases.

5. REGIONAL DIFFERENCES
The app works the same in every region. The only difference is the public holiday calendar, which follows the country and state the user selects. The interface is available in English, Malay and Czech.

6. REGULATED INDUSTRY
Not applicable. Dobry is not in a regulated industry and contains no protected third-party material. Payslips are summaries of hours: they state clearly that statutory deductions and tax are not calculated by the app.

User content: the only content users add is attendance records and optional evidence files (for example a medical certificate attached to an excuse). These are private, visible only to the person and the organiser of that class or workplace. There is no public feed, chat or sharing between users, so content reporting and blocking do not apply.

---

## Before you resubmit

1. **Record the video on your iPhone** (Settings → Control Center → add Screen Recording; then swipe down and tap the record button). Follow the order in point 1 above. Use a fresh email to show account creation, and delete that account at the end. Use a second phone or the iPad to scan the QR.
2. **Upload the video** to Google Drive (link sharing: Anyone with the link) or YouTube (Unlisted). Put the link where it says `[VIDEO LINK]`.
3. **Check the demo account still works** and its class is ready to start.
4. Paste the text into Notes and press **Save**.
5. In the App Review message, press **Reply to App Review**, write "We have added the requested information and screen recording to the Notes field", attach the video too if it is small enough, and send.
6. Press **Resubmit to App Review**.
