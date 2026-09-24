# Page view counters

Each public page’s footer shows a small count. Research pages are counted only
after successful unlocking, with a 24 px bottom strip that leaves the report
unobstructed. Existing research pages automatically use this behavior; uploads
do not need to be regenerated.

Counts started on September 24, 2026; earlier traffic cannot be recovered from
this counter. These are approximate page views, not unique people. Each document
load makes one increment request; locking and unlocking the same research page
again does not increment it twice. Query strings, fragments, `/index.html`, and
trailing-slash variants share the same count. Local previews and the 404 page
are not counted.

The counter uses [CountAPI’s public API](https://countapi.mileshilliard.com/).
The key is `nirpechuk.github.io-page-` followed by the SHA-256 hash of the
normalized path. It sends no page title, report contents,
password, query parameters, or referrer. Fetch requests omit credentials and do
not accept or send service cookies. The provider necessarily receives network
metadata such as IP addresses. Automated visits can also increase counts. Hashed paths obscure names but are not an access-control mechanism.

CountAPI stores the totals outside GitHub Pages. This public, free service has
no account or secret API key to configure; counts are informational and depend
on service availability. A failed or blocked request hides the counter without
interrupting the page. Ad blockers and failed requests can lead to undercounts.

Anyone who knows a key can read or modify its count through the public API.
Do not use these totals for billing or access control.

Implementation: `assets/js/page-views.js`, `_includes/footer.liquid`, and
`assets/research/research.js`. To read a counter without incrementing it, use
`https://countapi.mileshilliard.com/api/v1/get/KEY`.
