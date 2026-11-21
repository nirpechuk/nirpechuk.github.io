// Concept: dog.
// An ordinary page of text with a small robot dog padding along underneath it,
// seen from above. It follows the pointer, and each paw rests on a nearby
// word, lifting off and reaching for a new one as the body moves on. It is
// kept quiet on purpose: low contrast, unhurried, the words themselves never
// move, and it dims once it has settled.

const root = document.getElementById("content");
const canvas = document.getElementById("dog");
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
    leg.anchor = null; // every foothold is stale after a relayout
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

// The dog ---------------------------------------------------------------------------
// Until the pointer moves it waits just past the end of the name, facing it.
const nameEnd = [...root.querySelectorAll("h1 span.w")].pop().getBoundingClientRect();
const pointer = { x: nameEnd.right + 34, y: (nameEnd.top + nameEnd.bottom) / 2 };
addEventListener("pointermove", (e) => ((pointer.x = e.clientX), (pointer.y = e.clientY)), { passive: true });

// spin is how fast it is turning, look is how far the head is turned towards
// the pointer, wag is how hard the tail is wagging.
const body = { x: pointer.x + scrollX, y: pointer.y + scrollY, vx: 0, vy: 0, heading: Math.PI, spin: 0, look: 0, wag: 0, moving: false };
const UPPER = 12; // leg segment lengths: short, so the paws stay tucked in by the body
const LOWER = 14;
const REACH = UPPER + LOWER;
const STEP_SEC = 0.16;
// A leg at each corner. hip and rest are in the dog's own frame (x forward,
// y to its right): where the leg joins the body, and where its paw likes to be.
const legs = [];
for (const [front, side] of [
  [1, -1],
  [1, 1],
  [-1, -1],
  [-1, 1],
]) {
  legs.push({
    hip: [front * 12, side * 7.5],
    rest: [front * 19 + 2, side * 18],
    slack: front > 0 ? 16 : 20, // hind paws stay planted a little longer
    group: front * side > 0 ? 0 : 1, // a trot: diagonal pairs move together
    foot: { x: body.x, y: body.y },
    from: null,
    to: null,
    t: 1,
    anchor: null,
  });
}
// A point in the dog's frame, on the page.
function place([lx, ly]) {
  const c = Math.cos(body.heading);
  const s = Math.sin(body.heading);
  return { x: body.x + lx * c - ly * s, y: body.y + lx * s + ly * c };
}

function pickAnchor(x, y, used, hip) {
  for (const radius of [22, 44, 70]) {
    const a = nearestAnchor(x, y, radius, used);
    if (a && Math.hypot(a.x - hip.x, a.y - hip.y) <= REACH * 1.1) return a;
  }
  return null;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
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
  const away = Math.hypot(tx - body.x, ty - body.y);
  if (away < 0.4 && speed < 4) {
    body.x = tx;
    body.y = ty;
    body.vx = body.vy = 0;
  }
  const was = body.heading;
  if (speed > 25) body.heading += turn(body.heading, Math.atan2(body.vy, body.vx)) * Math.min(1, dt * 6);
  if (dt > 0) body.spin += ((body.heading - was) / dt - body.spin) * Math.min(1, dt * 8);
  // The head turns towards where it is going; the tail gives a short wag on arrival.
  const glance = away > 12 ? clamp(turn(body.heading, Math.atan2(ty - body.y, tx - body.x)), -0.6, 0.6) : 0;
  body.look += (glance - body.look) * Math.min(1, dt * 6);
  const moving = speed > 4;
  if (body.moving && !moving) body.wag = 1;
  body.moving = moving;
  body.wag *= Math.exp(-dt * 2.5);

  const used = new Set(legs.map((leg) => leg.anchor).filter(Boolean));
  const stepping = [0, 0];
  for (const leg of legs) if (leg.t < 1) stepping[leg.group]++;

  for (const leg of legs) {
    // Where this paw would like to be: at its corner, a little ahead when moving.
    const ideal = place(leg.rest);
    const lead = Math.min(0.12, 9 / (speed || 1));
    const ix = ideal.x + body.vx * lead;
    const iy = ideal.y + body.vy * lead;
    const hip = place(leg.hip);

    if (leg.t < 1) {
      // Steps quicken with the body, and a paw with no word to land on aims
      // for its corner as that moves, so the legs keep up at a run.
      leg.t = Math.min(1, leg.t + (dt / STEP_SEC) * (1 + speed / 180));
      const e = leg.t * leg.t * (3 - 2 * leg.t);
      const to = leg.to || { x: ix, y: iy };
      leg.foot.x = leg.from.x + (to.x - leg.from.x) * e;
      leg.foot.y = leg.from.y + (to.y - leg.from.y) * e;
      continue;
    }
    const offIdeal = Math.hypot(leg.foot.x - ix, leg.foot.y - iy);
    const offHip = Math.hypot(leg.foot.x - hip.x, leg.foot.y - hip.y);
    const must = offHip > REACH * 1.25;
    const want = offIdeal > leg.slack || offHip > REACH + 3;
    const free = !leg.anchor; // standing on bare page, so any word in reach is worth taking
    if (!(must || ((want || free) && stepping[1 - leg.group] === 0))) continue;

    if (leg.anchor) used.delete(leg.anchor);
    let found = pickAnchor(ix, iy, used, hip);
    if (found === leg.anchor) found = null;
    // Leave a word only for a clearly better foothold, or when it is out of reach.
    if (found && !free && !must && Math.hypot(found.x - ix, found.y - iy) > offIdeal - 8) found = null;
    if (!found && ((!free && !must) || (free && !want))) {
      if (leg.anchor) used.add(leg.anchor);
      continue;
    }
    // With no word in reach the paw is simply set down at its corner, so a
    // leg never stretches across the page to stay on one.
    leg.anchor = found;
    if (found) used.add(found);
    leg.from = { x: leg.foot.x, y: leg.foot.y };
    leg.to = found ? { x: found.x, y: found.y } : null;
    leg.t = 0;
    stepping[leg.group]++;
  }
}

