# Badminton Journal V2 — Update Notes

## What changed
- New dark green badminton-themed UI for desktop and mobile.
- Every training session now has a check-in status.
- Players can record **Attended** or **Absent**.
- Attended check-in is saved together with the training reflection.
- Absence flow asks for a reason and optional details.
- New player Attendance page with full check-in history.
- New coach Attendance dashboard by training date.
- Coach can see Attended, Absent, and Not Checked In players.
- Existing reflection, player profile and coach feedback features remain.

## IMPORTANT: Firebase Rules Update
This version adds a new Firestore collection called `attendance`.

Before using V2:
1. Open Firebase Console.
2. Go to Firestore Database > Rules.
3. Replace the current rules with the contents of `firestore.rules` in this folder.
4. Click **Publish**.

You do not need to manually create the `attendance` collection. The app will create attendance documents automatically when students check in.

## GitHub Update
Replace the files in your existing GitHub repository with the V2 files in this folder, then commit the changes. GitHub Pages will redeploy automatically.

Your existing Firebase configuration, users, teachers, reflections and comments are preserved.
