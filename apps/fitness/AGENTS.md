# Fitness journal work and logging

Use the existing app and Supabase project. Never commit plaintext credentials, health data, photos, or logs of auth responses. Public config contains only the URL and publishable key. Secrets are in the encrypted admin vault; its password is in the ignored repository-root `.admin-password`.

For user-requested fitness logging, use `node apps/fitness/scripts/agent.mjs` from the repository root. Read the relevant recent entries first for repeated meals or corrections. Read README.md for the payload shapes. Supply JSON through stdin or a private temporary file, never interpolated shell text. Preserve a UUID across retries. Correct an existing entry with its ID and expected revision.

Use America/New_York for relative dates. Preserve the user's units. Distinguish estimated nutrition, nutrition-label data, and weighed portions. Never invent an unreported meal, workout, weight, photo, or completion state. A meal photo does not yield exact portion sizes; label estimates and keep assumptions in notes. Only mark a day complete when the user says they are done logging it. Ask a short follow-up when ambiguity would substantially change the entry.

After a successful save, return a concise receipt with the date, saved item, relevant totals, and any estimates. Do not claim a save succeeded until the backend returned the entry. Never log demonstration or testing data into the user's real journal. Agent keys expire and are revocable; report an invalid/expired key rather than creating a replacement without authorization.
