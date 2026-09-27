(() => {
  if (window.NirPageViews) return;

  const hostname = "nirpechuk.github.io";
  const historyStart = "2026-09-27";
  let countRequest;
  const normalize = (pathname) => {
    pathname = new URL(pathname, `https://${hostname}`).pathname.replace(/\/index\.html$/, "/");
    if (!/\.[^/]+$/.test(pathname) && !pathname.endsWith("/")) pathname += "/";
    return pathname;
  };
  async function keyFor(pathname) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalize(pathname)));
    return `${hostname}-page-` + Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  async function request(key, increment, signal) {
    const response = await fetch(`https://countapi.mileshilliard.com/api/v1/${increment ? "hit" : "get"}/${key}`, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
    });
    if (!increment && response.status === 404) return 0;
    if (!response.ok) throw new Error("Counter unavailable");
    const { value } = await response.json();
    const count = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid counter response");
    return count;
  }
  async function unique(key, marker, value) {
    // No fingerprint or visitor identifier leaves this browser. When storage is
    // unavailable, skip uniques instead of misrepresenting every reload as one.
    const record = async () => {
      try {
        if (localStorage.getItem(marker) === value) return;
        localStorage.setItem(marker, value);
      } catch {
        return;
      }
      try {
        await request(key, true);
      } catch {
        try {
          if (localStorage.getItem(marker) === value) localStorage.removeItem(marker);
        } catch {
          /* Storage may have been disabled. */
        }
      }
    };
    // Serialize simultaneous visits in tabs where the Web Locks API is available.
    if (navigator.locks) await navigator.locks.request(marker, record);
    else await record();
  }
  async function record() {
    if (location.hostname !== hostname || normalize(location.pathname) === "/404.html") return null;
    const key = await keyFor(location.pathname);
    const day = new Date().toISOString().slice(0, 10);
    const total = request(key, true).catch(() => null);
    await Promise.allSettled([
      request(`${key}-daily-${day}-views`, true),
      unique(`${key}-daily-${day}-unique`, `${key}-last-day`, day),
      unique(`${key}-unique-v1`, `${key}-seen-v1`, "yes"),
    ]);
    return total;
  }
  function track() {
    // One visit per document; repeated unlocks or footer elements do not double count.
    countRequest ||= record().catch(() => null);
    return countRequest;
  }
  async function show(element, pathname) {
    const count = await (pathname === undefined
      ? track()
      : keyFor(pathname)
          .then((key) => request(key, false))
          .catch(() => null));
    if (count === null) {
      element.hidden = true;
      return null;
    }
    element.textContent = `${count.toLocaleString()} ${count === 1 ? "view" : "views"}`;
    element.title = "Page views since September 24, 2026 · CountAPI";
    element.hidden = false;
    return count;
  }
  async function history(pathname, days, { signal, refresh = false } = {}) {
    const key = await keyFor(pathname);
    const today = new Date().toISOString().slice(0, 10);
    const dates = Array.from({ length: days }, (_, i) => {
      const date = new Date(`${today}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - days + 1 + i);
      return date.toISOString().slice(0, 10);
    }).filter((day) => day >= historyStart);
    const jobs = [
      { key, field: "lifetime" },
      { key: `${key}-unique-v1`, field: "unique" },
    ];
    const rows = dates.map((date) => ({ date, views: null, unique: null }));
    rows.forEach((row) => {
      for (const field of ["views", "unique"]) jobs.push({ key: `${key}-daily-${row.date}-${field}`, row, field });
    });
    const result = { rows, lifetime: null, unique: null, historyStart };
    // Bounded concurrency; cancel stale selections and cache reads briefly so
    // switching between pages doesn't flood the public counter service.
    async function worker() {
      while (jobs.length) {
        signal?.throwIfAborted();
        const job = jobs.shift();
        let cached = history.cache.get(job.key);
        let value = null;
        try {
          if (refresh || !cached || Date.now() - cached.time > 60000) {
            cached = { value: await request(job.key, false, signal), time: Date.now() };
            history.cache.set(job.key, cached);
          }
          value = cached.value;
        } catch {
          signal?.throwIfAborted();
        }
        (job.row || result)[job.field] = value;
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker));
    return result;
  }
  history.cache = new Map();
  window.NirPageViews = { show, track, history, normalize, historyStart };
  document.querySelectorAll("[data-page-views]").forEach((element) => show(element));
})();
