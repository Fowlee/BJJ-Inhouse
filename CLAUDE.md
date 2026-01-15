# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev      # Start Vite dev server with HMR
npm run build    # TypeScript compilation + Vite production build
npm run lint     # ESLint static analysis
npm run preview  # Preview production build locally
```

## Architecture Overview

BJJ tournament scoring app using React 19 + TypeScript + Firebase (Auth + Firestore).

### Tech Stack
- **Frontend:** React 19, React Router v7, Vite
- **Backend:** Firebase Auth for authentication, Firestore for real-time database
- **Styling:** Inline CSS (no framework)

### Key Directories
- `src/pages/` - Route components (LoginPage, Dashboard, MatScoringPage, AdminPanel)
- `src/components/` - Reusable UI (ScoringControls)
- `src/context/` - AuthContext for auth state management
- `src/hooks/` - Custom hooks (useMatchForMat for Firestore queries)
- `src/assets/` - Firebase config
- `src/types.ts` - TypeScript type definitions

### Data Flow
1. Firebase Auth state monitored via `onAuthStateChanged` in AuthContext
2. User role ("admin" or "judge") fetched from Firestore `users/{uid}` collection
3. Real-time match data via Firestore `onSnapshot` listeners
4. Score updates use Firestore `increment()` for atomic operations

### Firestore Collections
- **matches** - Match documents with fighters, scores, mat assignment, status
- **users** - User documents with role (admin/judge)

### Routes
- `/login` - Authentication (login/register)
- `/dashboard` - Mat selection (judges) or AdminPanel (admins)
- `/mat/:matId` - Live match scoring interface

### Role-Based Access
- **Admin:** Full access to AdminPanel for managing matches
- **Judge:** Dashboard with mat selection, then scoring interface for assigned mat
