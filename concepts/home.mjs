// The homepage: a name, and where to go from here. Two xArm7s stand in the
// bottom corners; pass the pointer quickly over the name and its letters fall,
// and the arms pick them up and put them back.
//
// Everything on the page is ordinary text and links before this runs, and stays
// so if it cannot: with no WebGL, or in a window too small for the arms, the
// page is simply the page. For someone who has asked for less motion the arms
// stand where they are and nothing can be knocked off.

import { LOOK } from "./look.mjs";
import { letters, startTidy } from "./tidy.mjs";

const canvas = document.getElementById("arms");
const title = document.querySelector("main h1");
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
  await startTidy({ canvas, elements, hover: elements, look: LOOK, still, shy: true });
  document.body.classList.add("ready");
} catch (error) {
  // No arms, then; the page does not need them.
  canvas.remove();
  console.warn("The arms could not start:", error);
}
