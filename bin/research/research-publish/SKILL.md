---
name: research-publish
description: Publish standalone HTML research reports to Nir Pechuk's encrypted research site at nir.pechuk.com/research from local or headless machines without a Git checkout.
---

Use bundled `scripts/upload.mjs` for user-requested publication. Requires Node.js 20+ and network access to the site.

## Credentials

Read the publishing token from `RESEARCH_PUBLISH_TOKEN` or `~/.config/nir-research/publish-token` and the research password from `RESEARCH_PASSWORD`, `~/.config/nir-research/password`, or `--password-file PATH`. Credential files must be private (mode 600). If missing, ask the user to configure them locally; never request secrets in chat or print them.

## Publish

1. Prepare a self-contained HTML export up to 50 MiB. Embed small assets or use absolute HTTPS URLs for public assets. Do not move private videos/images into public storage. Reports run in a sandboxed iframe.
2. Choose a lowercase hyphenated slug. URLs are public, so avoid sensitive information in slugs. Use `--list` to inspect existing entries.
3. Validate without publishing:
   `node /path/to/this/skill/scripts/upload.mjs /path/report.html --slug experiment-notes --dry-run`
4. When the user requested publication:
   `node /path/to/this/skill/scripts/upload.mjs /path/report.html --slug experiment-notes --title "Experiment notes" --wait`
   Add `--replace` only when the user intends to update that slug. `nir-research` is the installed shortcut.
   A report folder (its `index.html` plus media, nested pages, scripts, or JSON referenced by relative path) is published by passing the folder instead of an HTML file. Each file must be at most 80 MiB; the dry run reports the file count and unresolved references.
   Directory listing details: `--date YYYY-MM-DD` (report date), `--section progress` for weekly progress reports, `--topic "..."` once per chip, `--parent SLUG` to list it under another report. Change them later with `--set SLUG` plus those flags.
5. Return the URL and the verified status. `live` means the exact uploaded ciphertext was observed. `published` means the state commit succeeded but live verification was not requested.

Encryption happens locally. Immutable R2 uploads are followed by one conditional state update; no Git commit or website build is required. A stale revision fails without overwriting other work. Inspect the latest directory before retrying a conflict once; do not add `--replace` unless replacement was intended. An ambiguous completion requires inspecting the live result, not blindly re-uploading. Deletion uses `--delete SLUG` only when explicitly requested; old encrypted versions remain for recovery.

`RESEARCH_SITE` overrides the origin for an explicitly selected preview/local environment. The legacy `--backend github` option is only for pre-migration fallback and must not be used after cutover.

The current Cloudflare publisher automatically packages embedded media as encrypted private assets and compressed report documents. Keep `scripts/content.mjs` beside `scripts/upload.mjs` when copying or installing this skill. Do not publish private report media to the public media bucket. Existing report links stay under `nir.pechuk.com/research/`; authenticated content delivery uses the isolated `reports.pechuk.com` origin. Read the repository's `hosting/README.md` for migration and recovery details.
