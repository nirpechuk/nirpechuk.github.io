// Concept: a floor.
// Dots knocked off the subject fall under gravity, bounce, and heap up on the
// floor like sand. When things go quiet the heap rebuilds it, a different way
// each time: leaping back in arcs, spiralling up, or sliding under its place
// and rising from the floor.

import * as THREE from "three";
import { createStage } from "./stage.mjs";

const GRAVITY = 9;
const REACH = 0.17; // how close the pointer's path must pass to knock a dot off
const BLAST = 0.6; // click blast radius
const QUIET = 1.3; // seconds of calm before a rebuild starts
const MODES = ["leap", "swirl", "rise"];

const HOME = 0;
const FALL = 1;
const PILE = 2;
const BACK = 3;

// With `?room=screen` there is no floor: the window is the room, and the dots
// fall all the way to its bottom edge. The camera holds still there, so the
// edges of the room stay on the edges of the window.
const ROOM = new URLSearchParams(location.search).get("room") === "screen";

const stage = await createStage({ parallax: ROOM ? 0 : 0.35, pinTagline: true });
const { count, home, spacing, area, depth, cursor, put } = stage;

// Floor: a line under the subject, and a height field so dots heap up on it.
let floorY = stage.floorY;
const FLOOR_X0 = -9; // the height field covers more floor than any screen shows
const FLOOR_X1 = 9;
const Z_WALL = 0.7; // front and back walls, so nothing flies at the camera
const SPAN = stage.maxX - stage.minX;
const BIN = spacing; // bin width
const CELL = area / BIN; // height one dot adds to its bin, so a heap keeps the subject's area
const BINS = Math.ceil((FLOOR_X1 - FLOOR_X0) / BIN);
const heap = new Float32Array(BINS);
const binOf = (x) => Math.min(BINS - 1, Math.max(0, Math.floor((x - FLOOR_X0) / BIN)));

const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: stage.mute }));
if (!stage.portrait && !ROOM) stage.scene.add(line); // the portrait fades out instead of standing on a line

const pos = new Float32Array(home);
const vel = new Float32Array(count * 3);
const from = new Float32Array(count * 3); // where a returning dot set off from
const state = new Uint8Array(count);
const bounces = new Uint8Array(count);
const bin = new Int32Array(count);
const mode = new Uint8Array(count);
const leaveAt = new Float32Array(count);
const takes = new Float32Array(count);
const seed = new Float32Array(count);
for (let i = 0; i < count; i++) seed[i] = Math.random();

// The room is the window: walls at its left and right edges, a ceiling at the
// top. Dots bounce off them instead of leaving the screen.
let wallL = -3;
let wallR = 3;
let ceiling = 2;
stage.onResize(() => {
  const view = stage.view();
  // In the room the heap runs right up to the window's edges, and a touch past them.
  wallR = Math.min(FLOOR_X1 - 0.1, view.halfWidth + (ROOM ? 0.02 : -0.06));
  wallL = -wallR;
  ceiling = view.top - 0.06;
  if (ROOM) {
    // The floor is the bottom edge of the window; a resize carries the heap with it.
    const next = -view.top - CELL;
    for (let i = 0; i < count; i++) {
      if (state[i] !== PILE) continue;
      pos[i * 3 + 1] += next - floorY;
      put(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], 1, 1);
    }
    floorY = next;
  }
  line.geometry.setFromPoints([new THREE.Vector3(wallL, floorY - 0.008, 0), new THREE.Vector3(wallR, floorY - 0.008, 0)]);
});

// Come to rest on the heap: roll downhill to a stable bin, then sit on top.
function settle(i, x, drift) {
  const lo = binOf(wallL);
  const hi = binOf(wallR);
  let b = Math.min(hi, Math.max(lo, binOf(x)));
  for (let n = 0; n < 60; n++) {
    const l = b > lo ? heap[b - 1] : Infinity; // the walls hold the heap in
    const r = b < hi ? heap[b + 1] : Infinity;
    const here = heap[b] - BIN * 0.7; // slope a neighbour must beat to roll (about 35 degrees)
    if (l < here && r < here) b += drift > 0 || (drift === 0 && Math.random() < 0.5) ? 1 : -1;
    else if (l < here) b -= 1;
    else if (r < here) b += 1;
    else break;
  }
  const j = i * 3;
  pos[j] = FLOOR_X0 + (b + Math.random()) * BIN;
  pos[j + 1] = floorY + heap[b] + (Math.random() - 0.5) * CELL * 0.6;
  // In the room, only towards the camera: a dot further back sits inside the window's edge.
  pos[j + 2] = (ROOM ? Math.random() * 0.5 : Math.random() - 0.5) * depth;
  vel[j] = vel[j + 1] = vel[j + 2] = 0;
  heap[b] += CELL;
  bin[i] = b;
  state[i] = PILE;
}

