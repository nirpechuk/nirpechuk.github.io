// Concept: desk.
// A slow pixel-art scene drawn entirely in code: Nir typing at a laptop,
// with a plant, a boba, a Seattle snow globe and a research-style bimanual rig
// (two arms bolted to the desk under a camera on a stand), and pine trees
// standing either side. Mostly it just idles. Every so often Nir runs the arms
// and they do something: stack blocks, hand him the boba, refill it, shake the
// globe.

const W = 620; // logical pixels; the canvas is scaled up to fit the page
const H = 240;
const DESK = 174; // y of the desk top
const FLOOR = 229;

// Colours ----------------------------------------------------------------------
const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
};
const C = Object.fromEntries(
  Object.entries({
    line: "#3a2b33",
    skin: "#f1c8a6",
    skinLight: "#fadcc2",
    skinShade: "#d79f80",
    blush: "#f6a39a",
    eye: "#3a2418",
    mouth: "#7a3530",
    hair: "#33211a",
    hairDark: "#20130e",
    hairLight: "#5f3f2b",
    sweater: "#414f38",
    sweaterDark: "#303b2a",
    sweaterLight: "#596b4c",
    gold: "#e6bb55",
    white: "#f8f5ee",
    desk: "#d69c67",
    deskLight: "#e6b684",
    deskEdge: "#aa7242",
    deskDark: "#84552f",
    laptop: "#969cab",
    laptopLight: "#c3c9d5",
    laptopDark: "#6c7281",
    logo: "#f0f3f8",
    leaf: "#4fa159",
    leafLight: "#80cc74",
    leafDark: "#317544",
    pot: "#d06e45",
    potLight: "#e48d62",
    potDark: "#a04f31",
    tea: "#d9a977",
    teaLight: "#ebcaa3",
    cup: "#f0f5f8",
    pearl: "#2c1c1d",
    straw: "#f4627f",
    strawLight: "#f99bb0",
    arm: "#eef1f5",
    armShade: "#c1c7d2",
    joint: "#4d5260",
    jointLight: "#737989",
    pad: "#9aa1b0",
    lens: "#75e9ff",
    rail: "#b3bac6",
    railDark: "#858c9a",
    red: "#e8565a",
    redLight: "#f4898b",
    yellow: "#f4cd58",
    yellowLight: "#fae08f",
    blue: "#5a97f7",
    blueLight: "#93bdfb",
    pine: "#356b57",
    pineLight: "#4a8c70",
    pineDark: "#274f41",
    snow: "#eef4f7",
    snowShade: "#cfdde5",
    trunk: "#75523a",
    glass: "#d4ecf8",
    glassLight: "#f0f9fd",
    needle: "#8f96a6",
    kettle: "#8acbe2",
    kettleLight: "#b9e2f0",
    kettleDark: "#5a9cb6",
    scotty: "#4c4c5b",
    scottyLight: "#75758a",
    tartan: "#cf1f3c",
    green: "#45df8b",
    bubble: "#fcfbf7",
  }).map(([k, v]) => [k, hex(v)])
);

// A layer of pixels. Each thing is drawn into its own layer, given a soft
// outline, then stamped onto the frame.
class Layer {
  constructor() {
    this.d = new Uint32Array(W * H);
  }
  clear() {
    this.d.fill(0);
    return this;
  }
  px(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && x < W && y >= 0 && y < H) this.d[y * W + x] = c;
  }
  rect(x, y, w, h, c) {
    x = Math.round(x);
    y = Math.round(y);
    for (let j = Math.max(0, y); j < Math.min(H, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) this.d[j * W + i] = c;
    }
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++) {
      for (let i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) {
        const u = (i - cx) / (rx + 0.35);
        const v = (j - cy) / (ry + 0.35);
        if (u * u + v * v <= 1) this.px(i, j, c);
      }
    }
  }
  disc(cx, cy, r, c) {
    this.ellipse(cx, cy, r, r, c);
  }
  line(x0, y0, x1, y1, c, th = 1) {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) || 1;
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n;
      const y = y0 + ((y1 - y0) * k) / n;
      if (th <= 1) this.px(x, y, c);
      else this.disc(x, y, (th - 1) / 2, c);
    }
  }
  poly(pts, c) {
    let lo = H;
    let hi = 0;
    for (const [, y] of pts) {
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    for (let y = Math.round(lo); y <= Math.round(hi); y++) {
      const xs = [];
      for (let k = 0; k < pts.length; k++) {
        const [x0, y0] = pts[k];
        const [x1, y1] = pts[(k + 1) % pts.length];
        if (y0 <= y !== y1 <= y) xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) this.rect(Math.round(xs[k]), y, Math.round(xs[k + 1]) - Math.round(xs[k]) + 1, 1, c);
    }
  }
  // One-pixel border around everything drawn so far. Each border pixel is a
  // darkened version of the colour it sits next to, which reads much softer
  // than a single black line.
  outline() {
    const d = this.d;
    const edge = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        if (d[k]) continue;
        const near = (x > 0 && d[k - 1]) || (x < W - 1 && d[k + 1]) || (y > 0 && d[k - W]) || (y < H - 1 && d[k + W]);
        if (near) edge.push(k, near);
      }
    }
    for (let k = 0; k < edge.length; k += 2) {
      const c = edge[k + 1];
      const r = ((c & 255) * 0.3 + 18) | 0;
      const g = (((c >> 8) & 255) * 0.28 + 12) | 0;
      const b = (((c >> 16) & 255) * 0.32 + 24) | 0;
      d[edge[k]] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    }
    return this;
  }
  onto(dst) {
    const d = this.d;
    for (let k = 0; k < d.length; k++) if (d[k]) dst.d[k] = d[k];
  }
}

