// Concept: the homepage itself.
//
// The real page is fetched and shown exactly as it is. Only the name at the top
// is not type any more: it is a few thousand grains. Brush it and they fall —
// and everything else on the page is solid, not as a box around it but as the
// thing itself. The grains heap on the actual letters of the text, on the brim
// of the photograph, on the rules between sections, and the edges of the window
// hold the rest in.

const GRAVITY = 1700; // px/s^2
const CELL = 2; // collision grid, CSS px
const DOT = 1; // spacing of the name's grains: one per pixel, so at rest it is the type
const REACH = 12; // how close a sweep must pass to lift a grain
const BLAST = 90; // click blast radius
const QUIET = 1.4; // seconds of calm before the name puts itself back
const MODES = ["leap", "swirl", "rise"];

const HOME = 0;
const FALL = 1;
const PILE = 2;
const BACK = 3;

// The page ---------------------------------------------------------------

// Bring in the live homepage: its stylesheets, its body, its markup untouched.
// Its own scripts are left out — nothing here needs them — and so is the mail
// link, which does not belong on a page that is handed around.
async function loadPage() {
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
  await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((done) => ((img.onload = done), (img.onerror = done))))));
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
}

await loadPage();

// With no heading to take apart, or for someone who asked for less movement,
// the page is simply the page.
const title = document.querySelector(".post-title") ?? document.querySelector("h1");
const still = matchMedia("(prefers-reduced-motion: reduce)").matches || !title;

// Colour -----------------------------------------------------------------

// A colour the page states any way it likes — a name, a hex, an rgb() — read
// back as three numbers by asking a canvas what it made of it.
const swatch = document.createElement("canvas").getContext("2d");
function parse(css, fallback) {
  swatch.fillStyle = "#000";
  swatch.fillStyle = css?.trim() || "";
  const hex = swatch.fillStyle;
  if (typeof hex === "string" && hex[0] === "#") {
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }
  const n = (hex.match(/[\d.]+/g) ?? []).map(Number);
  return n.length >= 3 ? n.slice(0, 3) : fallback;
}
const style = getComputedStyle(document.documentElement);
const ink = parse(getComputedStyle(title ?? document.body).color, [20, 20, 20]);
const accent = parse(style.getPropertyValue("--global-theme-color"), [235, 77, 41]);
// A short ramp from the page's own ink to its own accent; a grain warms as it
// moves. Each step comes in a few weights, for the coverage a grain was cut at.
const SHADES = 5;
const TONES = 4;
const shade = [];
for (let s = 0; s < SHADES; s++) {
  const u = s / (SHADES - 1);
  const rgb = ink.map((c, i) => Math.round(c + (accent[i] - c) * u)).join(",");
  for (let a = 0; a < TONES; a++) shade.push(`rgba(${rgb},${((a + 1) / TONES).toFixed(3)})`);
}
const bin = new Int32Array(SHADES * TONES);
const order = new Int32Array(SHADES * TONES);
let sorted = new Int32Array(0);

// The room ---------------------------------------------------------------

const canvas = document.getElementById("sand");
const ctx = canvas.getContext("2d");
const off = document.createElement("canvas");
const octx = off.getContext("2d", { willReadFrequently: true });

let W = 0;
let H = 0;
let cols = 0;
let rows = 0;
let solid = new Uint8Array(0); // the page's own shapes
let sand = new Uint8Array(0); // grains that have come to rest

const cellAt = (x, y) => ((y / CELL) | 0) * cols + ((x / CELL) | 0);
// The window is the room: its edges stop a grain, and so does anything drawn on it.
const blocked = (x, y) => {
  if (x < 0 || x >= W || y >= H) return true;
  if (y < 0) return false; // open at the top
  const i = cellAt(x, y);
  return solid[i] === 1 || sand[i] === 1;
};

function sized() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth;
  H = innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cols = Math.ceil(W / CELL);
  rows = Math.ceil(H / CELL);
  solid = new Uint8Array(cols * rows);
  sand = new Uint8Array(cols * rows);
}

// Painting the page ------------------------------------------------------