function knock(i, vx, vy, vz) {
  if (state[i] === PILE) heap[bin[i]] = Math.max(0, heap[bin[i]] - CELL);
  const j = i * 3;
  vel[j] = vx;
  vel[j + 1] = vy;
  vel[j + 2] = vz;
  state[i] = FALL;
  bounces[i] = 0;
}

// Start as a heap of sand; the first rebuild assembles the subject from it.
for (let i = 0; i < count; i++) settle(i, home[i * 3] + (Math.random() - 0.5) * 0.5, 0);

let lastDisturbed = -1e9;
let rebuilds = 0;

// Send every heaped dot home using one of the rebuild styles.
function rebuild(t) {
  const m = rebuilds++ % MODES.length;
  for (let i = 0; i < count; i++) {
    if (state[i] !== PILE) continue;
    const j = i * 3;
    const s = seed[i];
    const across = (home[j] - stage.minX) / SPAN; // 0 at the subject's left edge
    const up = home[j + 1] - floorY;
    heap[bin[i]] = Math.max(0, heap[bin[i]] - CELL);
    from[j] = pos[j];
    from[j + 1] = pos[j + 1];
    from[j + 2] = pos[j + 2];
    mode[i] = m;
    state[i] = BACK;
    if (MODES[m] === "leap") {
      // The time-reverse of falling: launched so it peaks exactly at its place.
      leaveAt[i] = t + across * 1.3 + s * 0.3;
      takes[i] = Math.sqrt((2 * Math.max(0.05, home[j + 1] - pos[j + 1])) / GRAVITY);
    } else if (MODES[m] === "swirl") {
      leaveAt[i] = t + s * 0.9;
      takes[i] = 1.1 + 0.5 * s;
    } else {
      // Slide under its place, then rise; low dots first, so it grows upward.
      leaveAt[i] = t + s * 0.25;
      takes[i] = 0.55 + up * 0.8 + 0.45;
    }
  }
}

const ease = (u) => u * u * (3 - 2 * u);

stage.onClick = (cx, cy, t) => {
  for (let i = 0; i < count; i++) {
    if (state[i] !== HOME && state[i] !== PILE) continue;
    const j = i * 3;
    const dx = pos[j] - cx;
    const dy = pos[j + 1] - cy;
    const d = Math.hypot(dx, dy);
    if (d > BLAST) continue;
    const f = 1 - d / BLAST;
    const kick = (1.2 + 3.6 * Math.random()) * f;
    knock(i, (dx / (d + 0.03)) * kick, (dy / (d + 0.03)) * kick + 1.6 * f, (Math.random() - 0.5) * 1.5 * f);
  }
  lastDisturbed = t;
};

