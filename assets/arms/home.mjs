// The front page: a name, and where to go from here. Two xArm7s stand in the
// bottom corners; pass the pointer quickly over the name and its letters fall,
// and the arms pick them up and put them back. The page opens by dropping one
// letter itself, to show as much.
//
// The page is held back (index.html, `waiting`) until the arms are ready, so
// that name and arms come in together; it does not wait long, and with no
// WebGL the page is simply the name and the links.
//
// The arms are never allowed to stand over the name or a link. In a window
// where they would (tidy.mjs works that out, and again whenever the window
// changes) they are not shown at all; and a window like that at the outset is
// sent to the About page instead, this page being the arms. For someone who
// has asked for less motion the arms stand where they are and nothing can be
// knocked off.

import { LOOK } from "./look.mjs";
import { letters, startTidy } from "./tidy.mjs";

const root = document.documentElement;
const canvas = document.getElementById("arms");
const title = document.querySelector("main h1");
const links = [...document.querySelectorAll("main nav a")];
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

try {
  // The letters are measured in the page's own face, so wait for it.
  await Promise.allSettled([
    document.fonts.load('700 48px "Atkinson Hyperlegible"', "Nir Pechuk"),
    document.fonts.load('400 16px "Atkinson Hyperlegible"', "About"),
  ]);
  await document.fonts.ready;

  let elements = [];
  if (!still) {
    // The name comes apart letter by letter; a screen reader still gets it whole.
    title.setAttribute("aria-label", title.textContent.trim());
    elements = letters(title);
    for (const glyph of elements) glyph.setAttribute("aria-hidden", "true");
  }
  const tidy = await startTidy({ canvas, elements, hover: elements, clear: [title, ...links], look: LOOK, still });
  if (tidy.away() && root.classList.contains("waiting")) {
    // No room for the arms in this window, and nothing shown yet.
    location.replace("/about/");
  } else {
    tidy.rig.render(); // drawn once, shaders and all, before anything is shown
    document.body.classList.add("ready");
    root.classList.remove("waiting");
    performance.mark("arms-ready");
    // Nothing on the page says the name comes apart, so it shows it: a moment
    // after it appears, the first letter slips a pin, hangs askew from its
    // top left corner (out over the margin, clear of the rest), and drops, and
    // an arm puts it back. Unless the visitor has got there first.
    setTimeout(() => {
      const { pieces } = tidy;
      if (pieces.length && pieces.every((p) => p.state === "home")) tidy.slip(pieces[0], -1);
    }, 1000);
  }
  // For looking into it from the console: add ?debug to the address.
  if (new URLSearchParams(location.search).has("debug")) window.tidy = tidy;
} catch (error) {
  // No arms, then; the page does not need them.
  canvas.remove();
  root.classList.remove("waiting");
  console.warn("The arms could not start:", error);
}
