import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
const source = await readFile(new URL("../../assets/js/page-views.js", import.meta.url), "utf8");
function fixture({ storage = new Map(), hostname = "nirpechuk.github.io", pathname = "/projects/", fetcher, day = "2026-10-01" } = {}) {
  const calls = [];
  const context = {
    window: {},
    location: { hostname, pathname },
    crypto: webcrypto,
    TextEncoder,
    URL,
    AbortSignal,
    document: { querySelectorAll: () => [] },
    navigator: {},
    Date: class extends Date {
      constructor(...args) {
        super(...(args.length ? args : [`${day}T12:00:00Z`]));
      }
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (fetcher) return fetcher(url, options);
      return { ok: true, status: 200, json: async () => ({ value: "12" }) };
    },
  };
  vm.runInNewContext(source, context);
  return { api: context.window.NirPageViews, calls, context, storage };
}
test("one view per document, daily and lifetime uniques deduplicate across reloads", async () => {
  const first = fixture();
  assert.equal(await first.api.track(), 12);
  await first.api.track();
  assert.equal(first.calls.length, 4);
  const second = fixture({ storage: first.storage });
  await second.api.track();
  assert.equal(second.calls.length, 2);
  assert.ok(second.calls.every(({ url }) => !url.includes("unique")));
  const tomorrow = fixture({ storage: first.storage, day: "2026-10-02" });
  await tomorrow.api.track();
  assert.equal(tomorrow.calls.length, 3);
  assert.equal(tomorrow.calls.filter(({ url }) => url.endsWith("daily-2026-10-02-unique")).length, 1);
  const anotherPage = fixture({ storage: first.storage, pathname: "/cv/" });
  await anotherPage.api.track();
  assert.equal(anotherPage.calls.length, 4);
});
test("normalizes URL variants and retains existing lifetime counter keys", async () => {
  const a = fixture({ pathname: "/projects/index.html" });
  const b = fixture({ pathname: "/projects" });
  await Promise.all([a.api.track(), b.api.track()]);
  assert.equal(a.calls[0].url, b.calls[0].url);
  assert.equal(a.api.normalize("/projects/?foo=bar#section"), "/projects/");
  const hash = Buffer.from(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode("/projects/"))).toString("hex");
  assert.equal(a.calls[0].url, `https://countapi.mileshilliard.com/api/v1/hit/nirpechuk.github.io-page-${hash}`);
});
test("previews and 404s never record; blocked storage still counts views", async () => {
  for (const options of [{ hostname: "localhost" }, { pathname: "/404.html" }]) {
    const { api, calls } = fixture(options);
    assert.equal(await api.track(), null);
    assert.equal(calls.length, 0);
  }
  const { api, calls, context } = fixture();
  context.localStorage.getItem = () => {
    throw new Error("blocked");
  };
  await api.track();
  assert.equal(calls.length, 2);
});
test("history and listing reads never hit; pre-tracking dates are excluded; missing is not zero", async () => {
  const { api, calls } = fixture({
    fetcher: async (url) => {
      if (url.includes("daily-2026-09-28-views")) return { ok: false, status: 503 };
      return { ok: false, status: 404 };
    },
  });
  const data = await api.history("/projects/", 30);
  assert.equal(data.rows.length, 5);
  assert.equal(data.rows[0].date, "2026-09-27");
  assert.equal(data.rows[0].views, 0);
  assert.equal(data.rows[1].views, null);
  await api.show({}, "/projects/");
  assert.ok(calls.every(({ url }) => url.includes("/get/")));
  assert.ok(calls.every(({ options }) => options.credentials === "omit" && options.referrerPolicy === "no-referrer"));
});
test("failed unique increments can be retried on the next visit", async () => {
  const first = fixture({
    fetcher: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(await first.api.track(), null);
  assert.equal(first.storage.size, 0);
  const second = fixture({ storage: first.storage });
  await second.api.track();
  assert.equal(second.calls.length, 4);
});
test("history caches reads, refresh bypasses cache, and cancellation stops work", async () => {
  const { api, calls } = fixture();
  await api.history("/", 7);
  const initial = calls.length;
  await api.history("/", 7);
  assert.equal(calls.length, initial);
  await api.history("/", 7, { refresh: true });
  assert.equal(calls.length, initial * 2);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(api.history("/", 7, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls.length, initial * 2);
});
test("invalid service values stay unavailable", async () => {
  const { api } = fixture({ fetcher: async () => ({ ok: true, status: 200, json: async () => ({ value: -1 }) }) });
  const data = await api.history("/", 7);
  assert.equal(data.lifetime, null);
  assert.ok(data.rows.every((row) => row.views === null && row.unique === null));
});
