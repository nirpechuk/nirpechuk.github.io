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

The local Codex agent uses this CLI. Cloud ChatGPT/dot access uses the private Fitness plugin below.

## Cloud Fitness plugin

The portable package lives in `plugin/`. Its MCP server is hosted by the `fitness-mcp` Supabase Edge Function, at:

`https://esgexdlmpvwqpvinmmpm.supabase.co/functions/v1/fitness-mcp/mcp`

The plugin exposes `read_fitness_entries`, `log_fitness_entry` (including revision-checked corrections), and `log_fitness_photo`. It has no model/API bill of its own and requires no always-on personal computer. Normal Supabase usage limits still apply.

Deployment:

1. Apply `supabase/migrations/002_fitness_plugin.sql` after the original migration.
2. Deploy all files in `supabase/functions/fitness-mcp/`, entrypoint `index.ts`, import map `deno.json`, and gateway `verify_jwt=false`. The handler independently authenticates through PostgREST plus `fitness_plugin_access`; only OAuth discovery is public. Built-in `SUPABASE_URL` and `SUPABASE_ANON_KEY` are sufficient. No service-role key is used.
3. Set Supabase Auth Site URL to `https://nirpechuk.github.io`, enable OAuth Server, set Authorization Path to `/fitness/`, and enable dynamic client registration. The project uses ES256 signing. Publish the updated viewer containing the consent screen.
4. In ChatGPT Plugins, add a custom MCP server with the endpoint above and OAuth authentication. Complete the fitness-page sign-in with the existing admin password, inspect the requesting client, and explicitly connect the journal. Keep the plugin personal/private.
5. Start a chat with Fitness selected. The package's skill is optional guidance; equivalent logging invariants are also in the server's tool descriptions and initialization instructions.

OAuth authorization creates a revocable client allowlist entry for the verified journal owner. OAuth JWTs cannot use the website's direct table, gallery-reading, history, settings, or key-management permissions. The two text-entry RPCs require both that owner and an allowlisted client. Database validation, stable IDs, revision checks, and audit triggers are shared with the local agent. Disconnecting under website Settings removes access immediately, even before an existing OAuth access token expires; the UI also revokes the OAuth grant.

The consent page intentionally displays the client name, return URL, account scopes, and journal permissions. New OAuth client registration alone does not grant journal access. No plaintext credentials or personal entries belong in the plugin archive.

Validation includes mock-transport MCP initialization/list/call tests, OAuth metadata and unauthorized responses, schema rejection, and PostgreSQL tests proving OAuth isolation and immediate revocation. Live tests should read only; do not contaminate the real journal with example entries.

Supabase's advisor reports the intentionally callable SECURITY DEFINER RPCs. Each has an explicit verified-owner/agent-key/client check and a fixed empty search path; execution is granted only to the intended roles. See the [Supabase RPC advisory guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Verification

The tests execute the SQL against PostgreSQL via PGlite with mocked Supabase auth/storage schemas. They cover owner/stranger/anonymous access, history protection, invalid input, revisions, private photo policies, idempotent agent logging, and revocation. Date/math tests cover DST boundaries, incomplete journals, unit conversion, and calendar-based smoothing. Production policies are additionally checked through the live Supabase API.

## Private context

The approved Fitness connection loads `fitness_private.context` through the owner/client-checked `fitness_plugin_context` RPC on every authenticated MCP request. Initialization instructions and successful read/save responses include the latest context, revision, and update time. No personal values are included in source files, plugin packages, migrations, or public website assets. Context failure prevents a write with silently missing context. The plugin cannot edit this profile, read existing photos, or change settings. Profile updates are explicit owner-authorized backend changes; advance revision and updated_at when changing it.

Agents should read entries at the start of each logging/advice conversation, distinguish plans from completed sessions, and preserve the difference between user-reported facts, tentative goals, and assistant assessments. Context delivery supplies information; it cannot guarantee every model will follow every preference.

The private context table intentionally has no direct client grants or RLS policies (deny by default). Its security-definer RPC checks the verified owner and approved OAuth client before reading. These intentional restrictions can appear in the [no-policy advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) and [authenticated-function advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable); access and revocation are covered by the security tests.

## Cloud photo uploads

Apply `20261020125949_fitness_photo_uploads.sql`. New consent explicitly enables upload permission through the owner-only `fitness_enable_plugin_photos` RPC; existing connections remain text-only until the owner enables them. Revocation removes pending reservations and blocks further uploads/finalization without deleting saved photos.

`log_fitness_photo` uses ChatGPT's `openai/fileParams` attachment delivery. It accepts JPEG/PNG/WebP up to 10 MiB and 16 million pixels, applies orientation, resizes to a 1600-pixel maximum dimension, and re-encodes JPEG without metadata. HEIC requires JPEG export. Only HTTPS OpenAI attachment hosts are fetched, with bounded redirects, byte limits and timeouts; journal credentials are sent only to the configured Supabase project.

The server uses the caller's OAuth token, never a service-role key. A reservation binds the UUID, owner, approved client, metadata, sanitized-image hash and byte count. Storage grants INSERT only for that reserved owner path, without upsert, SELECT or DELETE. Finalization checks the stored MIME type and byte size before creating an audited photo entry. Identical retries return the original record; changed payloads cannot overwrite it. Gallery reads and photo changes remain website-only. Local tests use synthetic images and mocked storage; never seed test photos into the production journal.
