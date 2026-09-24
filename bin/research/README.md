# Publishing research pages

Open **Publish Research.command** in the website folder, then choose an HTML file.
The shortcut encrypts it, adds it to the research directory, commits, and pushes.
GitHub Pages usually updates in a few minutes. The published address is printed
in the window. Publishing the same filename again updates that page.

The research directory lives at <https://nirpechuk.github.io/research/>. Readers
enter the shared password once per tab; **Lock** clears the tab’s saved password.
The 🧋 page appears both at the directory and at direct links to individual pages.

## Preparing an HTML page

Use a standalone HTML export, with images, styles, and scripts embedded in the
file. Absolute HTTPS asset URLs also work, but those external assets are public.
Keep the original file outside this repository, or in `.research-source/` (ignored
by Git and excluded from the website). Local asset references are rejected.
Embedded pages run in a sandbox, so scripts can render charts but cannot access
the surrounding website’s storage. Pages needing cookies, same-origin fetches,
or a backend may need adaptation.

## Commands

Run these from the website folder:

```sh
# Choose a file and publish it.
npm run research:publish -- --choose --push

# Choose the address and display title.
npm run research:publish -- /path/to/report.html --slug experiment-notes --title "Experiment notes" --push

# List published pages.
npm run research:publish -- --list

# Remove a page and its directory listing.
npm run research:publish -- --delete experiment-notes --push
```

Omit `--push` to prepare changes for review without committing them. `--push`
requires the main branch and no already staged changes; only the generated
research files are staged. If a push fails, the local commit remains available;
resolve the Git issue and push again.

## Password and protection

The shared password is already configured locally in `.research-password`.
That file is ignored by Git and excluded from the built site. On another machine,
create it with the same password, or provide `RESEARCH_PASSWORD` in the environment.
Do not simply change this file: existing pages still require their original
password. To rotate the password, re-create all encrypted pages from their originals.

HTML and the directory listing are encrypted with AES-GCM and a password-derived
key (PBKDF2-SHA-256, 250,000 iterations). The published site contains encrypted
payloads, not the original HTML or password. This is lightweight shared-password
protection, not account-based access control. URLs and file sizes are public,
and anyone who has the password can save or share the unlocked content. Removing
a page does not erase older encrypted versions from Git history.

## Maintenance

The page shell is `bin/research/page.html`; the browser UI lives in
`assets/research/`. Run `npm run research:test` to check encryption and publishing.
After editing the shell, run `npm run research:publish -- --init` to update the
research directory and re-publish existing pages to update their shells.
