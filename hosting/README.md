# Hosting pechuk.com and nir.pechuk.com

The family directory, homepage, Fitness, Flats, research publishing, and public media are managed from this repository. Cloudflare hosts the frontend and media; the existing Supabase projects still own application data, authentication, and private fitness photos.

## Everyday commands

Use Node 22.20+ (`.nvmrc`), then `npm ci`. Build/deploy commands automatically use a cached Node 22 runtime when the system Node is older; on this Mac they also find the installed Homebrew Ruby and local gems. Other projects’ runtime defaults are unchanged. Application development dependencies are installed with `npm ci --prefix apps/fitness` and `npm ci --prefix apps/flats`.

| Task                            | Command                                                                     |
| ------------------------------- | --------------------------------------------------------------------------- |
| Deploy everything               | `npm run deploy`                                                            |
| Deploy family directory         | `npm run deploy:family`                                                     |
| Deploy homepage/research viewer | `npm run deploy:site`                                                       |
| Deploy one app                  | `npm run deploy:fitness` / `npm run deploy:flats`                           |
| Publish a report                | `npm run research:publish -- /path/report.html --slug report --wait`        |
| Replace a report                | Same command with `--replace`                                               |
| List reports                    | `npm run research:publish -- --list`                                        |
| Delete a report                 | `npm run research:publish -- --delete report`                               |
| Upload public media             | `npm run media:upload -- /path/video.mp4`                                   |
| Back up encrypted research      | `npm run research:backup -- /private/backup-directory`                      |
| Restore encrypted research      | `node hosting/scripts/research-admin.mjs restore /private/backup-directory` |
| Verify live routes              | `npm run hosting:check`                                                     |
| Run local integration tests     | `npm run hosting:test`                                                      |

A push to `main` automatically deploys the affected components once `CLOUDFLARE_ENABLED=true` is set in GitHub. App changes do not rebuild Jekyll. Deployment selection compares against the last successful production workflow, so a newer push also carries forward changes from cancelled or failed deployments. Build outputs are ignored; there is no need to commit generated app bundles for Cloudflare.

The Finder shortcut `Publish Research.command` still works. On remote machines, install `nir-research` with `bin/research/install-remote.sh`. It needs only Node, the research password, and a publishing token—not a Git checkout or GitHub credential.

## URLs and resources

- `https://pechuk.com`: minimal family directory.
- `https://nir.pechuk.com`: homepage and existing paths, including `/fitness/`, `/flats/`, `/research/`, and `/talks/`.
- `https://reports.pechuk.com`: isolated, authenticated delivery for research HTML and private media. Visitors continue using the existing `nir.pechuk.com/research/...` links.
- `https://media.pechuk.com`: public R2 media, including optimized MP4s and posters.
- Workers: `pechuk-family`, `nir-site`, `nir-fitness`, `nir-flats`. `nir-site-preview` is a bootstrap/checking deployment.
- R2: `nir-research` (private bucket of encrypted objects), `nir-media` (public via its media custom domain).
- Cloudflare account: the account containing `pechuk.com`; identifiers are in the Wrangler configuration.

The preview and production site deliberately share storage and app services. This preview is for checking the initial migration, not for experimental writes against isolated data. Local `npm run hosting:dev` uses local storage and requires building all three outputs first.

## Publishing and encryption

`~/.config/nir-research/publish-token` is a private, random publishing credential (mode 600). The corresponding Worker secret is `PUBLISH_TOKEN`. The deployment scripts supply it through a temporary protected secrets file during local deployment, then remove that file. CI preserves the deployed secret. Never commit or paste token values into chat.

The research password is separate: `RESEARCH_PASSWORD`, `--password-file`, or `~/.config/nir-research/password`. The repository wrapper also accepts the existing ignored `.research-password` file. The admin password remains separate. Fitness/Flats administration scripts read the live encrypted vault and save changes through the same conditional publishing API. The encrypted files retained in `research/` are migration snapshots, not live storage.

The directory and admin vault retain the AES-GCM/PBKDF2 format. Optimized report documents are compressed and encrypted with a random content key, itself wrapped inside the password-encrypted directory. Embedded media is extracted into independently encrypted files; 256 KiB authenticated chunks support streaming and seeking. Reports, assets, and backups remain encrypted in R2. Cloudflare decrypts content while serving an authorized session; this is authenticated server delivery, not browser-only decryption. Uploads go into immutable R2 objects; one conditional state update publishes the entire new revision. A concurrent update fails rather than overwriting another report. Failed staging uploads cannot change the live site. `--wait` checks the exact ciphertext online. Historical objects remain available for recovery and retain their original encryption; deletion or password rotation does not erase historical ciphertext.

