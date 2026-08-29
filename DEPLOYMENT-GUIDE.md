# Badminton Training Journal — Deployment Guide

This app is intentionally built as plain HTML/CSS/JavaScript so it can be hosted directly on GitHub Pages without npm, a build process, or a server. Firebase provides Google Authentication and Cloud Firestore.

## Part A — Create the Firebase project

1. Go to the Firebase Console and choose **Create a project**.
2. Suggested project name: `badminton-training-journal`.
3. Google Analytics is optional for this app.
4. After the project is ready, click the **Web** icon (`</>`) to register a web app.
5. Suggested app nickname: `Badminton Journal Web`.
6. You do not need Firebase Hosting because GitHub Pages will host the frontend.
7. Firebase will show a `firebaseConfig` object. Keep this page open.

## Part B — Add the Firebase configuration

Open `firebase-config.js` and replace every placeholder with the values Firebase gives you.

Example shape:

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};
```

The Firebase web config is not a password. The security boundary is Firebase Authentication + Firestore Security Rules.

## Part C — Turn on Google Sign-In

1. Firebase Console → **Authentication**.
2. Click **Get started** if prompted.
3. Open **Sign-in method**.
4. Choose **Google**.
5. Enable it.
6. Select the project support email when Firebase asks for one.
7. Save.

## Part D — Create Cloud Firestore

1. Firebase Console → **Firestore Database**.
2. Click **Create database**.
3. Choose a Firestore location reasonably close to your users. For Singapore users, choose the most appropriate available Asia region shown by Firebase for your project.
4. If Firebase asks for a starting security mode, you may choose a locked/production-style option. You will replace the rules in the next step.

## Part E — Install the security rules

1. Open the included file `firestore.rules`.
2. Copy the complete contents.
3. Firebase Console → Firestore Database → **Rules**.
4. Replace the existing rules with the contents of `firestore.rules`.
5. Click **Publish**.

Do not leave Firestore in open test mode for actual student use.

## Part F — Pre-authorise teacher accounts

Teacher status is controlled by a special Firestore collection named `teachers`. Students cannot add themselves to this collection through the app.

For each teacher:

1. Firebase Console → Firestore Database → **Data**.
2. Click **Start collection**.
3. Collection ID: `teachers`
4. For the first teacher document, use the teacher's exact Google email address as the **Document ID**. Example: `teacher@school.edu.sg`.
5. Add a Boolean field:
   - Field: `active`
   - Type: Boolean
   - Value: `true`
6. Save.
7. For additional teachers, add another document under the same `teachers` collection, again using the exact Google email address as its document ID and `active: true`.

Important: email matching is exact. Use the same Google account that the teacher will use to sign in.

## Part G — Put the files on GitHub

### Easiest browser-only method

1. Sign in to GitHub.
2. Create a new repository.
3. Suggested repository name: `badminton-journal`.
4. Public is simplest for GitHub Pages on a free GitHub account. The Firebase config can be public; your Firestore rules protect the data.
5. Create the repository.
6. Choose **Add file → Upload files**.
7. Upload the files from the `badminton-journal` folder:
   - `.nojekyll`
   - `index.html`
   - `styles.css`
   - `app.js`
   - `firebase-config.js`
   - `firestore.rules`
   - `README.md`
   - `DEPLOYMENT-GUIDE.md`
8. Commit the files to the `main` branch.

## Part H — Turn on GitHub Pages

1. Open the repository on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Branch: `main`.
5. Folder: `/ (root)`.
6. Save.
7. GitHub will publish the site at an address similar to:
   `https://YOUR-USERNAME.github.io/badminton-journal/`

## Part I — Add the GitHub Pages domain to Firebase Authentication

This is critical for Google Sign-In.

1. Copy the hostname from your GitHub Pages URL. Example:
   `YOUR-USERNAME.github.io`
2. Firebase Console → **Authentication → Settings → Authorized domains**.
3. Click **Add domain**.
4. Add only the hostname, for example:
   `YOUR-USERNAME.github.io`
5. Save.

Do not enter `https://`, a slash, or `/badminton-journal` in the authorised-domain field.

If you later use a custom domain such as `badminton.yourschoolsite.sg`, add that custom hostname here too.

## Part J — First test

### Test a teacher

1. Make sure the teacher's exact Google email already exists as a document ID under the `teachers` collection.
2. Open the GitHub Pages site.
3. Choose **Continue with Google**.
4. Sign in with that teacher account.
5. You should see **Coach Dashboard**.

### Test a student

1. Open the site in a private/incognito window or another browser.
2. Sign in with a Google account that is NOT listed in the `teachers` collection.
3. The student will be asked for name and class the first time.
4. Add a training reflection.
5. Sign out and sign in again. The old reflection should still appear in **Journal**.
6. Return to the teacher account. The new student and reflection should appear on the coach dashboard.
7. Open the reflection and post a coach comment.
8. Sign back in as the student. The coach comment should appear under the reflection.

## Part K — If school Google accounts cannot sign in

A school-managed Google Workspace environment may restrict third-party apps or OAuth access. If a student sees an organisation/admin restriction during Google sign-in, the app code may be working correctly but the school Google Workspace policy may be blocking access.

Useful troubleshooting sequence:

1. Confirm Google is enabled in Firebase Authentication.
2. Confirm the GitHub Pages hostname is in Firebase **Authorized domains**.
3. Test with a normal personal Google account.
4. If the personal account works but the school account does not, check with the school's Google Workspace administrator about the OAuth/app access policy.

## What the app creates automatically

After people start using it, Firestore will contain:

- `teachers` — teacher allowlist you create manually
- `users` — automatically created user profiles
- `reflections` — student training reflections
- `comments` — teacher comments

## Recommended next improvements

After Version 1 is stable, useful additions include attendance, scheduled training sessions, season goals, tournament reflections, announcements, coach-only notes, charts, export to CSV/PDF, and an admin screen for managing the team roster.
