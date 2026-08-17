# Class Pulse

A lightweight classroom opinion + attendance web app designed for **GitHub Pages + Firebase**.

## What it does

- Temporary 6-character room codes
- Automatic room expiration
- Student QR-code join link
- Anonymous Firebase sign-in for students
- Google sign-in for instructor
- Attendance check-in with:
  - display name
  - optional last 4 digits of student ID
  - timestamp
  - public IP address (optional globally; enabled by default)
  - response count
- Live instructor dashboard
- Live written-response feed
- CSV export for attendance and responses
- No Flask server / VM required

## Important attendance warning

A public IP address is **not reliable proof of physical attendance**. Many students on university Wi-Fi can share one public IP because of NAT, and mobile devices can change IPs. Use IP only as supporting evidence together with check-in time, name/ID suffix, in-class room-code timing, and participation.

The student page displays notice when IP logging is enabled.

## 1. Create Firebase project

Open Firebase Console and create a project.

### Authentication

Enable:

1. **Anonymous** sign-in (for students)
2. **Google** sign-in (for instructor)

Under Authentication > Settings > Authorized domains, add your GitHub Pages hostname:

`YOUR_GITHUB_USERNAME.github.io`

(Localhost is useful while testing.)

### Firestore

Create a Cloud Firestore database.

Copy the contents of `firestore.rules` into Firestore > Rules, then publish.

## 2. Configure the website

This deployment-ready package is already configured for Firebase project `std-manage-45d25`; no manual edit to `firebase-config.js` is required.

A Firebase browser config is not treated as a server secret. Database protection is provided by Firebase Authentication and Firestore Security Rules.

## 3. Authorize your instructor account

The site uses a Firestore allowlist so that signing in with any random Google account does not provide instructor access.

1. Open `instructor.html` once and sign in with your Google account.
2. The page will display your Firebase Authentication UID.
3. In Firestore Console, create:

Collection: `instructors`

Document ID: `YOUR_UID`

Field:

`enabled` = boolean `true`

Refresh the instructor page.

### If the page does not show the UID clearly

Open Firebase Console > Authentication > Users and copy your Google user's UID.

## 4. Deploy to GitHub Pages

Create a GitHub repository and place these files in the repository root.

In GitHub:

Settings > Pages > Build and deployment > Deploy from a branch

Select:

- Branch: `main`
- Folder: `/ (root)`

Your site will be available at approximately:

`https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY/`

Student page:

`.../index.html`

Instructor page:

`.../instructor.html`

## 5. Using it in class

1. Open `instructor.html`
2. Sign in with your authorized Google account
3. Enter a class title
4. Choose room lifetime (15 minutes to 3 hours)
5. Leave Attendance enabled if you want check-in + IP logging
6. Click **Create room**
7. Project the QR code
8. Students scan it and check in
9. Publish prompts during class
10. Watch responses live
11. Export attendance/responses to CSV
12. Close the room when finished

## IP logging implementation

Because GitHub Pages is static hosting, it cannot directly see the student's network IP. When IP logging is enabled, the browser calls:

`https://api.ipify.org?format=json`

and saves the returned public IP in Firestore.

To disable collection entirely, set this in `firebase-config.js`:

```js
export const enableIpLogging = false;
```

You should check your university's privacy/FERPA/IT policy before using IP data for attendance or retaining it for long periods.

## Security notes

- Never put a Firebase service-account key in this repository.
- Never put a private API secret in client-side JavaScript.
- Keep Firestore Security Rules enabled.
- Instructor write/read privileges require a UID in `/instructors`.
- Student response documents are not readable by students under the supplied rules.
- Rooms expire server-side using Firestore `request.time` checks.
- GitHub Pages should be served with HTTPS.
- Consider deleting old attendance/IP data after the course retention period you actually need.

## Files

- `index.html` — student interface
- `student.js` — student join/check-in/response logic
- `instructor.html` — instructor dashboard
- `instructor.js` — room/question/live-data/export logic
- `styles.css` — shared styling
- `firebase-config.js` — Firebase web configuration
- `firestore.rules` — Firestore access rules

## Mobile connection reliability

The student page uses a Firestore real-time listener for room/question updates.
If a mobile browser interrupts the streaming listener, the page automatically
falls back to a 2-second Firestore poll. A transient connection failure is shown
as `SYNCING` rather than incorrectly marking the room `CLOSED`.

## Firebase App Check

This build initializes Firebase App Check with reCAPTCHA v3.

Public site key:
`6Le7DYotAAAAAMOJgmVkf92IGLfztn4V3PIPFNBI`

The reCAPTCHA secret key is intentionally NOT included in the project.

Before enabling Firestore App Check enforcement:
1. Deploy this build.
2. Test instructor sign-in and room creation.
3. Test student QR join, attendance check-in, and response submission.
4. Confirm App Check metrics show verified requests.
5. Only then enable enforcement for Cloud Firestore.