// 3x5 pixel font (drawn double size), enough for a few terminal-ish words.
const FONT = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111",
  F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", K: "101101110101101",
  L: "100100100100111", M: "101111111101101", N: "111101101101101", O: "010101101101010", P: "110101110100100",
  R: "110101110101101", S: "011100010001110", T: "111010010010010", U: "101101101101111", V: "101101101101010",
  W: "101101111111101", Y: "101101010010010", "1": "010110010010111", "+": "000010111010000", "!": "010010010000010",
  "?": "110001010000010", ">": "100010001010100", ".": "000000000000010", " ": "000000000000000",
}; // prettier-ignore
function bubble(L, str, x, y) {
  const w = str.length * 8 + 10;
  const left = Math.round(Math.min(W - w - 3, Math.max(3, x - w / 2)));
  L.rect(left + 2, y, w - 4, 20, C.bubble);
  L.rect(left, y + 2, w, 16, C.bubble);
  L.poly([[x - 4, y + 19], [x + 4, y + 19], [x, y + 25]], C.bubble); // prettier-ignore
  let cx = left + 6;
  for (const ch of str) {
    const g = FONT[ch] || FONT[" "];
    for (let k = 0; k < 15; k++) if (g[k] === "1") L.rect(cx + (k % 3) * 2, y + 5 + Math.floor(k / 3) * 2, 2, 2, C.line);
    cx += 8;
  }
}

// Scene state -------------------------------------------------------------------
const lerp = (a, b, u) => a + (b - a) * u;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = (u) => u * u * (3 - 2 * u);
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

const NIR_X = 262; // centred behind the keyboard
const HAND = { L: [NIR_X - 24, 165], R: [NIR_X + 2, 165] }; // where his hands type
const BASE = { L: 398, R: 474 }; // where the two arms are bolted to the desk
const SHOULDER_Y = 138; // top of each arm's base column
const UPPER = 36; // arm link lengths
const FORE = 32;
const REST = { L: [418, 124], R: [458, 124] }; // where the wrists hover when idle
const TOWER_X = 440; // middle of the workspace, under the camera
const BOBA_X = 340;
const KETTLE_X = 503;
const GLOBE_X = 531;

const S = {
  t: 0,
  nir: { look: -1, blink: 0, typing: true, mouth: "smile", arm: null, stretch: 0, cheer: 0, sip: 0 },
  robot: { L: { x: REST.L[0], y: REST.L[1], gap: 16 }, R: { x: REST.R[0], y: REST.R[1], gap: 16 }, recording: false, ok: 0 },
  boba: { x: BOBA_X, base: DESK, level: 1, held: false, pearls: 0, pour: 0 },
  kettle: { x: KETTLE_X, base: DESK, tilt: 0 },
  globe: { x: GLOBE_X, base: DESK, energy: 0, flakes: [] },
  blocks: [
    { x: 364, base: DESK, c: "red", home: 364 },
    { x: 418, base: DESK, c: "yellow", home: 418 },
    { x: 378, base: DESK, c: "blue", home: 378 },
  ],
  stacked: false,
  plant: { leaves: 5 },
  snow: [],
  says: null, // { who, text, until }
  busy: false,
};
for (let k = 0; k < 22; k++) S.globe.flakes.push({ x: rand(-10, 10), y: rand(-10, 6), vx: 0, vy: 0 });
for (let k = 0; k < 34; k++) S.snow.push({ side: k % 2, x: rand(0, 70), y: rand(40, FLOOR), v: rand(5, 11), sway: rand(0, 6) });

// Time: everything waits on the scene clock, so a hidden tab simply pauses.
const sleepers = [];
const tweens = [];
const carried = []; // things currently held by a hand
const sleep = (sec) => new Promise((done) => sleepers.push({ at: S.t + sec, done }));
function tween(obj, to, dur, curve = ease) {
  return new Promise((done) => {
    const from = {};
    for (const k in to) from[k] = obj[k];
    tweens.push({ obj, from, to, t0: S.t, dur, curve, done });
  });
}
function advance(dt) {
  S.t += dt;
  for (let k = tweens.length - 1; k >= 0; k--) {
    const tw = tweens[k];
    const u = clamp((S.t - tw.t0) / tw.dur, 0, 1);
    for (const key in tw.to) tw.obj[key] = lerp(tw.from[key], tw.to[key], tw.curve(u));
    if (u >= 1) {
      tweens.splice(k, 1);
      tw.done();
    }
  }
  for (const { arm, thing, drop } of carried) {
    thing.x = arm.x;
    thing.base = arm.y + drop;
  }
  for (let k = sleepers.length - 1; k >= 0; k--) {
    if (sleepers[k].at <= S.t) sleepers.splice(k, 1)[0].done();
  }
}
function say(who, str, sec = 2.4) {
  S.says = { who, text: str, until: S.t + sec };
}

// Drawing -----------------------------------------------------------------------
const frame = new Layer();
const tmp = new Layer();

function pine(x, h) {
  const top = FLOOR - 12 - h;
  const tiers = Math.max(3, Math.round(h / 30));
  const tierH = h / tiers;
  const reach = (h * 0.2) / (1.5 + (tiers - 1) * 5.5 + 10);
  const half = (y) => Math.round((1.5 + Math.floor(y / tierH) * 5.5 + ((y % tierH) / tierH) * 10) * reach);
  tmp.clear();
  tmp.rect(x - 3, FLOOR - 13, 7, 13, C.trunk);
  for (let y = 0; y < h; y++) tmp.rect(x - half(y), top + y, half(y) * 2 + 1, 1, C.pine);
  tmp.outline().onto(frame);
  for (let y = 0; y < h; y++) {
    const f = (y % tierH) / tierH;
    const w = half(y);
    if (f < 0.2 && y > tierH) frame.rect(x - w + 1, top + y, w * 2 - 1, 1, C.pineDark); // shadow under the tier above
    if (f > 0.35 && f < 0.6) frame.rect(x - w + 2, top + y, Math.max(1, Math.round(w * 0.5)), 1, C.pineLight);
    if (f > 0.78) {
      // Snow resting along the lower edge of each tier.
      frame.rect(x - w, top + y, Math.min(5, w), 1, C.snow);
      frame.rect(x + w - Math.min(4, w) + 1, top + y, Math.min(4, w), 1, C.snow);
      if (f > 0.9) frame.rect(x - Math.round(w * 0.4), top + y, Math.round(w * 0.5), 1, C.snowShade);
    }
  }
  frame.rect(x - 1, top - 2, 3, 3, C.snow);
}

