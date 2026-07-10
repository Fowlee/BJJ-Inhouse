# InHouse BJJ

InHouse BJJ is a role-based competition management system built for FMT Jessheim, a Brazilian Jiu-Jitsu gym. It is designed to run in-house tournaments with live bracket management, mat scoring, and a public spectator view so coaches and competitors can follow the event without needing a separate spreadsheet or manual queueing process.

## What the system does

The app manages the full in-house competition flow:

- create and edit brackets for different age groups, weight classes, belts, and formats
- generate and advance matches in Firestore as the tournament progresses
- run live mat scoring with points, advantages, penalties, and match finishes
- show public bracket and fighter scheduling information for spectators
- estimate queue timing so mats can be run in a more predictable order

The data model is centered around Firestore collections for `users`, `settings`, `brackets`, and `matches`.

## Role-Based Access Model

This is the main feature worth showing off. The app is not a single-user CRUD dashboard; it is split by role and by audience.

- Admin: full tournament control. Admins can open the admin panel, create and edit brackets, manage tournament settings, create standalone matches, delete or regenerate bracket matches, and oversee queues across mats.
- Judge: live mat operator. Judges sign in, land on the dashboard, choose a mat, and use the mat scoring screen to update points, advantages, penalties, timers, and match results.
- Spectator: public read-only view. No login is required. Spectators can browse active brackets, search by fighter name, and see estimated match timing and queue position.

New authenticated users default to the judge role, and the role is read from Firestore after login.

## Stack

- React 19
- TypeScript
- Vite
- Firebase Auth
- Firestore
- React Router

## Why it was built

This was built for FMT Jessheim to support running recurring in-house BJJ competitions with less manual coordination. The goal was to make the tournament flow legible for organizers, fast for mat judges, and transparent for spectators while keeping the system easy to extend for future events.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Connect the app to your Firebase project.

The current client Firebase configuration lives in `src/assets/firebase.ts`. If you are using your own Firebase project, replace those values with your project’s web app config.

3. Start the dev server:

```bash
npm run dev
```

4. Build for production:

```bash
npm run build
```

5. Optional lint check:

```bash
npm run lint
```

## Notes

- The repo excludes build output, local env files, Firebase cache files, and service-account style secrets via `.gitignore`.
- The public spectator route is available at `/spectator`.
- The SPA redirect for static hosting is configured in `public/_redirects`.