`npm run research:rotate -- /private/new-password-file` rotates current reports and updates the encrypted admin vault in one commit. It creates a fresh content key, re-encrypts protected media, and revokes existing report sessions; the old content key cannot decrypt future content. Update saved passwords on all publishing machines afterward. Take an encrypted backup first. Large imports/rotations with more than about 40 reports need Workers Paid because each new report object is checked before the commit. Media is staged through authenticated immutable uploads; the state switch remains small. The state format supports up to 1,000 reports.

Standalone reports support up to 50 MiB of HTML. The current publisher automatically separates embedded image, video, audio, and font data URLs into protected files, and handles the older VIDEO_DATA and clipBlobLink video tables. Private report media stays in the private research bucket; do not upload it to the public media bucket. For public videos, use the public media uploader. Update installed publishers on other machines with `bin/research/install-remote.sh`; its uploader now includes the accompanying `content.mjs` module.

## Media performance

Video uploads use ffmpeg to prepare a browser-compatible H.264/AAC MP4, up to 1080p, with the MP4 index moved to the beginning (`faststart`). If the original is already a smaller compatible encode, it is remuxed instead of enlarged. A small JPEG poster is generated. Uploads use three parallel, bounded multipart streams with retryable parts; files are never buffered in full. The printed result includes the video URL, poster, dimensions, and a `preload="metadata"` embed.

Media names are immutable. The default uses a unique directory; supplying a key is supported, but a different file cannot overwrite an existing key. This makes long CDN caching safe. Keep local originals; the one-time migration also archives original videos under `originals/` in R2. Video files and generated app bundles are ignored by Git. The original media remain on this machine and in Git history; `hosting/legacy-media.json` records their names.

The robot talk prioritizes active videos and warms one likely next clip. It starts with metadata, then allows prebuffering after visible playback has enough buffered video. Other hidden videos do not download. Reduced-motion/data-saving preferences are respected. General video includes accept `priority=true` to preload important clips eagerly. Existing `/talks/.../video/` and `/assets/video/` links are served from R2 with byte-range support for seeking. New links should use `media.pechuk.com` for direct CDN delivery.

The GenPHRI and MeMoREval paper previews are 960×540, 30 fps MP4s made from the original videos. Visible previews play immediately; a 300px look-ahead prepares upcoming previews, and off-screen playback pauses. Reduced-motion/data-saving users see a poster and can explicitly play.

Install ffmpeg once (`brew install ffmpeg` on macOS). No S3 credentials, rclone setup, or extra login is required for normal media uploads.

## Initial provisioning and recovery

1. Authenticate Wrangler (`npx wrangler login`) and enable R2 in the Cloudflare account that contains `pechuk.com`.
2. Install app dependencies and Jekyll dependencies (`bundle install`, Ruby 3.3+). `npm run hosting:setup` creates missing buckets, generates the publishing token, builds all components, and deploys a preview without changing the production domain.
3. Set `RESEARCH_SITE` to the returned preview origin. Run `npm run research:import` once, then `npm run media:migrate`. Import validates encrypted reports and admin access before writing anything, and refuses to overwrite initialized storage.
4. Connect `media.pechuk.com` to `nir-media` through Cloudflare R2 Custom Domains. Create a cache rule matching only `http.host eq "media.pechuk.com"`, with Eligible for cache and the origin Cache-Control respected. Keep `nir-research` private, without a custom domain or public `r2.dev` access.
5. Run `npm run hosting:check` against the preview and verify login, research unlocking, and video playback. Then unset `RESEARCH_SITE` and run `npm run deploy:site` to attach `nir.pechuk.com`.
6. Update the Fitness Supabase Auth Site URL to `https://nir.pechuk.com`, retaining `/fitness/` as its OAuth authorization path. Deploy the origin-compatible `fitness-mcp` function. Test the existing plugin connection and new sign-in flow.
7. Configure GitHub environment `cloudflare-production` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The token needs Workers Scripts edit, Workers R2 Storage edit for bindings, account read, zone read, and Workers Routes edit for the target account/zone. Enable repository variable `CLOUDFLARE_ENABLED=true` after the initial deployment succeeds.
8. Publish old-site redirect pages only after the new domain is verified. Update the remote publisher installation on each machine. Browser storage is origin-specific, so unlock Fitness once on the new domain. Flats reconnects existing rooms automatically on the first visit, using a brief trip through the old origin. A one-time ECDH/AES-GCM handoff keeps room keys encrypted; only public keys and ciphertext enter URL fragments, which are removed immediately. The private key stays in the initiating browser session, expires after five minutes, and is deleted after success. Existing residents are validated through the same backend. Manual recovery remains under **Already moved in?** if a browser blocks storage. The databases and photo permissions do not move.