function step(t, dt) {
  let falling = 0;
  let heaped = 0;

  for (let i = 0; i < count; i++) {
    const j = i * 3;
    let st = state[i];

    if (st === HOME) {
      // Wiped off by the pointer: carried a little way along its motion, then gravity.
      if (cursor.sweeping && cursor.dist2(pos[j], pos[j + 1]) < REACH * REACH) {
        const carry = 0.12 + 0.3 * Math.random();
        knock(i, cursor.vx * carry + (Math.random() - 0.5) * 0.7, cursor.vy * carry + (Math.random() - 0.5) * 0.7 + 0.3, (Math.random() - 0.5) * 0.8);
        lastDisturbed = t;
        st = FALL;
      } else {
        continue;
      }
    }

    if (st === PILE) {
      heaped++;
      continue;
    }

    let x = pos[j];
    let y = pos[j + 1];
    let z = pos[j + 2];

    if (st === FALL) {
      falling++;
      let vx = vel[j];
      let vy = vel[j + 1] - GRAVITY * dt;
      let vz = vel[j + 2];
      const air = Math.exp(-0.5 * dt);
      vx *= air;
      vz *= air;
      x += vx * dt;
      y += vy * dt;
      z += vz * dt;
      // Walls and ceiling: bounce back in, losing most of the speed.
      if (x < wallL) {
        x = wallL;
        vx = Math.abs(vx) * 0.4;
      } else if (x > wallR) {
        x = wallR;
        vx = -Math.abs(vx) * 0.4;
      }
      if (y > ceiling) {
        y = ceiling;
        vy = -Math.abs(vy) * 0.3;
      }
      if (z < -Z_WALL) {
        z = -Z_WALL;
        vz = Math.abs(vz) * 0.4;
      } else if (z > Z_WALL) {
        z = Z_WALL;
        vz = -Math.abs(vz) * 0.4;
      }
      const surface = floorY + heap[binOf(x)];
      if (y <= surface && vy < 0) {
        if (-vy > 1.4 && bounces[i] < 2) {
          // A couple of dead bounces, like a grain rather than a ball.
          y = surface;
          vy = -vy * (0.16 + 0.2 * Math.random());
          vx = vx * 0.55 + (Math.random() - 0.5) * 0.5;
          vz *= 0.4;
          bounces[i]++;
        } else {
          settle(i, x, Math.sign(vx));
          put(i, pos[j], pos[j + 1], pos[j + 2], 1, 1);
          continue;
        }
      }
      pos[j] = x;
      pos[j + 1] = y;
      pos[j + 2] = z;
      vel[j] = vx;
      vel[j + 1] = vy;
      vel[j + 2] = vz;
      const gone = Math.min(1, (home[j + 1] - y) / 0.35 + Math.abs(x - home[j]) / 0.35);
      put(i, x, y, z, Math.max(0, gone), Math.max(0, gone));
      continue;
    }

    // BACK: an exact path from the heap to its place, so it lands dead on.
    const tau = t - leaveAt[i];
    if (tau <= 0) continue;
    const hx = home[j];
    const hy = home[j + 1];
    const hz = home[j + 2];
    const T = takes[i];
    const u = Math.min(1, tau / T);
    const s = seed[i];
    let heat;
    const kind = MODES[mode[i]];
    if (kind === "leap") {
      x = from[j] + (hx - from[j]) * u;
      y = from[j + 1] + (hy - from[j + 1]) * (2 * u - u * u); // ballistic: peaks at u = 1
      z = from[j + 2] + (hz - from[j + 2]) * u + Math.sin(Math.PI * u) * (s - 0.5) * 0.5;
      heat = 1 - u * u;
    } else if (kind === "swirl") {
      const e = ease(u);
      const ring = Math.sin(Math.PI * e) * (0.25 + 0.5 * s);
      const turn = s * 6.283 + (1 - e) * 7;
      x = from[j] + (hx - from[j]) * e + Math.cos(turn) * ring;
      y = from[j + 1] + (hy - from[j + 1]) * e + Math.sin(turn * 2) * ring * 0.15;
      z = from[j + 2] + (hz - from[j + 2]) * e + Math.sin(turn) * ring;
      heat = 1 - e;
    } else {
      const slide = 0.55 / T; // first part of the trip is along the floor
      if (u < slide) {
        const e = ease(u / slide);
        x = from[j] + (hx - from[j]) * e;
        y = from[j + 1] + (floorY - from[j + 1]) * e;
        z = from[j + 2] + (hz - from[j + 2]) * e;
      } else {
        const r = (u - slide) / (1 - slide);
        x = hx;
        y = floorY + (hy - floorY) * (1 - Math.pow(1 - r, 3));
        z = hz;
      }
      heat = 1 - u;
    }
    if (u >= 1) {
      x = hx;
      y = hy;
      z = hz;
      heat = 0;
      state[i] = HOME;
    }
    pos[j] = x;
    pos[j + 1] = y;
    pos[j + 2] = z;
    // Stay a speck until the last stretch, then resolve into its resting shape.
    put(i, x, y, z, Math.min(1, (1 - u) * 5), heat);
  }

  if (falling) lastDisturbed = t;
  if (heaped && !falling && t - lastDisturbed > QUIET) rebuild(t);
}

// Draw the starting heap once, then run. The first rebuild follows shortly.
for (let i = 0; i < count; i++) put(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], 1, 1);
lastDisturbed = -QUIET + 0.7;
stage.start(step);
