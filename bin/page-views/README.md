# Page traffic and the boba admin console

Open `/research/` (the header’s 🧋 shortcut) and unlock it to explore page traffic
and open research reports. Search for a page, choose the last 7, 30, or 90 days,
and compare total views with daily unique viewers. The daily table and CSV
export contain the same values as the graph. Refresh reloads the counters.
The console only reads counters; inspecting reports’ traffic does not visit them.

## What the numbers mean

- **Lifetime views:** the original counters, unchanged, starting September 24, 2026. One increment per document load; repeated unlocking does not count twice.
- **Daily total views:** document loads grouped by UTC date, starting September
  27, 2026. Earlier daily history cannot be reconstructed from lifetime totals.
- **Daily unique viewers:** browsers visiting a page at least once that UTC day.
  Local storage records each page’s most recent visit day; no visitor identifier
  is sent to the service. The summary shows the average daily uniques, not a
  misleading sum presented as unique people across the selected period.
- **Unique browsers since September 27:** each browser counts once per page
  while it retains its local storage. This total is separate from the date range.

A person using another device/browser or clearing storage can count again.
Browsers without writable local storage contribute views but no unique counts.
Web Locks serialize unique recording across concurrent tabs where available.
Bots, blockers, storage restrictions, and service failures make counts approximate.
Daily views, daily uniques, and lifetime totals are independent requests; an
interrupted visit can partially record. Failed unique requests clear the local
marker so the next visit can retry. An ambiguous network failure can overcount.

Public pages track via their footer. Research reports track only after successful
unlocking, and retain their full viewport. The admin console itself does not
record visits. Query strings, fragments, `/index.html`, and trailing-slash variants
share a counter. Local previews and the 404 page never increment production keys.

## Storage and availability

The existing [CountAPI service](https://countapi.mileshilliard.com/) stores these
counters, with no account or secret key. Legacy keys are unchanged:
`nirpechuk.github.io-page-SHA256(normalized_path)`. Daily keys append
`-daily-YYYY-MM-DD-views` or `-daily-YYYY-MM-DD-unique`; unique-browser totals append
`-unique-v1`. Requests send no page title, report content, password, visitor ID,
query parameters, or referrer, and omit credentials. The provider receives
normal network metadata. Hashed paths obscure names but do not provide access control.

All service counters are public and can be changed by someone who knows a key.
The password protects the research content and directory, not the counters.
Missing keys (HTTP 404) mean zero recorded visits; failed or invalid responses
are shown as unavailable, never zero. The explorer limits concurrent reads to
four, cancels stale selections, and caches successful reads for one minute.

## Maintenance

- `assets/js/page-views.js`: tracking and read-only history API.
- `assets/research/admin.js`: explorer, graph, table, CSV, lock cleanup.
- `_plugins/analytics-pages.rb`: builds the public page catalog from rendered
  pages containing the footer counter. Private report titles come only from the
  decrypted manifest and are never put in the public catalog.
- `bin/research/page.html`: shared page shell; refresh existing shells after edits.

Run `npm run analytics:test` and `npm run research:test`. Browser tests should
mock CountAPI so they never alter production counts.