// A faint box around each word a planted paw is resting on, fading in and out.
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
  for (const key of ["body", "leg", "detail", "box"]) colour[key] = style.getPropertyValue(`--dog-${key}`).trim();
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

// The knee of a leg from hip to paw, bending away from the body.
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

function draw(now) {
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

  // Legs: flat bars with a square knee and a square paw.
  ctx.lineCap = "butt";
  for (const leg of legs) {
    const hip = place(leg.hip);
    const lift = leg.t < 1 ? Math.sin(Math.PI * leg.t) : 0;
    const foot = { x: leg.foot.x, y: leg.foot.y - lift * 3 };
    // A leg is never drawn longer than it is, however far behind the paw has fallen.
    const far = Math.hypot(foot.x - hip.x, foot.y - hip.y) / (REACH * 1.15);
    if (far > 1) {
      foot.x = hip.x + (foot.x - hip.x) / far;
      foot.y = hip.y + (foot.y - hip.y) / far;
    }
    const k = knee(hip, foot);
    ctx.strokeStyle = colour.leg;
    bar(hip.x, hip.y, k.x, k.y, 5);
    bar(k.x, k.y, foot.x, foot.y, 4);
    ctx.fillStyle = colour.detail;
    square(k.x, k.y, 5);
    ctx.fillStyle = leg.anchor && leg.t >= 1 ? colour.detail : colour.leg;
    square(foot.x, foot.y, 7);
  }

  ctx.save();
  ctx.translate(body.x, body.y);
  ctx.rotate(body.heading);
  // Tail: trails the way it is turning, and wags briefly when the dog arrives.
  ctx.save();
  ctx.translate(-17, 0);
  ctx.rotate(Math.PI + clamp(-body.spin * 0.1, -0.7, 0.7) + body.wag * 0.6 * Math.sin(now * 0.016));
  ctx.fillStyle = colour.leg;
  ctx.fillRect(0, -1.5, 13, 3);
  ctx.fillStyle = colour.detail;
  ctx.fillRect(11, -2, 4, 4);
  ctx.restore();
  // Torso, with a shoulder block over each leg and a collar.
  ctx.fillStyle = colour.body;
  ctx.fillRect(-18, -8.5, 36, 17);
  ctx.fillStyle = colour.detail;
  for (const leg of legs) ctx.fillRect(leg.hip[0] - 4, leg.hip[1] - 2.5 + Math.sign(leg.hip[1]) * 1.5, 8, 5);
  ctx.fillRect(-10, -0.5, 18, 1); // spine
  ctx.fillRect(13, -8.5, 2.5, 17); // collar
  // Head: turned a little towards the pointer, with ears, eyes and a nose.
  ctx.translate(18, 0);
  ctx.rotate(body.look);
  ctx.fillStyle = colour.detail;
  for (const side of [-1, 1]) {
    // Ears, flopped out and back.
    ctx.save();
    ctx.translate(3, side * 6);
    ctx.rotate(side * 2.1);
    ctx.fillRect(0, -2.5, 9, 5);
    ctx.restore();
  }
  ctx.fillStyle = colour.body;
  ctx.fillRect(-1, -6.5, 13, 13); // head
  ctx.fillRect(12, -3.5, 7, 7); // snout
  ctx.fillStyle = colour.detail;
  ctx.fillRect(16, -2, 3, 4); // nose
  ctx.fillRect(7, -5, 2.5, 2.5); // eyes
  ctx.fillRect(7, 2.5, 2.5, 2.5);
  ctx.restore();
}

// Run. Once the dog has been still for a couple of seconds it dims, so it is
// not in the way of reading; it comes back as soon as it moves.
let last = performance.now();
let lastMoved = last;
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  updateGlow(dt);
  draw(now);
  if (body.moving || body.wag > 0.05 || legs.some((leg) => leg.t < 1)) lastMoved = now;
  canvas.classList.toggle("idle", now - lastMoved > 2000);
  requestAnimationFrame(frame);
}
// People who ask for less motion get the page without the dog.
if (!still.matches) requestAnimationFrame(frame);
