// Concept: arms, the minimal one. A name, a line and three links; two robot
// arms at the bottom corners that put the name and the line back together
// whenever the pointer knocks them apart. The links stay where they are.

import { LOOK } from "./look.mjs";
import { letters, startTidy } from "./tidy.mjs";
import { tune } from "./tune.mjs";

// The page is set in Atkinson Hyperlegible; the letters are measured in it.
await Promise.allSettled([
  document.fonts.load('700 48px "Atkinson Hyperlegible"', "Nir Pechuk"),
  document.fonts.load('400 16px "Atkinson Hyperlegible"', "Computer Science"),
]);
await document.fonts.ready;
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!still) {
  // The name comes apart letter by letter; the line under it falls in one piece.
  const elements = [...letters(document.querySelector("main h1")), document.querySelector("main p")];
  window.tidy = await startTidy({ canvas: document.getElementById("c"), elements, hover: elements, look: LOOK });
  window.look = tune(window.tidy);
}
