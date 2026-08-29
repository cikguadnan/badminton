# Badminton Training Journal

A mobile-first Firebase web app for badminton players to record training reflections and for coaches to review and comment.

## Features

- Google Sign-In using Firebase Authentication
- Player profile setup (name + class)
- New training reflections with training focus, three reflection prompts, and effort rating
- Player reflection history
- Coach comments attached to individual reflections
- Teacher dashboard with player/reflection counts and recent entries
- Player directory and per-player history
- Search/filter teacher reflection feed
- Firestore Security Rules separating player and teacher access
- GitHub Pages-ready; no build step required

## Files

- `index.html` — app shell
- `styles.css` — responsive design
- `app.js` — application logic
- `firebase-config.js` — paste your Firebase web configuration here
- `firestore.rules` — publish these rules in Firestore
- `.nojekyll` — prevents GitHub Pages/Jekyll processing

## Important

Before testing, complete `firebase-config.js`, enable Google Authentication, create Cloud Firestore, add teacher email documents to the `teachers` collection, publish `firestore.rules`, and add your GitHub Pages hostname to Firebase Authentication > Settings > Authorized domains.

See the deployment instructions provided with this download for the full guided setup.


## Firebase configuration
This package is already configured for Firebase project `studio-7118495100-d9b72`.