`_config.yml` and `_config.cloudflare.yml` use the new canonical origin. GitHub Pages builds only redirect pages from `hosting/redirect-paths.json`, with a catch-all redirect for older deep links. `work/`, hosting source, credentials, app source, and build outputs are excluded from the public Jekyll output. Static builds also exclude research payloads, generated app folders, and videos.

Do not use the legacy Git publisher after cutover: it writes a separate copy. `npm run research:legacy` and `--backend github` exist only for pre-migration fallback. Worker code rollback does not roll back R2 state; restore an encrypted research snapshot separately when needed.

## Family directory

Edit `hosting/family/public/index.html` to add a family member’s name and live subdomain, then push to `main` or run `npm run deploy:family`. Changes confined to this directory deploy only the family page. It is a tiny static HTML page with no JavaScript or external fonts. Mail continues to use the existing Zoho DNS records. Only Nir currently has a website subdomain; media is infrastructure and is not listed.

Copy this prompt to another family member’s agent, replacing `<name>`:

```text
Migrate my website to <name>.pechuk.com on Cloudflare Workers, with R2 for public media. Follow https://developers.cloudflare.com/agent-setup/prompt.md. Set up GitHub auto-deploys, one-command media uploads, fast video playback, and redirects from my old site. Keep my Workers, buckets, and credentials separate from other family members’. Complete and verify the migration, add my link to the family directory at pechuk.com (coordinate access to its repository), and leave a short guide. Ask only for missing access or required approvals.
```

## Page views

The new Nir domain retains the original `nirpechuk.github.io` counter namespace and normalized paths, preserving existing lifetime totals and daily history, including restored reports. Flats records only after automatic room recovery completes, so its temporary migration redirect does not add another view. Each document records one view; repeated unlocks and counter displays do not add extra hits. History/listing requests only read counters. Preview domains, the family landing page, and 404 pages do not increment Nir’s counters. GitHub redirect pages do not track, so following an old link records only the destination visit.

Daily and lifetime unique counts use browser-local markers, without sending a visitor identifier. Because browser storage is scoped to an origin, an existing visitor’s first visit on the new domain may count as a new unique visitor. Counts remain dependent on the existing CountAPI service and can be blocked by browser privacy tools. `npm run analytics:test` checks these behaviors; the live migration check confirmed a page visit incremented total and daily views once while leaving that browser’s unique counts unchanged.

## Fast protected research (November 20, 2026)

All 24 existing reports were converted without changing their links or view-counter IDs. Their combined HTML fell from 465 MB to 2.04 MB; 932 embedded media files now load separately. The prepared encrypted document envelopes total about 657 KB. Native video byte ranges permit playback and seeking without loading the whole report. Visible autoplay previews are prioritized, off-screen playback pauses, and images use native lazy loading. Original report controls remain intact.

On the same browser, saved research/admin passwords can transfer automatically from the old GitHub domain through `research/migrate.html`. The temporary ECDH/AES-GCM handoff puts only public keys and encrypted packets in URL fragments, never passwords. Its private key stays in the initiating browser session, expires after five minutes, and is removed after use. The browser returns to the originally requested report. Missing/blocked old storage falls back to the normal password field.

The first protected report unlock derives the directory key locally and proves access to the reports service; the password itself is not sent to Cloudflare. The service issues a 30-day encrypted, Secure, HttpOnly, SameSite=Strict cookie scoped only to `reports.pechuk.com`. Subsequent reports open without repeating PBKDF2 or downloading encrypted document bundles into the parent page. The separate content origin prevents report scripts from accessing the main site's saved research/admin credentials. The admin console and its encrypted vault still unlock in the browser and do not share their password with the content service.

HTML and media require a valid session, including conditional/cache-validation requests. Browser caches must revalidate private media; no plaintext is placed in the public media CDN. Lock clears the content cookie and saved credentials, closes other open viewer tabs via a storage event, and prevents an automatic reimport of the old passwords. Existing downloaded content cannot be revoked retroactively. Password rotation changes the content key and session epoch.

The additional Worker secret is `RESEARCH_SESSION_SECRET`; it is already configured in production and preserved by CI. A protected local recovery copy is stored at `~/.config/nir-research/session-secret`, outside Git. Rotating this secret invalidates all content sessions without changing the research password. The public preview host does not establish production report sessions; verify protected delivery through the production domains or local integration tests.

The one-time conversion backup is `~/.config/nir-research/backups/streaming-2026-11-20/before`. `prepared.json` records the new revision and aggregate conversion statistics; `staged/` contains the new encrypted objects and assets. `hosting/scripts/research-optimize.mjs prepare DIRECTORY [EXISTING_ENCRYPTED_BACKUP]` stages a conversion, and `commit DIRECTORY` performs its conditional state switch. Do not rerun this during ordinary onboarding. Normal publishing, backups, restoration, and password rotation understand the new format.
