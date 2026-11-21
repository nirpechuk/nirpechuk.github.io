// Concept: spider.
// An ordinary page of text with a small flat machine walking underneath it. It
// follows the pointer, and each of its eight legs holds on to a nearby word,
// letting go and reaching for a new one as the body moves on. It is kept quiet
// on purpose: low contrast, unhurried, the words themselves never move, and it
// dims once it has settled.

const root = document.getElementById("content");
const canvas = document.getElementById("spider");
const ctx = canvas.getContext("2d");
const still = matchMedia("(prefers-reduced-motion: reduce)");

// Words --------------------------------------------------------------------------
// Wrap every word in a span so we can ask where it sits.
const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
  acceptNode: (n) => (n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
});
const textNodes = [];
while (walker.nextNode()) textNodes.push(walker.currentNode);
for (const node of textNodes) {
  const frag = document.createDocumentFragment();
  for (const part of node.nodeValue.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) frag.append(part);
    else {
      const span = document.createElement("span");
      span.className = "w";
      span.textContent = part;
      frag.append(span);
    }
  }
  node.replaceWith(frag);
}
const words = [...root.querySelectorAll("span.w")];

// Grip points on each word, in page coordinates, bucketed into a grid so the
// nearest one is quick to find.
const CELL = 80;
let grid = new Map();
const wordRect = new Map();
function buildAnchors() {
  grid = new Map();
  for (const word of words) {
    const r = word.getBoundingClientRect();
    if (!r.width) continue;
    const left = r.left + scrollX;
    const top = r.top + scrollY;
    wordRect.set(word, { left, top, right: left + r.width, bottom: top + r.height });
    const x0 = left + 1;
    const x1 = left + r.width - 1;
    const y0 = top + r.height * 0.3;
    const y1 = top + r.height * 0.75;
    for (const [x, y] of [
      [x0, y0],
      [x1, y0],
      [x0, y1],
      [x1, y1],
      [(x0 + x1) / 2, (y0 + y1) / 2],
    ]) {
      const key = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push({ x, y, el: word });
    }
  }
  for (const leg of legs) {
    leg.anchor = null; // every grip is stale after a relayout
    leg.t = 1;
  }
}
function nearestAnchor(x, y, radius, used) {
  let best = null;
  let bestD = radius * radius;
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  const n = Math.ceil(radius / CELL);
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      for (const a of grid.get(`${cx + i},${cy + j}`) || []) {
        if (used.has(a)) continue;
        const d = (a.x - x) ** 2 + (a.y - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = a;
        }
      }
    }
  }
  return best;
}

// The spider -----------------------------------------------------------------------
// Until the pointer moves it rests just past the end of the name.
const nameEnd = [...root.querySelectorAll("h1 span.w")].pop().getBoundingClientRect();
const pointer = { x: nameEnd.right + 30, y: (nameEnd.top + nameEnd.bottom) / 2 };
addEventListener("pointermove", (e) => ((pointer.x = e.clientX), (pointer.y = e.clientY)), { passive: true });

const body = { x: pointer.x + scrollX, y: pointer.y + scrollY, vx: 0, vy: 0, heading: -Math.PI / 2 };
const UPPER = 30; // leg segment lengths
const LOWER = 36;
const REACH = UPPER + LOWER;
const STEP_SEC = 0.15;
const legs = [];
for (const side of [-1, 1]) {
  // Angle from the heading and resting distance, front leg to back leg.
  [
    [38, 46],
    [78, 52],
    [112, 51],
    [150, 48],
  ].forEach(([deg, dist], i) => {
    legs.push({
      i,
      angle: (side * deg * Math.PI) / 180,
      dist,
      group: (i + (side > 0 ? 1 : 0)) % 2, // two alternating sets of four
      foot: { x: body.x, y: body.y },
      from: null,
      to: null,
      t: 1,
      anchor: null,
    });
  });
}

function pickAnchor(x, y, used) {
  for (const radius of [36, 70, 115, 180]) {
    const a = nearestAnchor(x, y, radius, used);
    if (a && Math.hypot(a.x - body.x, a.y - body.y) <= REACH * 1.6) return a;
  }
  return null;
}

const turn = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

