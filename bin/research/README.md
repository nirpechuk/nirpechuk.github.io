# Publishing research pages

Open **Publish Research.command** in the website folder, then choose an HTML file.
The shortcut encrypts it, adds it to the research directory, commits, and pushes.
GitHub Pages usually updates in a few minutes. The published address is printed
in the window. Publishing the same filename again updates that page.

The research directory lives at <https://nirpechuk.github.io/research/>. Readers
enter the shared password once per tab; **Lock** clears the tab’s saved password.
The 🧋 password page appears both at the directory and at direct links to individual
pages. Once unlocked, individual reports display their own HTML edge to edge,
without a website header, title bar, or controls. The directory and Lock button
remain available at `/research/`.

## From a headless Linux machine (no checkout)

Requires Node.js 20+ and `curl`. Download and run the installer:

```sh
curl -fsSL https://raw.githubusercontent.com/nirpechuk/nirpechuk.github.io/main/bin/research/install-remote.sh -o /tmp/install-nir-research.sh
sh /tmp/install-nir-research.sh
export PATH="$HOME/.local/bin:$PATH"
```

This installs `nir-research` and the `research-publish` skill for both Codex and
Claude. It does not clone the repository or install npm packages. Run the same
installer again to update them. Agent sessions may need restarting to discover
the new skill.

Configure GitHub authentication with an existing `gh auth login`, or set
`GH_TOKEN` using the machine’s secret manager. A fine-grained token needs access
to this repository with **Contents: read and write**; no workflow-editing
permission is needed. These are the permissions used by GitHub’s
[Git tree](https://docs.github.com/en/rest/git/trees#create-a-tree) and
[reference update](https://docs.github.com/en/rest/git/refs#update-a-reference) APIs.
The research password alone does not grant publishing access.

Save the shared password once on that machine (this prompts without echoing it):

```bash
read -rsp 'Research password: ' research_password; printf '\n'
(umask 077; printf '%s\n' "$research_password" > "$HOME/.config/nir-research/password")
unset research_password
```

Then publish from any working directory:

```sh
nir-research /path/to/report.html --slug experiment-notes --title "Experiment notes" --wait
```

The JSON result contains the URL and commit. `--wait` polls until that exact
version is live, for up to five minutes. Without it, `queued` means committed
but not yet verified online. If waiting times out, check GitHub Actions; the
upload is already committed, so do not upload it again just to wait.

- Add `--dry-run` to validate HTML, password, and remote state without writing.
- Add `--replace` when you intend to update an existing slug.
- Use `nir-research --list` to see the current research pages.
- Override the password file with `--password-file PATH`, or use
  `RESEARCH_PASSWORD` in the environment.

For an agent, ask: “Use the research-publish skill to publish this HTML report
under `/research/experiment-notes/` and return the live URL.” The portable
[skill](research-publish/SKILL.md) includes the publishing workflow and script.

The uploader encrypts locally, reads the latest remote manifest and template,
and changes four research files in a single commit through GitHub’s API.
It preserves unrelated files and directory entries. Concurrent changes cause
an error instead of a forced update. It accepts self-contained HTML up to
10 MiB. Files referenced dynamically by scripts are not bundled automatically.

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
