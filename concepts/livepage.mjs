// The live homepage, brought into another page.
//
// Brings in the live homepage: its stylesheets, its body, its markup untouched.
// Its own scripts are left out — nothing here needs them — and so is the mail
// link, which does not belong on a page that is handed around.
export async function loadPage() {
  const res = await fetch("/", { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`homepage: ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), "text/html");

  const waits = [];
  for (const node of doc.head.querySelectorAll('link[rel~="stylesheet"], style')) {
    const clone = document.importNode(node, true);
    if (clone.tagName === "LINK") waits.push(new Promise((done) => ((clone.onload = done), (clone.onerror = done))));
    document.head.append(clone);
  }

  for (const el of doc.body.querySelectorAll('script, a[href^="mailto:"]')) el.remove();
  document.body.className = doc.body.className;
  document.body.prepend(...doc.body.children);

  // Theme: the site keeps light and dark in a script of its own.
  const theme = doc.head.querySelector('script[src*="theme.js"]');
  if (theme) {
    await new Promise((done) => {
      const s = document.createElement("script");
      s.src = theme.getAttribute("src");
      s.onload = s.onerror = done;
      document.head.append(s);
    });
    try {
      initTheme(); // a top-level `let` in that script, so it is a global binding, not a window property
    } catch {
      /* no theme script: the stylesheets' own default stands */
    }
  }

  await Promise.all(waits);
  await document.fonts.ready;
  // Pictures change the layout, so wait for the ones that load now. A lazy one
  // further down may not load until it is scrolled to, and nothing waits on a
  // slow one for more than a moment.
  const eager = [...document.images].filter((img) => !img.complete && img.loading !== "lazy");
  await Promise.race([
    Promise.all(eager.map((img) => new Promise((done) => ((img.onload = done), (img.onerror = done))))),
    new Promise((done) => setTimeout(done, 2500)),
  ]);
  // Give the layout a frame to settle; a tab in the background gets no frames, so do not wait for ever.
  await new Promise((done) => {
    requestAnimationFrame(() => requestAnimationFrame(done));
    setTimeout(done, 250);
  });
}