function update(dt) {
  // The body follows the pointer on a critically damped spring: no overshoot.
  const tx = pointer.x + scrollX;
  const ty = pointer.y + scrollY;
  body.vx += ((tx - body.x) * 16 - body.vx * 8) * dt;
  body.vy += ((ty - body.y) * 16 - body.vy * 8) * dt;
  const speed = Math.hypot(body.vx, body.vy);
  if (speed > 520) {
    body.vx *= 520 / speed;
    body.vy *= 520 / speed;
  }
  body.x += body.vx * dt;
  body.y += body.vy * dt;
  if (Math.hypot(tx - body.x, ty - body.y) < 0.4 && speed < 4) {
    body.x = tx;
    body.y = ty;
    body.vx = body.vy = 0;
  }
  if (speed > 25) body.heading += turn(body.heading, Math.atan2(body.vy, body.vx)) * Math.min(1, dt * 6);

  const used = new Set(legs.map((leg) => leg.anchor).filter(Boolean));
  const stepping = [0, 0];
  for (const leg of legs) if (leg.t < 1) stepping[leg.group]++;

  for (const leg of legs) {
    // Where this leg would like its foot: out to the side, a little ahead.
    const a = body.heading + leg.angle;
    const ix = body.x + Math.cos(a) * leg.dist + body.vx * 0.14;
    const iy = body.y + Math.sin(a) * leg.dist + body.vy * 0.14;

    if (leg.t < 1) {
      leg.t = Math.min(1, leg.t + dt / STEP_SEC);
      const e = leg.t * leg.t * (3 - 2 * leg.t);
      leg.foot.x = leg.from.x + (leg.to.x - leg.from.x) * e;
      leg.foot.y = leg.from.y + (leg.to.y - leg.from.y) * e;
      continue;
    }
    const offIdeal = Math.hypot(leg.foot.x - ix, leg.foot.y - iy);
    const offBody = Math.hypot(leg.foot.x - body.x, leg.foot.y - body.y);
    const must = offBody > REACH * 1.35;
    const want = offIdeal > 26 + leg.i * 6 || offBody > REACH + 5; // back legs hang on longer
    const free = !leg.anchor; // standing on bare page, so any word in reach is worth taking
    if (!(must || ((want || free) && stepping[1 - leg.group] === 0))) continue;

    if (leg.anchor) used.delete(leg.anchor);
    let found = pickAnchor(ix, iy, used);
    if (found === leg.anchor) found = null;
    // Let go of a word only for a clearly better grip, or when it is out of reach.
    if (found && !free && !must && Math.hypot(found.x - ix, found.y - iy) > offIdeal - 8) found = null;
    if (!found && ((!free && !must) || (free && !want))) {
      if (leg.anchor) used.add(leg.anchor);
      continue;
    }
    // With no word in reach the foot is simply set down beside the body, so a
    // leg never stretches across the page to keep hold of one.
    leg.anchor = found;
    if (found) used.add(found);
    leg.from = { x: leg.foot.x, y: leg.foot.y };
    leg.to = found ? { x: found.x, y: found.y } : { x: ix, y: iy };
    leg.t = 0;
    stepping[leg.group]++;
  }
}

// A faint box around each word a planted foot is holding, fading in and out.
const glow = new Map();
function updateGlow(dt) {
  const held = new Set();
  for (const leg of legs) if (leg.anchor && leg.t >= 1) held.add(leg.anchor.el);
  for (const word of held) if (!glow.has(word)) glow.set(word, 0);
  for (const [word, v] of glow) {
    const target = held.has(word) ? 1 : 0;
    const next = v + (target - v) * Math.min(1, dt * (target ? 8 : 3));
    if (!target && next < 0.01) glow.delete(word);
    else glow.set(word, next);
  }
}

// Drawing --------------------------------------------------------------------------
const colour = {};
function readColours() {
  const style = getComputedStyle(document.documentElement);
  for (const key of ["body", "leg", "detail", "box"]) colour[key] = style.getPropertyValue(`--spider-${key}`).trim();
}
const dark = matchMedia("(prefers-color-scheme: dark)");
let wasDark = null; // checked each frame, so a theme change is never missed

let dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  buildAnchors();
}
addEventListener("resize", resize);
new ResizeObserver(buildAnchors).observe(root); // fonts arriving, text reflowing
resize();

