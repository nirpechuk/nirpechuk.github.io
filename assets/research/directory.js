// Research directory: unlocks the encrypted report list with the research password,
// remembered the same way report pages remember it, and opens a report session in
// the background so the first report opens without another unlock.
import { migrateSavedUnlock, stopPasswordMigration } from "./migration.js";
import { hasReportSession, createReportSession, clearReportSession } from "./session.js";

const get = (id) => document.getElementById(id);
const passwordKey = "research-password";
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const savedPassword = () => {
  for (const storage of ["sessionStorage", "localStorage"]) {
    try {
      const password = window[storage].getItem(passwordKey);
      if (password) return password;
    } catch {
      /* Try the other storage if this one is unavailable. */
    }
  }
  return null;
};
const remember = (password, key = passwordKey) => {
  for (const storage of ["sessionStorage", "localStorage"]) {
    try {
      password ? window[storage].setItem(key, password) : window[storage].removeItem(key);
    } catch {
      /* Unlock still works without storage. */
    }
  }
};

const bytes = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
async function decrypt(envelope, password) {
  if (envelope.version !== 1 || envelope.iterations !== 250000) throw new Error("load");
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: bytes(envelope.salt), iterations: envelope.iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  try {
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(envelope.iv) }, key, bytes(envelope.data))));
  } catch {
    throw new Error("password");
  }
}

// Dates are calendar days, so read them at noon UTC to avoid time-zone shifts.
const day = (iso) => new Date(`${iso}T12:00:00Z`);
const monthDay = (date) => `${date.getUTCMonth() + 1}/${String(date.getUTCDate()).padStart(2, "0")}`;
// A report covers the week before it: the Monday of the week containing the previous day.
function weekOf(date) {
  const covered = new Date(date.getTime() - 86400000);
  return new Date(covered.getTime() - ((covered.getUTCDay() + 6) % 7) * 86400000);
}
const reportDate = (page) => page.date || page.updated;

function card(page, children, progress) {
  const item = document.createElement("li");
  const link = document.createElement("a");
  link.className = "card";
  link.href = `/research/${encodeURIComponent(page.slug)}/`;
  const when = document.createElement("div");
  when.className = "when";
  const date = day(reportDate(page));
  const label = document.createElement("b");
  label.textContent = `${weekdays[date.getUTCDay()]} ${monthDay(date)}`;
  const detail = document.createElement("span");
  detail.textContent = progress ? `Week of ${monthDay(weekOf(date))}` : String(date.getUTCFullYear());
  when.append(label, detail);
  const what = document.createElement("div");
  const title = document.createElement("div");
  title.className = "t";
  title.textContent = page.title;
  what.append(title);
  if (page.topics?.length) {
    const chips = document.createElement("div");
    chips.className = "chips";
    for (const topic of page.topics) {
      const chip = document.createElement("span");
      chip.textContent = topic;
      chips.append(chip);
    }
    what.append(chips);
  }
  link.append(when, what);
  item.append(link);
  for (const child of children) {
    const extra = document.createElement("a");
    extra.className = "extra";
    extra.href = `/research/${encodeURIComponent(child.slug)}/`;
    extra.textContent = `${child.title} →`;
    item.append(extra);
  }
  return item;
}

function render(pages) {
  const slugs = new Set(pages.map((page) => page.slug));
  const newestFirst = [...pages].sort((a, b) => reportDate(b).localeCompare(reportDate(a)) || a.title.localeCompare(b.title));
  const attached = (page) => page.parent && page.parent !== page.slug && slugs.has(page.parent);
  const listed = newestFirst.filter((page) => !attached(page));
  for (const [id, progress] of [
    ["progress", true],
    ["other", false],
  ]) {
    const section = listed.filter((page) => (page.section === "progress") === progress);
    get(id).replaceChildren(
      ...section.map((page) =>
        card(
          page,
          newestFirst.filter((child) => attached(child) && child.parent === page.slug),
          progress
        )
      )
    );
    get(id).hidden = get(`${id}-title`).hidden = !section.length;
  }
  const dates = pages.map(reportDate).sort();
  get("summary").textContent = pages.length
    ? `${pages.length} reports · ${monthDay(day(dates[0]))} – ${monthDay(day(dates.at(-1)))} · newest first`
    : "No reports yet.";
}

function showGate(message = "") {
  get("directory").hidden = true;
  get("gate").hidden = false;
  get("error").textContent = message;
  get("password").focus();
}

async function unlock(password, saved = false) {
  const submit = get("unlock-form").querySelector("button");
  submit.disabled = true;
  get("error").textContent = "Unlocking…";
  try {
    const response = await fetch("/research/manifest.json", { cache: "no-store" });
    if (!response.ok) throw new Error("load");
    const index = await decrypt(await response.json(), password);
    if (index.kind !== "index" || !Array.isArray(index.pages)) throw new Error("load");
    remember(password);
    render(index.pages);
    get("password").value = "";
    get("gate").hidden = true;
    get("directory").hidden = false;
    void hasReportSession()
      .then((open) => open || createReportSession(password))
      .catch(() => {
        // Report pages unlock themselves with the saved password if this fails.
      });
  } catch (error) {
    if (error.message === "password") remember(null);
    showGate(
      error.message === "password"
        ? saved
          ? "Your saved password no longer works. Enter the current one."
          : "That password didn’t work. Try again."
        : "Research couldn’t be loaded. Please reload and try again."
    );
  } finally {
    submit.disabled = false;
  }
}

function lock(notify = true) {
  stopPasswordMigration();
  void clearReportSession();
  remember(null, "admin-password");
  remember(null, passwordKey);
  get("progress").replaceChildren();
  get("other").replaceChildren();
  showGate();
  if (notify)
    try {
      localStorage.setItem("research:locked-at", String(Date.now()));
    } catch {}
}

get("unlock-form").addEventListener("submit", (event) => {
  event.preventDefault();
  unlock(get("password").value);
});
get("lock").addEventListener("click", () => lock());
window.addEventListener("storage", (event) => {
  if (event.key === "research:locked-at") lock(false);
});

async function start() {
  // Saved passwords from the old domain arrive through this page; it may navigate away.
  if (!(await migrateSavedUnlock(passwordKey))) return;
  const password = savedPassword();
  if (password) await unlock(password, true);
  else showGate();
}
void start().catch(() => showGate());
