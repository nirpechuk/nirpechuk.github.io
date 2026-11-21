# Publishing research

Research lives at **https://nir.pechuk.com/research/**. Publishing uploads encrypted content directly to R2 and makes it live with one revision-checked update. It does not commit to Git or rebuild the website.

```sh
npm run research:publish -- /path/to/report.html --slug experiment-notes --wait
npm run research:publish -- /path/to/report.html --slug experiment-notes --replace --wait
npm run research:publish -- --list
npm run research:publish -- --delete experiment-notes
npm run research:publish -- /path/to/report-folder --slug weekly-notes --date 2026-11-20 --section progress --topic "Planner" --wait
npm run research:publish -- --set weekly-notes --topic "Planner" --topic "YAM bugs"
```

A folder publishes its `index.html` with the folder's other files at their relative paths (see the hosting guide). `--date`, `--section progress`, `--topic` (repeatable), and `--parent SLUG` control how the report is listed at `/research/`; `--set SLUG` edits them without uploading.

The Finder shortcut `Publish Research.command` opens a file chooser and creates or replaces the report with that filename. `--dry-run` validates without uploading.

Use a self-contained HTML export up to 50 MiB. Embed small images/styles/scripts, or reference public files by absolute HTTPS URLs. Upload public video with `npm run media:upload -- /path/video.mp4` and embed the returned URL and poster with `preload="none"`. Do not put private footage in the public media bucket. Reports run in a sandboxed iframe; cookies and same-origin storage are unavailable inside them.

On remote/headless machines, install `nir-research` using `bin/research/install-remote.sh`. This installs a standalone Node uploader plus the portable research-publish skill for Codex and Claude. The same command works without a Git checkout:

```sh
nir-research /path/report.html --slug experiment-notes --wait
```

Credentials:

- Publishing token: `RESEARCH_PUBLISH_TOKEN` or `~/.config/nir-research/publish-token` (mode 600).
- Research password: `RESEARCH_PASSWORD`, `--password-file PATH`, or `~/.config/nir-research/password` (mode 600). The local repository wrapper also uses `.research-password`.
- The admin password is separate. The encrypted admin vault keeps existing fitness and research access intact.

Never paste passwords/tokens into chat. A research password alone cannot publish. A publishing token alone cannot decrypt reports. Publishing credentials also authorize public media uploads.

`--wait` verifies the exact encrypted payload online. If the response is ambiguous, inspect the live page or list the directory rather than blindly uploading again. Concurrent writes fail without overwriting another publisher. Old encrypted versions remain in R2 for recovery; removing a page does not erase historical ciphertext.

See [the central hosting guide](../../hosting/README.md) for migration, deployments, backups, restoration, password rotation, and account setup. The old GitHub publisher is available only as `npm run research:legacy` or remote `--backend github` during migration; do not use it after cutover.