function drawTrees(dt) {
  // Snowy ground under the trees, either side of the desk.
  frame.ellipse(34, FLOOR + 3, 44, 5, C.snowShade);
  frame.ellipse(30, FLOOR + 2, 36, 4, C.snow);
  frame.ellipse(W - 36, FLOOR + 3, 46, 5, C.snowShade);
  frame.ellipse(W - 40, FLOOR + 2, 36, 4, C.snow);
  pine(16, 100);
  pine(44, 160);
  pine(W - 46, 150);
  pine(W - 18, 96);
  // A little snow drifting down among them.
  for (const f of S.snow) {
    f.y += f.v * dt;
    if (f.y > FLOOR) {
      f.y = 36;
      f.x = rand(0, 70);
    }
    const x = (f.side ? W - 72 : 2) + f.x + Math.sin(S.t * 0.6 + f.sway) * 3;
    frame.px(x, f.y, C.snow);
    if (f.v > 9) frame.px(x + 1, f.y, C.snow);
  }
}

function drawDesk() {
  tmp.clear();
  tmp.rect(72, DESK, 478, 7, C.desk);
  tmp.rect(72, DESK + 7, 478, 5, C.deskEdge);
  tmp.rect(86, DESK + 12, 10, FLOOR - DESK - 12, C.deskDark);
  tmp.rect(526, DESK + 12, 10, FLOOR - DESK - 12, C.deskDark);
  tmp.outline().onto(frame);
  frame.rect(73, DESK, 476, 1, C.deskLight);
  for (let x = 82; x < 540; x += 41) frame.rect(x, DESK + 3, 17, 1, C.deskEdge); // wood grain
}

function drawPlant() {
  const x = 100;
  const sway = Math.sin(S.t * 0.7) * 2.2;
  tmp.clear();
  const stems = [[-14, -58], [12, -66], [0, -82], [-24, -38], [22, -42], [-8, -98], [16, -90], [-20, -74]].slice(0, S.plant.leaves); // prettier-ignore
  const tips = stems.map(([dx, dy]) => [x + dx + sway * (-dy / 80), DESK - 26 + dy]);
  for (const [tx, ty] of tips) tmp.line(x, DESK - 27, tx, ty, C.leafDark, 2);
  for (const [tx, ty] of tips) tmp.ellipse(tx, ty, 9.5, 6.5, C.leaf);
  tmp.poly([[x - 14, DESK - 24], [x + 14, DESK - 24], [x + 11, DESK - 1], [x - 11, DESK - 1]], C.pot); // prettier-ignore
  tmp.rect(x - 16, DESK - 29, 33, 6, C.pot);
  tmp.outline().onto(frame);
  for (const [tx, ty] of tips) {
    frame.ellipse(tx - 2, ty - 2, 5, 2.6, C.leafLight);
    frame.px(tx + 3, ty + 2, C.leafDark);
  }
  frame.rect(x - 15, DESK - 28, 31, 1, C.potLight);
  frame.rect(x - 11, DESK - 22, 3, 19, C.potLight);
  frame.rect(x + 6, DESK - 23, 5, 21, C.potDark);
}

function drawScotty() {
  // A CMU Scotty plush, tartan scarf and all.
  const x = 138;
  const twitch = Math.sin(S.t * 0.9) > 0.97 ? 2 : 0;
  tmp.clear();
  tmp.ellipse(x + 4, DESK - 10, 13, 8, C.scotty);
  tmp.rect(x - 8, DESK - 6, 5, 6, C.scotty);
  tmp.rect(x + 11, DESK - 6, 5, 6, C.scotty);
  tmp.poly(
    [
      [x + 15, DESK - 14],
      [x + 20, DESK - 25],
      [x + 19, DESK - 12],
    ],
    C.scotty
  ); // tail // prettier-ignore
  tmp.disc(x - 6, DESK - 20, 7.5, C.scotty);
  tmp.rect(x - 17, DESK - 19, 8, 6, C.scotty); // snout
  tmp.poly([[x - 11, DESK - 25], [x - 9, DESK - 34 - twitch], [x - 5, DESK - 26]], C.scotty); // prettier-ignore
  tmp.poly(
    [
      [x - 4, DESK - 26],
      [x - 1, DESK - 34],
      [x + 2, DESK - 24],
    ],
    C.scotty
  );
  tmp.outline().onto(frame);
  frame.rect(x - 11, DESK - 14, 13, 4, C.tartan);
  frame.rect(x - 4, DESK - 10, 4, 7, C.tartan);
  frame.rect(x - 8, DESK - 13, 1, 2, C.gold);
  frame.rect(x - 3, DESK - 13, 1, 2, C.gold);
  frame.rect(x - 4, DESK - 7, 4, 1, C.gold);
  frame.rect(x - 9, DESK - 23, 2, 2, C.white); // eye
  frame.rect(x - 18, DESK - 19, 2, 2, C.line); // nose
  frame.ellipse(x + 3, DESK - 13, 8, 2, C.scottyLight);
  frame.rect(x - 16, DESK - 15, 5, 1, C.scottyLight); // beard
}

function drawLaptop() {
  tmp.clear();
  tmp.poly([[206, DESK - 5], [264, DESK - 5], [268, DESK - 1], [202, DESK - 1]], C.laptopLight); // prettier-ignore
  tmp.poly(
    [
      [150, 118],
      [210, 118],
      [222, DESK - 3],
      [162, DESK - 3],
    ],
    C.laptop
  );
  tmp.outline().onto(frame);
  frame.poly(
    [
      [155, 122],
      [207, 122],
      [217, DESK - 7],
      [165, DESK - 7],
    ],
    C.laptopDark
  );
  frame.poly(
    [
      [157, 124],
      [205, 124],
      [214, DESK - 9],
      [166, DESK - 9],
    ],
    C.laptop
  );
  frame.poly(
    [
      [158, 125],
      [200, 125],
      [201, 128],
      [159, 128],
    ],
    C.laptopLight
  ); // sheen
  for (let x = 226; x < 262; x += 5) frame.rect(x, DESK - 4, 3, 1, C.laptopDark);
  // </> on the lid
  const lx = 186;
  const ly = 146;
  frame.line(lx - 16, ly, lx - 10, ly - 6, C.logo, 2);
  frame.line(lx - 16, ly, lx - 10, ly + 6, C.logo, 2);
  frame.line(lx - 3, ly + 8, lx + 3, ly - 8, C.logo, 2);
  frame.line(lx + 16, ly, lx + 10, ly - 6, C.logo, 2);
  frame.line(lx + 16, ly, lx + 10, ly + 6, C.logo, 2);
  if (Math.sin(S.t * 2.2) > 0) frame.rect(170, DESK - 13, 2, 2, C.green); // power light
}