// A text node, drawn word by word where the browser itself put the words, in
// the font it set for them. The baseline comes from the measured box: a range
// around text is as tall as the font's own ascent and descent.
function paintText(c, node) {
  const text = node.nodeValue;
  if (!text.trim()) return;
  const parent = node.parentElement;
  if (!parent) return;
  const cs = getComputedStyle(parent);
  if (cs.visibility === "hidden" || Number(cs.opacity) < 0.08) return;
  c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const m = c.measureText("Hxg");
  const box = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
  const range = document.createRange();
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++;
    let j = i;
    while (j < text.length && !/\s/.test(text[j])) j++;
    if (j === i) break;
    range.setStart(node, i);
    range.setEnd(node, j);
    const r = range.getBoundingClientRect();
    const word = text.slice(i, j);
    i = j;
    if (!r.width || r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue;
    const scale = box > 0 ? r.height / box : 1;
    c.fillText(word, r.left, r.top + m.fontBoundingBoxAscent * scale);
  }
}

const SEE_THROUGH = /^rgba?\([^)]*,\s*0(\.0+)?\)$/;
let pageBg = "";

// A picture is its picture; a filled box is its box; a rule is its rule. The
// page's own backdrop is not a thing to stand on, so it is left out.
function paintBox(c, el) {
  const cs = getComputedStyle(el);
  if (cs.visibility === "hidden" || Number(cs.opacity) < 0.08) return;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) return;
  if (el.tagName === "IMG" && el.complete && el.naturalWidth) {
    try {
      c.drawImage(el, r.left, r.top, r.width, r.height);
    } catch {
      c.fillRect(r.left, r.top, r.width, r.height);
    }
    return;
  }
  if (el.tagName === "VIDEO" || el.tagName === "CANVAS" || el.tagName === "svg") {
    c.fillRect(r.left, r.top, r.width, r.height);
    return;
  }
  const bg = cs.backgroundColor;
  if (bg && bg !== pageBg && !SEE_THROUGH.test(bg) && bg !== "transparent") c.fillRect(r.left, r.top, r.width, r.height);
  for (const side of ["Top", "Right", "Bottom", "Left"]) {
    const w = parseFloat(cs[`border${side}Width`]);
    if (!(w > 0) || cs[`border${side}Style`] === "none" || SEE_THROUGH.test(cs[`border${side}Color`])) continue;
    if (side === "Top") c.fillRect(r.left, r.top, r.width, w);
    else if (side === "Bottom") c.fillRect(r.left, r.bottom - w, r.width, w);
    else if (side === "Left") c.fillRect(r.left, r.top, w, r.height);
    else c.fillRect(r.right - w, r.top, w, r.height);
  }
}

function paint(c, root, skip) {
  c.clearRect(0, 0, W, H);
  c.fillStyle = "#000";
  c.textBaseline = "alphabetic";
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const el = node.nodeType === 1 ? node : node.parentElement;
      if (!el) return NodeFilter.FILTER_REJECT;
      if (el.id === "sand" || el.closest(".switch")) return NodeFilter.FILTER_REJECT;
      if (skip && (el === skip || skip.contains(el))) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    if (node.nodeType === 3) paintText(c, node);
    else if (node !== root) paintBox(c, node);
  }
}

// Everything on the page except the name, turned into cells the grains rest on.
function rasterise() {
  pageBg = getComputedStyle(document.body).backgroundColor;
  off.width = W;
  off.height = H;
  paint(octx, document.body, title);
  const data = octx.getImageData(0, 0, W, H).data;
  solid.fill(0);
  for (let y = 0; y < H; y++) {
    const row = ((y / CELL) | 0) * cols;
    const base = y * W * 4 + 3;
    for (let x = 0; x < W; x++) if (data[base + x * 4] > 40) solid[row + ((x / CELL) | 0)] = 1;
  }
}

// The name ---------------------------------------------------------------

let count = 0;
let px, py, vx, vy, hx, hy, fx, fy, state, bounce, cell, mode, leaveAt, takes, seed, heat, tone;

// One grain per pixel of the name as the browser drew it, each keeping the
// coverage of the pixel it came from — so at rest this is the heading itself,
// soft edges and all, and not a coarse copy of it.
function sampleName() {
  off.width = W;
  off.height = H;
  paint(octx, title, null);
  const r = title.getBoundingClientRect();
  const x0 = Math.max(0, Math.floor(r.left) - 4);
  const x1 = Math.min(W, Math.ceil(r.right) + 4);
  const y0 = Math.max(0, Math.floor(r.top) - 4);
  const y1 = Math.min(H, Math.ceil(r.bottom) + 4);
  if (x1 <= x0 || y1 <= y0) return [];
  const data = octx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  const w = x1 - x0;
  const pts = [];
  for (let y = 0; y < y1 - y0; y += DOT) {
    for (let x = 0; x < w; x += DOT) {
      const a = data[(y * w + x) * 4 + 3];
      if (a > 40) pts.push(x0 + x + 0.5, y0 + y + 0.5, a / 255);
    }
  }
  return pts;
}

