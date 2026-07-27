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

## Private Academy videos with Cloudflare R2

Recorded live sessions can use the `cloudflare_r2` provider. The video file is
uploaded directly from the browser to a private R2 bucket using a 15-minute
presigned PUT URL. Playback uses a three-hour presigned GET URL after YVIMO
authentication and Academy rank authorization.

Server-only environment variables:

```bash
CLOUDFLARE_ACCOUNT_ID=
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_BUCKET_NAME=yvimo-course-videos
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=

# Optional; defaults to 2 GiB.
R2_MAX_VIDEO_BYTES=2147483648
```

Never prefix the R2 variables with `VITE_`. The Vite browser bundle must not
receive them. Vercel must be redeployed after adding or changing these values.

Apply this migration manually in the Supabase SQL editor:

```text
supabase/sql/079_add_cloudflare_r2_academy_recordings.sql
```

The R2 bucket must remain private. Configure this CORS policy in Cloudflare:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://yvimo.com",
      "https://www.yvimo.com"
    ],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": [
      "ETag",
      "Content-Length",
      "Content-Range",
      "Accept-Ranges"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

Add the exact active Vercel production domain and any preview domain used for
upload testing. Prefer explicit preview origins instead of a broad wildcard.

Use browser-compatible MP4 files with H.264 video, AAC audio, and Fast Start.
No transcoding is performed. Expired unclaimed uploads are represented in
`academy_recording_uploads`; canceled uploads are deleted immediately when
possible. A scheduled cleanup for expired rows remains recommended as a
defense-in-depth maintenance task.
