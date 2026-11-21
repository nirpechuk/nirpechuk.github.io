// Concept: arms, the minimal one. A name, a line and three links; two robot
// arms at the bottom corners that put back whatever the pointer knocks off.

import { letters, startTidy } from "./tidy.mjs";
import { tune } from "./tune.mjs";

await document.fonts.ready;
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!still) {
  letters(document.querySelector("main h1"));
  window.tidy = await startTidy({ canvas: document.getElementById("c"), elements: [...document.querySelectorAll(".piece")] });
  window.look = tune(window.tidy.rig);
}