function build() {
  const pts = sampleName();
  count = pts.length / 3;
  px = new Float32Array(count);
  py = new Float32Array(count);
  vx = new Float32Array(count);
  vy = new Float32Array(count);
  hx = new Float32Array(count);
  hy = new Float32Array(count);
  fx = new Float32Array(count);
  fy = new Float32Array(count);
  state = new Uint8Array(count);
  bounce = new Uint8Array(count);
  cell = new Int32Array(count);
  mode = new Uint8Array(count);
  leaveAt = new Float32Array(count);
  takes = new Float32Array(count);
  seed = new Float32Array(count);
  heat = new Float32Array(count);
  tone = new Uint8Array(count);
  sorted = new Int32Array(count);
  for (let k = 0; k < count; k++) {
    px[k] = hx[k] = pts[k * 3];
    py[k] = hy[k] = pts[k * 3 + 1];
    tone[k] = Math.min(TONES - 1, Math.floor(pts[k * 3 + 2] * TONES));
    seed[k] = Math.random();
  }
  title.style.visibility = "hidden"; // the canvas draws it from here on
}

// Falling ----------------------------------------------------------------

function knock(k, ax, ay) {
  if (state[k] === PILE) sand[cell[k]] = 0;
  vx[k] = ax;
  vy[k] = ay;
  state[k] = FALL;
  bounce[k] = 0;
  heat[k] = 1;
}

// Come to rest: take the nearest free cell at or above where the grain stopped.
function settle(k, x, y) {
  let gy = y;
  for (let n = 0; n < 60 && blocked(x, gy); n++) gy -= CELL;
  const cx = Math.min(W - 1, Math.max(0, x));
  const i = cellAt(cx, Math.max(0, gy));
  sand[i] = 1;
  cell[k] = i;
  px[k] = (i % cols) * CELL + CELL / 2 + (Math.random() - 0.5) * (CELL - DOT);
  py[k] = ((i / cols) | 0) * CELL + CELL / 2;
  vx[k] = vy[k] = 0;
  state[k] = PILE;
}

function fall(k, dt) {
  vy[k] += GRAVITY * dt;
  vx[k] *= Math.exp(-0.9 * dt);
  const dx = vx[k] * dt;
  const dy = vy[k] * dt;
  const n = Math.min(8, Math.max(1, Math.ceil(Math.hypot(dx, dy) / CELL)));
  let x = px[k];
  let y = py[k];
  for (let s = 0; s < n; s++) {
    const sx = x + dx / n;
    const sy = y + dy / n;
    if (!blocked(sx, sy)) {
      x = sx;
      y = sy;
      continue;
    }
    const hitFloor = blocked(x, sy);
    const hitWall = blocked(sx, y);
    if (Math.hypot(vx[k], vy[k]) > 300 && bounce[k] < 2) {
      // A couple of dead bounces, like a grain rather than a ball.
      if (hitFloor || !hitWall) vy[k] = -vy[k] * 0.22;
      if (hitWall) vx[k] = -vx[k] * 0.45;
      vx[k] += (Math.random() - 0.5) * 90;
      bounce[k]++;
      break;
    }
    // Roll down the slope if a shoulder is free, otherwise stop here.
    const dir = vx[k] > 6 ? 1 : vx[k] < -6 ? -1 : Math.random() < 0.5 ? 1 : -1;
    if (!blocked(x + dir * CELL, sy)) {
      x += dir * CELL;
      y = sy;
      vx[k] = vx[k] * 0.3 + dir * 40;
      vy[k] *= 0.75;
      continue;
    }
    if (!blocked(x - dir * CELL, sy)) {
      x -= dir * CELL;
      y = sy;
      vx[k] = vx[k] * 0.3 - dir * 40;
      vy[k] *= 0.75;
      continue;
    }
    settle(k, x, y);
    return;
  }
  px[k] = x;
  py[k] = y;
}

// Putting the name back --------------------------------------------------

let rebuilds = 0;

function rebuild(t) {
  const m = rebuilds++ % MODES.length;
  for (let k = 0; k < count; k++) {
    if (state[k] !== PILE) continue;
    sand[cell[k]] = 0;
    fx[k] = px[k];
    fy[k] = py[k];
    mode[k] = m;
    state[k] = BACK;
    const across = count > 1 ? (hx[k] - hx[0]) / Math.max(1, W) : 0;
    if (MODES[m] === "leap") {
      leaveAt[k] = t + Math.abs(across) * 1.1 + seed[k] * 0.3;
      takes[k] = 0.5 + 0.35 * seed[k];
    } else if (MODES[m] === "swirl") {
      leaveAt[k] = t + seed[k] * 0.9;
      takes[k] = 1.1 + 0.5 * seed[k];
    } else {
      leaveAt[k] = t + seed[k] * 0.3;
      takes[k] = 0.75 + 0.5 * seed[k];
    }
  }
}

