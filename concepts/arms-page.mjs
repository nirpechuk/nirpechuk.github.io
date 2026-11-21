// Concept: arms, on the homepage itself. The real page is fetched and shown as
// it is; its name, its paragraphs, its photograph and its links are the loose
// pieces, and two robot arms in the bottom corners put back whatever the
// pointer knocks off.

import { loadPage } from "./livepage.mjs";
import { letters, startTidy } from "./tidy.mjs";

await loadPage();

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const title = document.querySelector(".post-title");
if (!still && title) {
  const elements = [...letters(title)];
  for (const el of document.querySelectorAll(
    ".post-header .desc, .post article .clearfix > p, .post .profile figure, .post .profile .more-info, .post .profile-links a"
  )) {
    el.classList.add("piece");
    elements.push(el);
  }
  // Folded up against the edges of the window, out of the way of the text.
  window.tidy = await startTidy({ canvas: document.getElementById("arms"), elements, rest: { x: -0.09, y: 0.07 } });
}