function ik(sx, sy, tx, ty, l1, l2, bend) {
  let dx = tx - sx;
  let dy = ty - sy;
  let d = Math.hypot(dx, dy) || 0.001;
  const max = l1 + l2 - 0.5;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  }
  const aim = Math.atan2(dy, dx);
  const fold = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  // bend = 0 means "elbow up": take whichever of the two solutions is higher.
  const a = bend ? aim + bend * fold : Math.sin(aim + fold) < Math.sin(aim - fold) ? aim + fold : aim - fold;
  return [sx + Math.cos(a) * l1, sy + Math.sin(a) * l1, sx + dx, sy + dy];
}

function drawNir() {
  const n = S.nir;
  const bx = NIR_X;
  const hx = bx + Math.round(n.look * 2);
  const hy = 88 - Math.round(n.stretch * 4) + (n.sip > 0.5 ? 2 : 0);
  const f = Math.round(n.look * 2); // the features slide a little further than the head turns

  // Body, behind the desk: neck, sloping shoulders, crew-neck sweater.
  tmp.clear();
  tmp.rect(bx - 8, 104, 17, 24, C.skin);
  tmp.poly([[bx - 12, 123], [bx + 12, 123], [bx + 40, 133], [bx - 40, 133]], C.sweater); // prettier-ignore
  tmp.ellipse(bx, 139, 41, 9, C.sweater);
  tmp.rect(bx - 41, 139, 83, 41, C.sweater);
  tmp.outline().onto(frame);
  frame.ellipse(bx, 125, 13, 4.5, C.sweaterDark); // collar
  frame.ellipse(bx, 123.5, 10, 3.4, C.skin);
  frame.rect(bx - 8, 112, 17, 10, C.skin);
  frame.rect(bx - 8, hy + 24, 17, 3, C.skinShade); // shadow under the jaw
  frame.rect(bx + 5, 115, 4, 8, C.skinShade);
  for (const [dx, dy] of [[-8, 121], [-7, 122], [-5, 123], [-3, 124], [-1, 125], [1, 125], [3, 124], [5, 123], [7, 122], [8, 121]]) frame.px(bx + dx, dy, C.gold); // prettier-ignore
  frame.rect(bx + 33, 145, 7, 32, C.sweaterDark);
  frame.rect(bx - 39, 146, 2, 28, C.sweaterLight);
  frame.ellipse(bx - 20, 133, 12, 1.6, C.sweaterLight); // light on the shoulder

  // Head: a tapered face with a firm jaw under a mop of curls.
  tmp.clear();
  tmp.ellipse(hx - 19, hy + 4, 3.5, 5.5, C.skin);
  tmp.ellipse(hx + 19, hy + 4, 3.5, 5.5, C.skin);
  tmp.ellipse(hx, hy, 18, 18, C.skin);
  tmp.poly([[hx - 18, hy], [hx - 17, hy + 10], [hx - 10, hy + 20], [hx - 4, hy + 23], [hx + 4, hy + 23], [hx + 10, hy + 20], [hx + 17, hy + 10], [hx + 18, hy]], C.skin); // prettier-ignore
  const curls = [[-14, -20, 9], [-4, -25, 10], [7, -25, 10], [16, -19, 9], [-11, -15, 7], [-2, -16, 7], [8, -15, 7], [-20, -10, 6], [20, -10, 6], [-21, -3, 4], [21, -3, 4], [-9, -31, 5], [3, -33, 5], [13, -29, 5]]; // prettier-ignore
  for (const [dx, dy, r] of curls) tmp.disc(hx + dx, hy + dy, r, C.hair);
  tmp.outline().onto(frame);
  for (const [dx, dy, r] of curls) {
    // A highlight arc on each curl and a darker tuck beneath it.
    const ax = hx + dx - r * 0.45;
    const ay = hy + dy - r * 0.45;
    frame.px(ax, ay + 1, C.hairLight);
    frame.px(ax + 1, ay, C.hairLight);
    if (r > 5) frame.rect(ax + 2, ay - 1, 2, 1, C.hairLight);
    frame.rect(hx + dx + r * 0.15, hy + dy + r * 0.5, 3, 1, C.hairDark);
    frame.px(hx + dx + r * 0.15 + 3, hy + dy + r * 0.5 - 1, C.hairDark);
  }
  frame.rect(hx - 21, hy + 3, 2, 3, C.skinShade);
  frame.rect(hx + 20, hy + 3, 2, 3, C.skinShade);
  frame.line(hx + 17, hy + 6, hx + 16, hy + 10, C.skinShade, 1); // shade just inside the far jaw
  frame.line(hx + 16, hy + 10, hx + 10, hy + 19, C.skinShade, 1);

  // Face: small dark eyes under straight brows, and a half-smile.
  const closed = n.blink > 0 || n.stretch > 0.5;
  for (const side of [-1, 1]) {
    const ex = hx + side * 8 + f;
    const brow = hy - 5 - Math.round(n.cheer);
    frame.rect(ex - 4, brow, 9, 2, C.hair);
    frame.px(ex + side * 5, brow + 1, C.hair); // tapering at the outside
    if (closed) frame.rect(ex - 2, hy + 2, 5, 1, C.hair);
    else {
      frame.rect(ex - 2, hy - 1, 5, 1, C.hair); // upper lid
      frame.rect(ex - 1, hy, 3, 4, C.eye);
      frame.px(ex - 1, hy + 1, C.white);
    }
  }
  const mx = hx + f;
  const my = hy + 15;
  frame.rect(mx + (n.look < 0 ? -1 : 1), hy + 5, 1, 4, C.skinShade); // nose
  frame.rect(mx - 1, hy + 9, 3, 1, C.skinShade);
  if (n.mouth === "sip") {
    frame.disc(mx + 4, my, 1.8, C.mouth);
  } else if (n.mouth === "o") {
    frame.ellipse(mx, my + 1, 2.4, 3, C.mouth);
  } else if (n.mouth === "grin") {
    // A wide smile showing teeth.
    frame.rect(mx - 6, my - 1, 13, 1, C.mouth);
    frame.rect(mx - 6, my, 13, 2, C.mouth);
    frame.rect(mx - 5, my, 11, 3, C.white);
    frame.px(mx - 5, my + 2, C.mouth);
    frame.px(mx + 5, my + 2, C.mouth);
    frame.rect(mx - 4, my + 3, 9, 1, C.mouth);
  } else {
    frame.rect(mx - 4, my, 9, 1, C.mouth);
    frame.px(mx - 5, my - 1, C.mouth);
    frame.px(mx + 5, my - 1, C.mouth);
    frame.rect(mx - 2, my + 2, 5, 1, C.skinShade); // lower lip
  }
}