const ease = (u) => u * u * (3 - 2 * u);

function home(k, t) {
  const tau = t - leaveAt[k];
  if (tau <= 0) return;
  const u = Math.min(1, tau / takes[k]);
  const s = seed[k];
  const kind = MODES[mode[k]];
  if (kind === "leap") {
    // The time-reverse of falling: thrown so it peaks exactly at its place.
    px[k] = fx[k] + (hx[k] - fx[k]) * u;
    py[k] = fy[k] + (hy[k] - fy[k]) * (2 * u - u * u);
  } else if (kind === "swirl") {
    const e = ease(u);
    const ring = Math.sin(Math.PI * e) * (16 + 46 * s);
    const turn = s * 6.283 + (1 - e) * 7;
    px[k] = fx[k] + (hx[k] - fx[k]) * e + Math.cos(turn) * ring;
    py[k] = fy[k] + (hy[k] - fy[k]) * e + Math.sin(turn * 2) * ring * 0.3;
  } else {
    // Slide along under its place, then rise into it.
    const slide = 0.5;
    if (u < slide) {
      const e = ease(u / slide);
      px[k] = fx[k] + (hx[k] - fx[k]) * e;
      py[k] = fy[k];
    } else {
      const r = (u - slide) / (1 - slide);
      px[k] = hx[k];
      py[k] = fy[k] + (hy[k] - fy[k]) * (1 - Math.pow(1 - r, 3));
    }
  }
  heat[k] = 1 - u;
  if (u >= 1) {
    px[k] = hx[k];
    py[k] = hy[k];
    heat[k] = 0;
    state[k] = HOME;
  }
}

// The pointer ------------------------------------------------------------

const cursor = { x: -1e4, y: -1e4, px: -1e4, py: -1e4, vx: 0, vy: 0, sweeping: false, present: false };
let lastInput = -1e9;
const clicks = [];

addEventListener("pointermove", (e) => {
  const now = performance.now() / 1000;
  if (cursor.present) {
    const dt = Math.max(1 / 240, now - lastInput);
    cursor.vx += ((e.clientX - cursor.x) / dt - cursor.vx) * 0.5;
    cursor.vy += ((e.clientY - cursor.y) / dt - cursor.vy) * 0.5;
  } else {
    cursor.px = e.clientX;
    cursor.py = e.clientY;
  }
  cursor.x = e.clientX;
  cursor.y = e.clientY;
  cursor.present = true;
  lastInput = now;
});
document.documentElement.addEventListener("pointerleave", () => (cursor.present = false));
addEventListener("pointerdown", (e) => {
  if (e.target.closest?.("a, button, input, textarea, select")) return;
  clicks.push([e.clientX, e.clientY]);
});

// Squared distance to the line the pointer swept this step.
function sweptDist2(x, y) {
  const sx = cursor.x - cursor.px;
  const sy = cursor.y - cursor.py;
  const len2 = sx * sx + sy * sy;
  let u = len2 > 1e-6 ? ((x - cursor.px) * sx + (y - cursor.py) * sy) / len2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ax = x - (cursor.px + sx * u);
  const ay = y - (cursor.py + sy * u);
  return ax * ax + ay * ay;
}

// Layout changes ---------------------------------------------------------

let pending = 0;
// Scrolling moves the heading but reflows nothing, so the name travels with it
// and only the page's own shapes have to be read again.
function onScroll() {
  const r = title.getBoundingClientRect();
  const dx = r.left - titleAt.left;
  const dy = r.top - titleAt.top;
  titleAt = { left: r.left, top: r.top };
  if (dx || dy) {
    for (let k = 0; k < count; k++) {
      hx[k] += dx;
      hy[k] += dy;
      if (state[k] === HOME) {
        px[k] += dx;
        py[k] += dy;
      }
    }
  }
  clearTimeout(pending);
  pending = setTimeout(reread, 120);
}