// The knee of a leg from hip to foot, bending away from the body.
function knee(hip, foot) {
  const dx = foot.x - hip.x;
  const dy = foot.y - hip.y;
  let d = Math.hypot(dx, dy) || 0.001;
  const ux = dx / d;
  const uy = dy / d;
  if (d >= REACH) return { x: hip.x + (ux * UPPER * d) / REACH, y: hip.y + (uy * UPPER * d) / REACH };
  d = Math.max(d, Math.abs(UPPER - LOWER) + 1);
  const along = (UPPER * UPPER - LOWER * LOWER + d * d) / (2 * d);
  const off = Math.sqrt(Math.max(0, UPPER * UPPER - along * along));
  const px = hip.x + ux * along;
  const py = hip.y + uy * along;
  const a = { x: px - uy * off, y: py + ux * off };
  const b = { x: px + uy * off, y: py - ux * off };
  return (a.x - body.x) ** 2 + (a.y - body.y) ** 2 > (b.x - body.x) ** 2 + (b.y - body.y) ** 2 ? a : b;
}
function bar(x0, y0, x1, y1, width) {
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}
const square = (x, y, size) => ctx.fillRect(x - size / 2, y - size / 2, size, size);

function draw() {
  if (dark.matches !== wasDark) {
    wasDark = dark.matches;
    readColours();
  }
  ctx.setTransform(dpr, 0, 0, dpr, -scrollX * dpr, -scrollY * dpr);
  ctx.clearRect(scrollX, scrollY, innerWidth, innerHeight);

  ctx.strokeStyle = colour.box;
  ctx.lineWidth = 1;
  for (const [word, alpha] of glow) {
    const r = wordRect.get(word);
    if (!r) continue;
    ctx.globalAlpha = alpha;
    ctx.strokeRect(r.left - 2.5, r.top + 2.5, r.right - r.left + 5, r.bottom - r.top - 5);
  }
  ctx.globalAlpha = 1;

  // Legs: flat bars with square joints and feet.
  ctx.lineCap = "butt";
  for (const leg of legs) {
    const ha = body.heading + leg.angle * 0.75;
    const hip = { x: body.x + Math.cos(ha) * 4.5, y: body.y + Math.sin(ha) * 4.5 };
    const lift = leg.t < 1 ? Math.sin(Math.PI * leg.t) : 0;
    const foot = { x: leg.foot.x, y: leg.foot.y - lift * 4 };
    const k = knee(hip, foot);
    k.y -= 4 + lift * 3;
    ctx.strokeStyle = colour.leg;
    bar(hip.x, hip.y, k.x, k.y, 3.5);
    bar(k.x, k.y, foot.x, foot.y, 2.5);
    ctx.fillStyle = colour.detail;
    square(k.x, k.y, 4.5);
    ctx.fillStyle = leg.anchor && leg.t >= 1 ? colour.detail : colour.leg;
    square(foot.x, foot.y, 3.5);
  }

  // Body: a few stacked boxes.
  ctx.save();
  ctx.translate(body.x, body.y);
  ctx.rotate(body.heading);
  ctx.scale(0.5, 0.5);
  ctx.fillStyle = colour.body;
  ctx.fillRect(-40, -14, 30, 28); // abdomen
  ctx.fillRect(-10, -11, 22, 22); // thorax
  ctx.fillRect(12, -7, 11, 14); // head
  ctx.fillStyle = colour.detail;
  for (const x of [-34, -25, -16]) ctx.fillRect(x, -14, 2, 28); // panel seams
  ctx.fillRect(-10, -11, 2, 22);
  ctx.fillRect(-4, -4, 10, 8);
  ctx.fillRect(18, -2, 4, 4); // eye
  ctx.restore();
}

// Run. Once the spider has been still for a couple of seconds it dims, so it
// is not in the way of reading; it comes back as soon as it moves.
let last = performance.now();
let lastMoved = last;
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  updateGlow(dt);
  draw();
  if (Math.hypot(body.vx, body.vy) > 4 || legs.some((leg) => leg.t < 1)) lastMoved = now;
  canvas.classList.toggle("idle", now - lastMoved > 2000);
  requestAnimationFrame(frame);
}
// People who ask for less motion get the page without the spider.
if (!still.matches) requestAnimationFrame(frame);
