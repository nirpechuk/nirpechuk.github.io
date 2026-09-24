(() => {
  if (window.NirPageViews) return;

  const hostname = "nirpechuk.github.io";
  let countRequest;

  async function fetchCount(pathname, increment) {
    // Preview builds must not inflate production counts.
    if (location.hostname !== hostname) return null;
    // Query strings and fragments never create a separate page counter.
    pathname = pathname.replace(/\/index\.html$/, "/");
    if (!/\.[^/]+$/.test(pathname) && !pathname.endsWith("/")) pathname += "/";
    // Send an opaque identifier, not a research slug, page title, or contents.
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pathname));
    const key = "page-" + Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const response = await fetch(`https://countapi.mileshilliard.com/api/v1/${increment ? "hit" : "get"}/${hostname}-${key}`, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!increment && response.status === 404) return 0;
    if (!response.ok) throw new Error("Counter unavailable");
    const { value } = await response.json();
    const count = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid counter response");
    return count;
  }

  function track() {
    // One increment per document, even if research is unlocked more than once.
    countRequest ||= fetchCount(location.pathname, true).catch(() => null);
    return countRequest;
  }

  async function show(element, pathname) {
    // Directory listings read existing totals without registering a page visit.
    const count = await (pathname === undefined ? track() : fetchCount(pathname, false).catch(() => null));
    if (count === null) {
      element.hidden = true;
      return null;
    }
    element.textContent = `${count.toLocaleString()} ${count === 1 ? "view" : "views"}`;
    element.title = "Page views since September 24, 2026 · CountAPI";
    element.hidden = false;
    return count;
  }

  window.NirPageViews = { show, track };
  document.querySelectorAll("[data-page-views]").forEach((element) => show(element));
})();
