// Switcher between the concept pages.
const PAGES = [
  ["flow.html", "Name · flow"],
  ["floor.html", "Name · floor"],
  ["shatter.html", "Name · shatter"],
  ["flow.html?of=photo", "Photo · flow"],
  ["floor.html?of=photo", "Photo · floor"],
  ["shatter.html?of=photo", "Photo · shatter"],
  ["dissolve.html", "Photo · dissolve"],
  ["desk.html", "Desk · pixel"],
];
// The host may serve a page with or without its .html, so compare without it.
const bare = (href) => href.replace(".html", "");
const nav = document.querySelector(".switch");
const here = bare(location.pathname.split("/").pop() + location.search);
for (const [href, label] of PAGES) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = label;
  if (bare(href) === here) a.setAttribute("aria-current", "page");
  nav.append(a);
}