// One sleeve. The elbow is a blend of the two ways the arm could fold (w = 0 or
// 1), so in between it reads as foreshortened and never snaps between them.
function sleeve(L, sx, sy, tx, ty, w) {
  const a = ik(sx, sy, tx, ty, 30, 30, -1);
  const b = ik(sx, sy, tx, ty, 30, 30, 1);
  const ex = lerp(a[0], b[0], w);
  const ey = lerp(a[1], b[1], w);
  const [, , hx, hy] = a;
  L.line(sx, sy, ex, ey, C.sweater, 13);
  L.line(ex, ey, lerp(ex, hx, 0.78), lerp(ey, hy, 0.78), C.sweater, 12);
  L.disc(hx, hy, 5.6, C.skin);
  return [ex, ey, hx, hy];
}

function drawNirArms() {
  const n = S.nir;
  const bx = NIR_X;
  const [lx, ly] = HAND.L;
  const [rx, ry] = HAND.R;
  tmp.clear();
  const up = n.stretch;
  const loose = Math.min(1, up * 4);
  const tap = n.typing && Math.floor(S.t * 7) % 2 ? 2 : 0;
  const cuffs = [];
  cuffs.push(sleeve(tmp, bx - 35, 138, lerp(lx, bx - 46, up), lerp(ly - tap, 58, up), lerp(0.55, 0.5, loose)));
  if (n.arm) cuffs.push(sleeve(tmp, bx + 35, 138, n.arm.x, n.arm.y, 0));
  else if (up > 0.02) cuffs.push(sleeve(tmp, bx + 35, 138, lerp(rx, bx + 46, up), lerp(ry, 58, up), lerp(0.15, 0.5, loose)));
  else cuffs.push(sleeve(tmp, bx + 35, 138, lerp(rx, bx + 50, n.cheer), lerp(ry + tap, 94, n.cheer), lerp(0.15, 1, n.cheer))); // a fist pump when a run succeeds
  tmp.outline().onto(frame);
  for (const [ex, ey, hx, hy] of cuffs) {
    frame.line(lerp(ex, hx, 0.7), lerp(ey, hy, 0.7), lerp(ex, hx, 0.76), lerp(ey, hy, 0.76), C.sweaterLight, 9); // cuff
    frame.rect(hx - 3, hy - 3, 3, 2, C.skinLight);
  }
}

// The camera: a single stand on the desk with a camera looking down at the
// workspace, as on a simple data-collection setup.
function drawCamera() {
  const r = S.robot;
  const x = TOWER_X;
  tmp.clear();
  tmp.rect(x - 11, DESK - 3, 23, 3, C.joint); // foot
  tmp.rect(x - 1, 74, 3, DESK - 76, C.rail); // pole
  tmp.rect(x - 12, 60, 25, 14, C.joint); // camera body
  tmp.rect(x - 5, 74, 11, 5, C.joint); // lens barrel
  tmp.outline().onto(frame);
  frame.rect(x, 80, 1, DESK - 84, C.railDark);
  frame.rect(x - 10, 62, 21, 2, C.jointLight);
  frame.rect(x - 3, 77, 7, 2, C.lens);
  // Light: red while a run is being recorded, a slow green blink otherwise.
  const on = r.recording ? Math.floor(S.t * 3) % 2 : Math.sin(S.t * 1.5) > 0.6;
  frame.rect(x + 7, 67, 3, 3, on ? (r.recording ? C.red : C.green) : C.line);
  if (r.ok > 0) frame.rect(x - 12, 55, 25, 2, C.green); // success
}

// One arm: a base column bolted to the desk, an upper arm and forearm, and a
// parallel gripper that always points down.
function drawArm(arm, side) {
  const sx = side < 0 ? BASE.L : BASE.R;
  const [ex, ey, hx, hy] = ik(sx, SHOULDER_Y, arm.x, arm.y, UPPER, FORE, 0);
  tmp.clear();
  tmp.rect(sx - 12, DESK - 4, 25, 4, C.joint); // base plate
  tmp.rect(sx - 7, SHOULDER_Y + 4, 15, DESK - SHOULDER_Y - 8, C.arm); // base column
  tmp.line(sx, SHOULDER_Y, ex, ey, C.arm, 9);
  tmp.line(ex, ey, hx, hy, C.arm, 7);
  tmp.disc(sx, SHOULDER_Y, 6.5, C.joint);
  tmp.disc(ex, ey, 5.2, C.joint);
  tmp.disc(hx, hy, 4, C.joint);
  // Gripper: a palm block with two fingers that slide apart.
  const g = arm.gap / 2;
  tmp.rect(hx - g - 3, hy + 3, arm.gap + 7, 5, C.joint);
  tmp.rect(hx - g - 3, hy + 8, 4, 10, C.joint);
  tmp.rect(hx + g, hy + 8, 4, 10, C.joint);
  tmp.outline().onto(frame);
  // Shading and details, drawn over the outlined silhouette.
  frame.rect(sx + 3, SHOULDER_Y + 6, 4, DESK - SHOULDER_Y - 11, C.armShade);
  frame.rect(sx - 7, DESK - 12, 15, 2, C.joint);
  frame.line(sx + 1, SHOULDER_Y + 2, ex + 1, ey + 2, C.armShade, 2);
  frame.line(ex + 1, ey + 2, hx + 1, hy + 1, C.armShade, 2);
  frame.disc(sx, SHOULDER_Y, 6.5, C.joint);
  frame.disc(ex, ey, 5.2, C.joint);
  frame.disc(hx, hy, 4, C.joint);
  frame.disc(sx - 1, SHOULDER_Y - 1, 2.4, C.jointLight);
  frame.disc(ex - 1, ey - 1, 1.8, C.jointLight);
  frame.rect(hx - g - 2, hy + 14, 2, 4, C.pad); // finger pads
  frame.rect(hx + g, hy + 14, 2, 4, C.pad);
  // Wrist camera, a small box on the forearm.
  const cx = Math.round(lerp(ex, hx, 0.62));
  const cy = Math.round(lerp(ey, hy, 0.62)) - 6;
  frame.rect(cx - 3, cy - 2, 7, 5, C.joint);
  frame.rect(cx - 1, cy, 3, 2, C.lens);
}

