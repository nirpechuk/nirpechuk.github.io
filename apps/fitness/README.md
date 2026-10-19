# Private fitness notebook

A private React app at `/fitness/`, linked from **frivolities → fitness**. Source lives here; the compiled page in `/fitness` is included in the Jekyll deployment.

## Access

The app decrypts `/research/admin.json` using the same PBKDF2/AES-GCM admin password and `admin-password` browser storage keys as the research console. The encrypted vault contains a separate Supabase login; the admin password never goes to Supabase. Supabase sessions stay in memory. Lock clears both remembered site passwords, removes the journal from view, and signs out. Cross-tab locks are observed.

Supabase RLS checks both the authenticated user ID and the verified email in the non-public `fitness_private.owner` table. Photos live in the private `fitness-photos` bucket. Images are re-encoded to JPEG at a maximum dimension of 1800 px before upload, stripping metadata. HEIC must be exported to JPEG first. The website shell is public; personal records and photos are not bundled or published.

## Features

- Nutrition entries with calories, protein, optional carbs/fat, source labels, notes, recent-meal reuse, corrections, and explicit daily completion.
- Strength sessions with exercises, working weight, and reps per set; duration-based activities; weigh-ins with kg/lb conversion.
- A scientist's notebook overview: body mass, energy intake, protein, macro energy composition, weekly sessions, weekday averages, and an observation ledger. Select 4, 8, or 12 weeks. Averages exclude incomplete food journals. Missing measurements are not replaced with zero.
- Private progress photos, front/side/back/other views, dates/notes, and a comparison slider.
- Immutable-through-client audit records and optimistic revision checks. Archive hides entries but retains history and original private photo files.
- User-defined targets; JSON export of active text/photo metadata and settings (not photo files).
- An explicitly labeled, browser-memory-only development example at `?example=1`. It never seeds the real database and is unavailable in production.

## Develop and build

Use Node 24+ (the desktop's bundled Node runtime is suitable):

```sh
npm ci
npm run dev
npm test
npm run build
```

The build writes `../../fitness/` and adds Jekyll front matter. The dev server exposes only the encrypted admin envelope at `/research/admin.json` for the shared-password flow. It does not expose the password file.

## Backend setup

1. Set the public URL and publishable key in `src/config.json`.
2. Run `supabase/migrations/001_fitness.sql` using the Supabase SQL editor.
3. Set the permitted email with `insert into fitness_private.owner(singleton,email) values(true,'YOUR_EMAIL') on conflict(singleton) do update set email=excluded.email;`.
4. Run `node scripts/prepare-access.mjs YOUR_EMAIL` from this directory (or the equivalent repository-relative path). This preserves other admin-vault fields, creates a separate random backend password, and requests account signup. Confirm the signup email once.
5. Set the Supabase Auth Site URL to the production `/fitness/` URL before signup if email redirects are desired. Routine access uses password sign-in internally, not email links.
6. Run `node scripts/connect-agent.mjs` to create the local agent key. It is encrypted inside the existing admin vault.

Do not put secret/service-role keys, database credentials, tokens, personal entries, or progress photos into public source. Only publishable configuration and encrypted vault contents belong in the static site.

## Conversational logging

The local agent is connected through `scripts/agent.mjs`. From the repository root:

```sh
node apps/fitness/scripts/agent.mjs read 2026-10-01
node apps/fitness/scripts/agent.mjs save < /private/path/entry.json
```

`save` receives JSON through stdin. Generate and preserve one UUID per user-intended entry so network retries do not duplicate records:

```json
{
  "id": "a7e97150-550a-4a56-8d16-cad6c71cb521",
  "day": "2026-10-19",
  "kind": "meal",
  "title": "Chicken bowl",
  "data": { "calories": 700, "protein": 45, "confidence": "estimated", "notes": "User-reported meal; portions estimated." }
}
```

Corrections must first read the current entry, keep its ID/kind, and submit `{ "entry": { ... }, "expected_revision": 1 }`. Repeating the identical saved payload is safe. Existing check-ins must be corrected using their ID; only one active check-in per day is permitted.

Kinds/data:

- `meal`: calories, protein, optional carbs/fat, confidence (`estimated`, `label`, `weighed`), optional notes.
- `workout`: exercises array of `{name,weight,unit,reps:[8,8,7]}`; optional minutes. An activity can use an empty exercises array and minutes.
- `measurement`: weight and unit (`lb` or `kg`).
- `checkin`: complete (boolean).

Remote agents can call POST `/rest/v1/rpc/fitness_agent_read` with `{p_token,p_since}` or `/rest/v1/rpc/fitness_agent_save` with `{p_token,p_entry,p_expected_revision}`. Supply the project's publishable key in the `apikey` header. Keep the agent token in a private secret store and in the request body, never a URL. Read returns at most 2,000 active text entries from the last 366 days, ordered chronologically; default lookback is 30 days. Keys expire after 90 days and can be revoked in Settings. They cannot access photos, change settings, create keys, archive entries, or directly read tables.

A ChatGPT/dot connection is not automatically installed. It requires a supported custom action/connector for these endpoints. The local Codex agent is ready via the CLI.

## Verification

The tests execute the SQL against PostgreSQL via PGlite with mocked Supabase auth/storage schemas. They cover owner/stranger/anonymous access, history protection, invalid input, revisions, private photo policies, idempotent agent logging, and revocation. Date/math tests cover DST boundaries, incomplete journals, unit conversion, and calendar-based smoothing. Production policies are additionally checked through the live Supabase API.
