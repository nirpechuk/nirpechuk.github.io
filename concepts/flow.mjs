// Concept: flow field.
// Each dot is a small agent with a goal (its place in the subject). A passing
// cursor knocks dots loose; they fly free along a flow field for a moment, then
// steer home and stop dead. No springs, so nothing wobbles. On the name, colour
// shows how far a dot is from its goal.

import { createStage } from "./stage.mjs";

const REACH = 0.34; // how close the cursor's path must pass to knock a dot loose
const FREE_DRAG = 2.6; // 1/s, air drag while a dot is loose
const FLOW = 2.4; // flow-field strength while loose
const MAX_SPEED = 7; // homing speed cap, units/s
const WAVE_EVERY = 12; // seconds between "rollout" sweeps
const WAVE_TAKES = 3.2;

const REST = 0;
const HOMING = 1;
const LOOSE = 2;

const stage = await createStage({ flyRadius: 0.0085 });
const { count, home, spacing, cursor, put } = stage;
const SNAP = spacing * 0.2; // closer than this and slow enough: the dot is home

const pos = new Float32Array(count * 3);
const vel = new Float32Array(count * 3);
const seed = new Float32Array(count); // per-dot random in [0, 1)
const state = new Uint8Array(count);
const looseFor = new Float32Array(count); // seconds of free flight left
for (let i = 0; i < count; i++) {
  seed[i] = Math.random();
  // Start as noise: a wide cloud. Dots drift, then peel off and fly home.
  const a = Math.random() * Math.PI * 2;
  const r = 1.2 + Math.random() * 3.2;
  pos[i * 3] = Math.cos(a) * r;
  pos[i * 3 + 1] = Math.sin(a) * r * 0.6 + stage.midY;
  pos[i * 3 + 2] = (Math.random() - 0.5) * 4;
  state[i] = LOOSE;
  looseFor[i] = 0.25 + Math.random() * 1.3;
}

let burst = null;
stage.onClick = (x, y) => (burst = [x, y]);

let frontWas = -1e9;

function step(t, dt) {
  // Rollout wave: a front sweeps left to right and releases some resting dots.
  const phase = (t - 5) % WAVE_EVERY;
  const waving = t > 5 && phase < WAVE_TAKES;
  const span = stage.maxX - stage.minX + 0.4;
  const front = waving ? stage.minX - 0.2 + (phase / WAVE_TAKES) * span : -1e9;
  if (front < frontWas) frontWas = front;

  const speed = cursor.speed;
  const drag = Math.exp(-FREE_DRAG * dt);

  for (let i = 0; i < count; i++) {
    const j = i * 3;
    const s = seed[i];
    let st = state[i];
    let x = pos[j];
    let y = pos[j + 1];
    let z = pos[j + 2];
    let vx = vel[j];
    let vy = vel[j + 1];
    let vz = vel[j + 2];

    // The cursor only matters while it is moving: it knocks loose the dots near
    // the segment it swept through since the last step.
    if (cursor.sweeping && st !== LOOSE) {
      const d2 = cursor.dist2(x, y);
      if (d2 < REACH * REACH) {
        const f = 1 - Math.sqrt(d2) / REACH;
        // Thrown along the cursor's motion, spread in every direction, each dot differently.
        const carry = (0.25 + 0.6 * Math.random()) * f;
        const spread = (0.5 + 1.6 * Math.random()) * f * (0.4 + 0.12 * speed);
        const a = Math.random() * Math.PI * 2;
        vx = cursor.vx * carry + Math.cos(a) * spread;
        vy = cursor.vy * carry + Math.sin(a) * spread;
        vz = (Math.random() - 0.5) * (0.6 + 0.5 * speed) * f;
        st = LOOSE;
        looseFor[i] = 0.2 + 0.7 * Math.random() * (0.4 + f);
      }
    }

    if (burst) {
      const dx = x - burst[0];
      const dy = y - burst[1];
      const d = Math.sqrt(dx * dx + dy * dy) + 0.05;
      const impulse = (4.2 / (0.45 + d * 1.1)) * (0.55 + 0.9 * Math.random());
      vx += (dx / d + (Math.random() - 0.5) * 0.9) * impulse;
      vy += (dy / d + (Math.random() - 0.5) * 0.9) * impulse;
      vz += (Math.random() - 0.5) * impulse * 2.2;
      st = LOOSE;
      looseFor[i] = 0.3 + Math.random() * 0.9;
    }

    if (st === REST) {
      if (waving && home[j] >= frontWas && home[j] < front && s < 0.4) {
        vx = 0.5 + Math.random() * 1.4;
        vy = (Math.random() - 0.5) * 1.6;
        vz = (Math.random() - 0.5) * 1.6;
        st = LOOSE;
        looseFor[i] = 0.5 + Math.random() * 0.9;
      } else {
        continue; // at rest: nothing to simulate, nothing to redraw
      }
    }

    const hx = home[j];
    const hy = home[j + 1];
    const hz = home[j + 2];
    let ex = hx - x;
    let ey = hy - y;
    let ez = hz - z;
    let dist = Math.sqrt(ex * ex + ey * ey + ez * ez);

    if (st === LOOSE) {
      // Free flight: ballistic, carried by the flow field, slowed by drag.
      vx += FLOW * (Math.sin(y * 2.1 + t * 0.7) + 0.6 * Math.sin(x * 0.9 - t * 0.3)) * dt;
      vy += FLOW * (Math.sin(x * 1.5 - t * 0.5) + 0.5 * Math.cos(y * 2.6 + t * 0.4)) * dt;
      vz += FLOW * 0.6 * Math.sin((x + y) * 1.2 + t * 0.6) * dt;
      vx *= drag;
      vy *= drag;
      vz *= drag;
      looseFor[i] -= dt;
      if (looseFor[i] <= 0) st = HOMING;
    } else {
      // Homing: steer toward a velocity that points home and shrinks with
      // distance. Tuned past critical damping, so dots arrive without overshoot.
      const rate = 4.5 + 4 * s;
      const want = Math.min(MAX_SPEED, dist * rate) / (dist + 1e-6);
      const blend = 1 - Math.exp(-4.4 * rate * dt);
      vx += (ex * want - vx) * blend;
      vy += (ey * want - vy) * blend;
      vz += (ez * want - vz) * blend;
    }

    x += vx * dt;
    y += vy * dt;
    z += vz * dt;

    if (st === HOMING) {
      ex = hx - x;
      ey = hy - y;
      ez = hz - z;
      dist = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (dist < SNAP && vx * vx + vy * vy + vz * vz < 0.01) {
        x = hx;
        y = hy;
        z = hz;
        vx = vy = vz = 0;
        dist = 0;
        st = REST;
      }
    }

    pos[j] = x;
    pos[j + 1] = y;
    pos[j + 2] = z;
    vel[j] = vx;
    vel[j + 1] = vy;
    vel[j + 2] = vz;
    state[i] = st;

    // Size and colour follow the distance from home; a resting dot is untouched.
    const far = Math.min(1, Math.max(0, (dist - spacing) / 0.5));
    put(i, x, y, z, Math.min(1, dist / 0.08), far * far * (3 - 2 * far));
  }

  burst = null;
  frontWas = front;
}

stage.start(step);