function drawBlocks() {
  for (const b of S.blocks) {
    const x = Math.round(b.x);
    const y = Math.round(b.base);
    tmp.clear();
    tmp.rect(x - 6, y - 12, 12, 12, C[b.c]);
    tmp.outline().onto(frame);
    frame.rect(x - 6, y - 12, 12, 2, C[`${b.c}Light`]);
    frame.rect(x - 6, y - 12, 2, 9, C[`${b.c}Light`]);
  }
}

function drawBoba() {
  const b = S.boba;
  const x = Math.round(b.x);
  const base = Math.round(b.base);
  tmp.clear();
  tmp.poly([[x - 11, base - 30], [x + 11, base - 30], [x + 8, base - 1], [x - 8, base - 1]], C.cup); // prettier-ignore
  tmp.ellipse(x, base - 32, 12, 4.5, C.cup); // dome lid
  tmp.line(x + 2, base - 8, x + 6, base - 50, C.straw, 4);
  tmp.outline().onto(frame);
  // Tea, up to its level, with pearls settled at the bottom.
  const top = base - 3 - Math.round(24 * b.level);
  for (let y = top; y < base - 1; y++) {
    const half = Math.round(lerp(10, 7, (y - (base - 30)) / 29));
    frame.rect(x - half, y, half * 2 + 1, 1, y < top + 2 ? C.teaLight : C.tea);
  }
  if (b.level > 0.05) {
    for (const [dx, dy] of [[-5, -4], [0, -3], [5, -4], [-3, -8], [3, -8], [-6, -11], [0, -12], [6, -11]]) frame.disc(x + dx, base + dy, 1.5, C.pearl); // prettier-ignore
  }
  frame.rect(x - 8, base - 26, 2, 18, C.white); // shine on the cup
  frame.line(x + 2, base - 8, x + 6, base - 50, C.straw, 4);
  frame.line(x + 1, base - 8, x + 5, base - 50, C.strawLight, 1);
  if (b.pearls > 0) {
    for (const off of [0, 0.5]) {
      const u = (S.t * 1.4 + off) % 1; // pearls climbing the straw during a sip
      frame.disc(lerp(x + 2, x + 6, u), lerp(base - 10, base - 48, u), 1.4, C.pearl);
    }
  }
  // Spill-O-Not: a tiny level light clipped to the rim. Red when low, green when full.
  frame.rect(x - 14, base - 30, 4, 5, C.joint);
  frame.rect(x - 13, base - 29, 2, 2, b.level > 0.85 ? C.green : b.level < 0.3 ? C.red : C.yellow);
}

function drawKettle() {
  const k = S.kettle;
  const x = Math.round(k.x);
  const base = Math.round(k.base);
  const dip = Math.round(k.tilt * 7); // tilting lowers the spout side
  tmp.clear();
  tmp.poly([[x - 8, base - 16 + dip], [x + 8, base - 16], [x + 10, base - 1], [x - 10, base - 1 + dip * 0.4]], C.kettle); // prettier-ignore
  tmp.rect(x - 5, base - 19 + dip * 0.5, 11, 3, C.kettleDark); // lid
  tmp.rect(x - 1, base - 22 + dip * 0.5, 3, 3, C.kettleDark);
  tmp.line(x - 9, base - 5 + dip * 0.5, x - 17, base - 13 + dip * 1.4, C.kettle, 3); // spout
  tmp.line(x + 9, base - 14, x + 15, base - 9, C.kettleDark, 2); // handle
  tmp.line(x + 15, base - 9, x + 10, base - 3, C.kettleDark, 2);
  tmp.outline().onto(frame);
  frame.rect(x - 6, base - 13 + dip * 0.6, 2, 9, C.kettleLight);
  frame.rect(x - 9, base - 5 + dip * 0.2, 19, 1, C.kettleDark);
  if (S.boba.pour > 0) {
    // The stream, from the spout tip down into the cup.
    const sx = x - 18;
    const sy = base - 12 + dip * 1.4;
    for (let y = sy; y < S.boba.base - 30; y++)
      frame.rect(sx - Math.round(((y - sy) / 30) * 2), y, 2, 1, (y + Math.floor(S.t * 20)) % 5 ? C.tea : C.teaLight);
  }
}