// Scrolling slides the page under the heaps: a grain the page has swallowed, or
// one whose footing has gone, starts moving again.
function reread() {
  rasterise();
  for (let k = 0; k < count; k++) {
    if (state[k] !== PILE) continue;
    const x = Math.min(W - 1, Math.max(0, px[k]));
    const y = Math.min(H - 1, Math.max(0, py[k]));
    const here = cellAt(x, y);
    const under = y + CELL < H ? cellAt(x, y + CELL) : -1;
    const buried = solid[here] === 1;
    const adrift = under >= 0 && solid[under] !== 1 && sand[under] !== 1;
    if (buried || adrift) knock(k, (Math.random() - 0.5) * 30, buried ? -40 : 0);
  }
}

let titleAt = { left: 0, top: 0 };

function layout() {
  sized();
  rasterise();
  build();
  const r = title.getBoundingClientRect();
  titleAt = { left: r.left, top: r.top };
}

let resizing = 0;

// The loop ---------------------------------------------------------------

let lastDisturbed = -1e9;

function step(t, dt) {
  const speed = Math.hypot(cursor.vx, cursor.vy);
  cursor.sweeping = cursor.present && speed > 30 && performance.now() / 1000 - lastInput < 0.12;

  while (clicks.length) {
    const [cx, cy] = clicks.shift();
    for (let k = 0; k < count; k++) {
      if (state[k] !== HOME && state[k] !== PILE) continue;
      const dx = px[k] - cx;
      const dy = py[k] - cy;
      const d = Math.hypot(dx, dy);
      if (d > BLAST) continue;
      const f = 1 - d / BLAST;
      const kick = (180 + 620 * Math.random()) * f;
      knock(k, (dx / (d + 2)) * kick, (dy / (d + 2)) * kick - 260 * f);
    }
    lastDisturbed = t;
  }

  let falling = 0;
  let heaped = 0;
  for (let k = 0; k < count; k++) {
    const st = state[k];
    if (st === HOME || st === PILE) {
      if (st === PILE) heaped++;
      if (cursor.sweeping && sweptDist2(px[k], py[k]) < REACH * REACH) {
        const carry = 0.12 + 0.25 * Math.random();
        knock(k, cursor.vx * carry + (Math.random() - 0.5) * 120, cursor.vy * carry + (Math.random() - 0.5) * 120 - 60);
        lastDisturbed = t;
        if (st === PILE) heaped--;
        falling++;
      }
      continue;
    }
    if (st === FALL) {
      falling++;
      fall(k, dt);
      heat[k] = Math.max(0, heat[k] - dt * 0.7);
    } else {
      home(k, t);
    }
  }

  cursor.px = cursor.x;
  cursor.py = cursor.y;
  const fade = Math.exp(-8 * dt);
  cursor.vx *= fade;
  cursor.vy *= fade;

  if (falling) lastDisturbed = t;
  // Only put the name back while its place is on screen: scrolled past, the
  // heaps stay where they lie rather than flying off to somewhere unseen.
  const athome = count > 0 && hy[0] > -30 && hy[0] < H + 30;
  if (heaped && !falling && athome && t - lastDisturbed > QUIET) rebuild(t);
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  // One path per colour: a few thousand grains go down in a handful of fills.
  order.fill(0);
  for (let k = 0; k < count; k++) {
    const s = Math.min(SHADES - 1, Math.round(heat[k] * (SHADES - 1)));
    order[s * TONES + tone[k]]++;
  }
  let at = 0;
  for (let b = 0; b < SHADES * TONES; b++) {
    bin[b] = at;
    at += order[b];
    order[b] = 0;
  }
  for (let k = 0; k < count; k++) {
    const s = Math.min(SHADES - 1, Math.round(heat[k] * (SHADES - 1)));
    const b = s * TONES + tone[k];
    sorted[bin[b] + order[b]++] = k;
  }
  at = 0;
  for (let b = 0; b < SHADES * TONES; b++) {
    if (!order[b]) continue;
    ctx.fillStyle = shade[b];
    ctx.beginPath();
    for (let n = 0; n < order[b]; n++) {
      const k = sorted[bin[b] + n];
      ctx.rect(px[k] - DOT / 2, py[k] - DOT / 2, DOT + 0.35, DOT + 0.35);
    }
    ctx.fill();
  }
}

let simTime = 0;
let last = null;
function frame(ms) {
  const now = ms / 1000;
  const dt = last === null ? 1 / 60 : Math.min(1 / 30, Math.max(0, now - last));
  last = now;
  simTime += dt;
  step(simTime, dt);
  draw();
  requestAnimationFrame(frame);
}

if (!still) {
  layout();
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", () => {
    clearTimeout(resizing);
    resizing = setTimeout(layout, 180);
  });
  requestAnimationFrame(frame);
}
