# YVIMO Web

Main public website and first authenticated platform frontend for YVIMO.

## Focus

- YVIMO as a company brand.
- Industrial Automation as one business line.
- Software Services as a business line.
- YVIMO products, starting with YVIMO Gateway.
- Platform foundation for accounts, Gateway Online Access, licensing, YVIMO Academy, orders, and quotation management.

## Stack

- Vite
- React
- TypeScript
- Supabase Auth and PostgreSQL-backed profiles
- Vercel deployment

## Environment

The frontend uses Vite environment variables:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Local values live in `.env.local`, which is ignored by git. Vercel must define the same variables in project settings.

Security rule: never use or commit the Supabase secret key in this Vite client. The frontend only uses the publishable key.

## Supabase

Supabase project:

- Organization: YVIMO Engineering
- Project: yvimo-platform
- Region: East US / North Virginia

Current frontend integration:

- `src/lib/supabaseClient.ts` creates the Supabase client from Vite environment variables.
- Sign up uses `supabase.auth.signUp()`.
- Sign in uses `supabase.auth.signInWithPassword()`.
- Sign out uses `supabase.auth.signOut()`.
- Session restore uses `supabase.auth.getSession()`.
- Auth changes are tracked with `supabase.auth.onAuthStateChange()`.
- LocalStorage is no longer the source of truth for authentication.

Profiles:

- The app expects a `public.profiles` table linked to `auth.users`.
- Dashboard user name and subscription tier come from Supabase profile data.
- Subscription tiers are `Explorer`, `Professional`, `Enterprise`, `Founder`, and `Instructor`.
- If profile fetch is slow or fails, the UI falls back to the Supabase auth user so login does not hang.

SQL setup:

- `supabase/sql/001_create_profiles.sql`
- Creates `public.profiles`.
- Enables Row Level Security.
- Adds policies for users to select, insert, and update only their own profile.
- Adds trigger for automatic profile creation when a new auth user is created.
- Adds `updated_at` trigger.

Do not apply SQL automatically from the frontend. Review and run it manually in the Supabase SQL Editor.

## Auth Screens

Implemented screens:

- `/login`
- `/signup`
- `/dashboard`

Login:

- Email/password sign in.
- Apple OAuth/passkey entry point through Supabase provider `apple`.
- Error messages render as visible alert boxes with entry animation.
- Successful auth shows a short message, then a dashboard loading page, then redirects.

Signup:

- Creates Supabase Auth users.
- Sends `full_name`, `company_name`, and `role` metadata.
- Uses a light-themed signup card to contrast with the dark login card.
- Shows clear messages for confirmation-required or error states.

Dashboard:

- Protected by Supabase session.
- Uses compressed header.
- Header shows authenticated user card instead of login button.
- User card shows profile initials, full name, and subscription pill.
- Sidebar is dark gray and prioritizes:
  - Workspace
  - Gateway Online
  - Academy
- Gateway Online and Academy are visually highlighted as core app functions.

Dashboard loading page:

- Dark gray loading page.
- Centered YVIMO square logo.
- Pulsing logo animation.
- Blurred orange particles in the background.
- Orange glowing progress bar with white border.

## Vercel

The app is prepared for Vercel deployment with:

```bash
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

No Supabase secret key should be configured for the client-side Vite app.

## Commands

```bash
npm install
npm run dev
npm run build
```