function drawGlobe(dt) {
  const g = S.globe;
  const x = Math.round(g.x);
  const base = Math.round(g.base);
  const cy = base - 20;
  tmp.clear();
  tmp.disc(x, cy, 13, C.glass);
  tmp.poly([[x - 10, base - 9], [x + 10, base - 9], [x + 12, base - 1], [x - 12, base - 1]], C.deskDark); // prettier-ignore
  tmp.outline().onto(frame);
  frame.rect(x - 11, base - 6, 23, 2, C.gold);
  // Inside: the Space Needle and a couple of pines, on a snowy mound.
  frame.ellipse(x, cy + 9, 10, 3, C.snow);
  frame.rect(x - 1, cy - 6, 2, 15, C.needle);
  frame.line(x - 1, cy + 2, x - 4, cy + 9, C.needle, 1);
  frame.line(x + 1, cy + 2, x + 4, cy + 9, C.needle, 1);
  frame.ellipse(x, cy - 6, 6, 1.6, C.needle);
  frame.rect(x - 3, cy - 9, 6, 2, C.needle);
  frame.rect(x, cy - 13, 1, 4, C.needle);
  frame.px(x, cy - 14, C.red);
  for (const px of [-8, 8]) {
    frame.poly([[x + px, cy], [x + px + 3, cy + 7], [x + px - 3, cy + 7]], C.pine); // prettier-ignore
    frame.px(x + px, cy + 2, C.snow);
  }
  frame.ellipse(x - 5, cy - 6, 3.5, 2, C.glassLight); // glint
  // Snow: drifts down gently, swirls after a shake.
  g.energy = Math.max(0, g.energy - dt * 0.1);
  for (const f of g.flakes) {
    f.vx += rand(-1, 1) * dt * (3 + 120 * g.energy);
    f.vy += (rand(-1, 1) * 120 * g.energy + 2.4) * dt;
    f.vx *= 1 - 2 * dt;
    f.vy = clamp(f.vy * (1 - 1.5 * dt), -18, 6);
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (f.y > 8) {
      if (g.energy > 0.05) f.vy = -Math.abs(f.vy);
      else {
        f.y = -11;
        f.vy = 0;
        f.x = rand(-10, 10);
      }
    }
    const r = Math.hypot(f.x, f.y);
    if (r > 11.4) {
      f.x *= 11.4 / r;
      f.y *= 11.4 / r;
      f.vx *= -0.4;
      f.vy *= -0.4;
    }
    frame.px(x + f.x, cy + f.y, C.white);
  }
}

function drawSays() {
  if (!S.says || S.says.until < S.t) return;
  tmp.clear();
  if (S.says.who === "nir") bubble(tmp, S.says.text, NIR_X + 6, 14);
  else bubble(tmp, S.says.text, TOWER_X, 24);
  tmp.outline().onto(frame);
}

function draw(dt) {
  frame.clear();
  drawTrees(dt);
  drawNir();
  drawCamera();
  drawDesk();
  drawPlant();
  drawScotty();
  drawLaptop();
  drawKettle();
  drawGlobe(dt);
  drawBlocks();
  if (!S.boba.held) drawBoba();
  drawArm(S.robot.L, -1);
  drawArm(S.robot.R, 1);
  drawNirArms();
  if (S.boba.held) drawBoba(); // in his hand: the cup goes in front of his sleeve
  drawSays();
}

// Choreography --------------------------------------------------------------------
const hands = S.robot;
const reach = (arm, x, y, sec = 1.4) => tween(arm, { x, y }, sec);
const grip = (arm, gap) => tween(arm, { gap }, 0.35);
const home = (which, sec = 1.3) => reach(hands[which], REST[which][0], REST[which][1], sec);

// Carry something with a hand: it follows the gripper until released.
function carry(arm, thing, drop) {
  const link = { arm, thing, drop };
  carried.push(link);
  return () => carried.splice(carried.indexOf(link), 1);
}

// Each kind of thing: how far its base hangs below the wrist, and how wide to grip.
const BLOCK = [19, 12];
const CUP = [36, 20];
const KETTLE = [24, 18];
const GLOBE = [34, 22];
const LIFT = 22; // how far above a thing the gripper approaches from

async function pick(which, thing, drop, gap) {
  const arm = hands[which];
  await grip(arm, gap + 6);
  await reach(arm, thing.x, thing.base - drop - LIFT, 1.3);
  await reach(arm, thing.x, thing.base - drop, 0.8);
  await grip(arm, gap);
  return carry(arm, thing, drop);
}
async function place(which, release, x, base, drop, gap) {
  const arm = hands[which];
  await reach(arm, x, base - drop - LIFT, 1.5);
  await reach(arm, x, base - drop, 0.8);
  release();
  await grip(arm, gap + 6);
  await reach(arm, x, base - drop - LIFT, 0.7);
}

async function runStack() {
  say("nir", "> RUN STACK");
  await sleep(1.6);
  for (let level = 0; level < 3; level++) {
    const b = S.blocks[level];
    const which = b.x < TOWER_X ? "L" : "R";
    const release = await pick(which, b, ...BLOCK);
    await place(which, release, TOWER_X, DESK - level * 12, ...BLOCK);
    b.x = TOWER_X;
    b.base = DESK - level * 12;
    await home(which, 1.1);
  }
  S.stacked = true;
}

async function runUnstack() {
  say("nir", "> RUN RESET");
  await sleep(1.6);
  for (let level = 2; level >= 0; level--) {
    const b = S.blocks[level];
    const which = b.home < TOWER_X ? "L" : "R";
    const release = await pick(which, b, ...BLOCK);
    await place(which, release, b.home, DESK, ...BLOCK);
    b.x = b.home;
    b.base = DESK;
    await home(which, 1.1);
  }
  S.stacked = false;
}

async function runBoba() {
  const n = S.nir;
  const b = S.boba;
  say("nir", "BOBA?");
  await sleep(1.4);
  // The left arm lifts the cup and holds it out; Nir takes it from the gripper.
  const release = await pick("L", b, ...CUP);
  await reach(hands.L, 349, 104, 1.6);
  n.arm = { x: HAND.R[0], y: HAND.R[1] };
  await tween(n.arm, { x: 349, y: 104 + CUP[0] - 13 }, 1.3);
  release();
  const letGo = carry(n.arm, b, 13);
  b.held = true;
  await grip(hands.L, CUP[1] + 6);
  home("L", 1.5);
  n.look = 0.3;
  n.mouth = "grin";
  await tween(n.arm, { x: NIR_X + 1, y: 144 }, 1.4);
  n.mouth = "sip";
  n.sip = 1;
  b.pearls = 1;
  await tween(b, { level: Math.max(0, b.level - 0.27) }, 2.8, (u) => u);
  b.pearls = 0;
  n.sip = 0;
  n.mouth = "smile";
  await sleep(0.5);
  // He sets it back down on the desk himself.
  await tween(n.arm, { x: BOBA_X, y: DESK - 13 }, 1.5);
  letGo();
  b.held = false;
  b.x = BOBA_X;
  b.base = DESK;
  await tween(n.arm, { x: HAND.R[0], y: HAND.R[1] }, 1.2);
  n.arm = null;
}

