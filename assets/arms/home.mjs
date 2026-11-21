// The front page: a name, and where to go from here. Two xArm7s stand in the
// bottom corners; pass the pointer quickly over the name and its letters fall,
// and the arms pick them up and put them back.
//
// Everything on the page is ordinary text and links before this runs, and stays
// so if it cannot: with no WebGL the page is simply the page. The arms are also
// never allowed to stand over the name or a link. In a window where they would
// (tidy.mjs works that out, and again whenever the window changes) they are
// not there at all. For someone who has asked for less motion the arms stand
// where they are and nothing can be knocked off.

const canvas = document.getElementById("arms");
const title = document.querySelector("main h1");
const links = [...document.querySelectorAll("main nav a")];
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
// A window as small as a phone's has no room for the arms, so there they are
// not even fetched; they are if it grows.
const roomy = matchMedia("(min-width: 480px) and (min-height: 400px)");

async function start() {
  try {
    // Ask for everything now, rather than as each file finds out about the next.
    for (const name of ["./tidy.mjs", "./rig.mjs", "./look.mjs", "three", "matter-js"]) {
      const link = document.createElement("link");
      link.rel = "modulepreload";
      link.href = import.meta.resolve(name);
      document.head.append(link);
    }
    const [{ LOOK }, { letters, startTidy }] = await Promise.all([import("./look.mjs"), import("./tidy.mjs")]);
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
    document.body.classList.add("ready");
    // For looking into it from the console: add ?debug to the address.
    if (new URLSearchParams(location.search).has("debug")) window.tidy = tidy;
  } catch (error) {
    // No arms, then; the page does not need them.
    canvas.remove();
    console.warn("The arms could not start:", error);
  }
}

if (roomy.matches) start();
else roomy.addEventListener("change", start, { once: true });