async function runRefill() {
  const b = S.boba;
  const k = S.kettle;
  say("nir", "> RUN REFILL");
  await sleep(1.6);
  // Left arm brings the cup over and steadies it; right arm pours.
  const releaseCup = await pick("L", b, ...CUP);
  await reach(hands.L, 414, DESK - CUP[0] - 10, 1.5);
  await reach(hands.L, 414, DESK - CUP[0], 0.7);
  const releaseKettle = await pick("R", k, ...KETTLE);
  await reach(hands.R, 436, 94, 1.7);
  await tween(k, { tilt: 1 }, 0.6);
  b.pour = 1;
  // Pour until the Spill-O-Not light goes green, then stop.
  await tween(b, { level: 1 }, 3.4, (u) => u);
  b.pour = 0;
  await tween(k, { tilt: 0 }, 0.5);
  await place("R", releaseKettle, KETTLE_X, DESK, ...KETTLE);
  k.x = KETTLE_X;
  k.base = DESK;
  home("R", 1.2);
  await reach(hands.L, 414, DESK - CUP[0] - 12, 0.7);
  await place("L", releaseCup, BOBA_X, DESK, ...CUP);
  b.x = BOBA_X;
  b.base = DESK;
  await home("L", 1.2);
}

async function runGlobe() {
  const g = S.globe;
  say("nir", "> RUN SNOW");
  await sleep(1.6);
  const release = await pick("R", g, ...GLOBE);
  await reach(hands.R, 506, 100, 1.4);
  for (let k = 0; k < 5; k++) {
    await reach(hands.R, 495, 100, 0.22);
    g.energy = 1;
    await reach(hands.R, 517, 100, 0.22);
  }
  await place("R", release, GLOBE_X, DESK, ...GLOBE);
  g.x = GLOBE_X;
  g.base = DESK;
  await home("R", 1.2);
}

async function wave() {
  await Promise.all([reach(hands.L, 408, 92, 0.9), reach(hands.R, 466, 92, 0.9)]);
  for (let k = 0; k < 3; k++) {
    await Promise.all([grip(hands.L, 24), grip(hands.R, 24)]);
    await Promise.all([grip(hands.L, 10), grip(hands.R, 10)]);
  }
  await Promise.all([grip(hands.L, 16), grip(hands.R, 16)]);
  await Promise.all([home("L"), home("R")]);
}

async function cheer() {
  S.robot.ok = 1;
  S.nir.mouth = "grin";
  say("robot", "REWARD +1", 2.2);
  await tween(S.nir, { cheer: 1 }, 0.4);
  await sleep(1.3);
  await tween(S.nir, { cheer: 0 }, 0.5);
  S.nir.mouth = "smile";
  S.robot.ok = 0;
}

async function stretch() {
  S.nir.typing = false;
  S.nir.mouth = "o";
  await tween(S.nir, { stretch: 1, look: 0 }, 1.2);
  await sleep(1.6);
  await tween(S.nir, { stretch: 0, look: -1 }, 1.1);
  S.nir.mouth = "smile";
  S.nir.typing = true;
}

// One run: Nir looks over, the arms work, the run is rewarded, back to typing.
async function runTask(task) {
  if (S.busy) return;
  S.busy = true;
  const n = S.nir;
  await sleep(0.8);
  n.typing = false;
  await tween(n, { look: 1 }, 0.7);
  S.robot.recording = true;
  await task();
  S.robot.recording = false;
  await cheer();
  await tween(n, { look: -1 }, 0.9);
  n.typing = true;
  S.busy = false;
}

// The long, slow loop: mostly ambient, with a task every half minute or so.
let turn = 0;
function nextTask() {
  if (S.boba.level < 0.3) return runRefill;
  const cycle = [S.stacked ? runUnstack : runStack, runBoba, runGlobe, runBoba];
  return cycle[turn++ % cycle.length];
}
async function life() {
  await sleep(5);
  for (;;) {
    await runTask(nextTask());
    await sleep(rand(14, 24));
    if (Math.random() < 0.4 && !S.busy) await stretch();
    await sleep(rand(4, 9));
    if (S.plant.leaves < 8 && Math.random() < 0.35) S.plant.leaves++;
  }
}
life();

// Blinking.
(async () => {
  for (;;) {
    await sleep(rand(2.5, 6));
    S.nir.blink = 1;
    await sleep(0.14);
    S.nir.blink = 0;
  }
})();

// Canvas ------------------------------------------------------------------------
const canvas = document.getElementById("scene");
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext("2d");
const image = ctx.createImageData(W, H);
const pixels = new Uint32Array(image.data.buffer);

function fit() {
  // A compact vignette in the middle of the page, not a full-width scene.
  // Scaled in quarter steps so it stays crisp; small screens scale smoothly.
  const cap = window.innerWidth >= 1800 ? 1.75 : 1.25;
  const want = Math.min((window.innerWidth * 0.92) / W, (window.innerHeight * 0.5) / H, cap);
  const even = Math.floor(want * 4) / 4;
  const crisp = even >= want * 0.8;
  const scale = crisp ? even : want;
  canvas.style.imageRendering = crisp ? "pixelated" : "auto";
  canvas.style.width = `${Math.round(W * scale)}px`;
  canvas.style.height = `${Math.round(H * scale)}px`;
}
window.addEventListener("resize", fit);
fit();

// Click the arms and the grippers snap at you; click anywhere else to run the
// next task now.
canvas.addEventListener("pointerdown", (e) => {
  if (S.busy) return;
  const r = canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * W;
  if (x > BASE.L - 20 && x < BASE.R + 20) runTask(wave);
  else runTask(nextTask());
});

let last = null;
function tick(ms) {
  const now = ms / 1000;
  const dt = last === null ? 1 / 60 : Math.min(0.1, now - last);
  last = now;
  advance(dt);
  draw(dt);
  pixels.set(frame.d);
  ctx.putImageData(image, 0, 0);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
