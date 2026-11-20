// Concept: shatter.
// The subject is pre-fractured into rigid shards. A passing pointer breaks
// shards off; they tumble in 3D as solid pieces (so they stay sharp), drift,
// then turn around and dock back into place. A click sends a shockwave through.

import * as THREE from "three";
import { createStage } from "./stage.mjs";

const REACH = 0.3; // how close the pointer's path must pass to break a shard off
const SHOCK = 1.7; // click shockwave radius

const SET = 0; // in place
const LOOSE = 1; // tumbling free
const DOCK = 2; // flying home

const stage = await createStage({ parallax: 1.2 });
const { count, home, cursor, put } = stage;

// Fracture: Voronoi cells around seed points picked from the dots themselves.
const SHARDS = Math.round(count / (stage.portrait ? 160 : 95));
const seedX = new Float32Array(SHARDS);
const seedY = new Float32Array(SHARDS);
const seedZ = new Float32Array(SHARDS);
for (let k = 0; k < SHARDS; k++) {
  const i = Math.floor(Math.random() * count);
  seedX[k] = home[i * 3];
  seedY[k] = home[i * 3 + 1];
  seedZ[k] = home[i * 3 + 2];
}
const owner = new Int32Array(count);
const size = new Int32Array(SHARDS);
for (let i = 0; i < count; i++) {
  const x = home[i * 3];
  const y = home[i * 3 + 1];
  const z = home[i * 3 + 2];
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < SHARDS; k++) {
    const dx = x - seedX[k];
    const dy = (y - seedY[k]) * 1.25; // slightly wide cells read as splinters
    const dz = z - seedZ[k];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  owner[i] = best;
  size[best]++;
}
// Dots grouped by shard, plus each shard's centre (C) and every dot's offset from it.
const first = new Int32Array(SHARDS + 1);
for (let k = 0; k < SHARDS; k++) first[k + 1] = first[k] + size[k];
const members = new Int32Array(count);
const fill = first.slice(0, SHARDS);
for (let i = 0; i < count; i++) members[fill[owner[i]]++] = i;
const C = new Float32Array(SHARDS * 3);
for (let i = 0; i < count; i++) {
  for (let n = 0; n < 3; n++) C[owner[i] * 3 + n] += home[i * 3 + n] / size[owner[i]];
}

// Rigid-body state per shard.
const P = new Float32Array(SHARDS * 3); // position of the shard's centre
const V = new Float32Array(SHARDS * 3);
const Q = new Float32Array(SHARDS * 4); // orientation
const W = new Float32Array(SHARDS * 3); // angular velocity
const P0 = new Float32Array(SHARDS * 3); // docking: where and how it started
const V0 = new Float32Array(SHARDS * 3);
const Q0 = new Float32Array(SHARDS * 4);
const state = new Uint8Array(SHARDS);
const until = new Float32Array(SHARDS); // LOOSE: when to turn back. DOCK: start time
const takes = new Float32Array(SHARDS);

const q = new THREE.Quaternion();
const q0 = new THREE.Quaternion();
const dq = new THREE.Quaternion();
const identity = new THREE.Quaternion();
const axis = new THREE.Vector3();
const m = new THREE.Matrix4();

function breakOff(k, t, vx, vy, vz, spin, drift) {
  V[k * 3] = vx;
  V[k * 3 + 1] = vy;
  V[k * 3 + 2] = vz;
  axis.set(Math.random() - 0.5, Math.random() - 0.5, (Math.random() - 0.5) * 0.6).normalize();
  W[k * 3] = axis.x * spin;
  W[k * 3 + 1] = axis.y * spin;
  W[k * 3 + 2] = axis.z * spin;
  state[k] = LOOSE;
  until[k] = t + drift;
}

// Start scattered in space and tumbling; everything docks into place.
for (let k = 0; k < SHARDS; k++) {
  const a = Math.random() * Math.PI * 2;
  const r = 1.2 + Math.random() * 2.6;
  P[k * 3] = C[k * 3] * 0.4 + Math.cos(a) * r;
  P[k * 3 + 1] = C[k * 3 + 1] + Math.sin(a) * r * 0.55;
  P[k * 3 + 2] = (Math.random() - 0.3) * 3.5;
  q.setFromAxisAngle(axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), Math.random() * 6);
  q.toArray(Q, k * 4);
  breakOff(k, 0, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 0, 1.5 + Math.random() * 2, 0.15 + Math.random() * 0.9);
}

stage.onClick = (x, y, t) => {
  for (let k = 0; k < SHARDS; k++) {
    if (state[k] === LOOSE) continue;
    const dx = P[k * 3] - x;
    const dy = P[k * 3 + 1] - y;
    const d = Math.hypot(dx, dy);
    if (d > SHOCK) continue;
    const f = 1 - d / SHOCK;
    const push = (0.6 + 2.6 * f) * (0.7 + 0.6 * Math.random());
    breakOff(
      k,
      t,
      (dx / (d + 0.08)) * push,
      (dy / (d + 0.08)) * push,
      (0.4 + 2.4 * f) * (Math.random() < 0.8 ? 1 : -0.6),
      2 + 7 * f * Math.random(),
      0.5 + 0.9 * Math.random() + 0.5 * f + d * 0.15 // nearer shards turn back first
    );
  }
};

function step(t, dt) {
  const linDrag = Math.exp(-1.5 * dt);
  const angDrag = Math.exp(-1.1 * dt);

  for (let k = 0; k < SHARDS; k++) {
    let st = state[k];
    const a = k * 3;
    const b = k * 4;

    if (st !== LOOSE && cursor.sweeping) {
      const d2 = cursor.dist2(P[a], P[a + 1]);
      if (d2 < REACH * REACH) {
        const near = 1 - Math.sqrt(d2) / REACH;
        const carry = (0.12 + 0.2 * Math.random()) * near;
        breakOff(
          k,
          t,
          cursor.vx * carry + (Math.random() - 0.5) * 0.5,
          cursor.vy * carry + (Math.random() - 0.5) * 0.5,
          (0.3 + 0.25 * cursor.speed) * near * (Math.random() < 0.75 ? 1 : -0.7),
          (1.5 + 0.9 * cursor.speed) * (0.4 + Math.random()),
          0.45 + 0.8 * Math.random()
        );
        st = LOOSE;
      }
    }
    if (st === SET) continue;

    if (st === LOOSE) {
      // Free rigid motion: drift and tumble, slowly losing speed.
      for (let n = 0; n < 3; n++) {
        P[a + n] += V[a + n] * dt;
        V[a + n] *= linDrag;
      }
      const w = Math.hypot(W[a], W[a + 1], W[a + 2]);
      if (w > 1e-4) {
        dq.setFromAxisAngle(axis.set(W[a] / w, W[a + 1] / w, W[a + 2] / w), w * dt);
        q.fromArray(Q, b).premultiply(dq).normalize().toArray(Q, b);
        for (let n = 0; n < 3; n++) W[a + n] *= angDrag;
      }
      if (t > until[k]) {
        // Turn for home: remember the state so the path leaves it smoothly.
        for (let n = 0; n < 3; n++) {
          P0[a + n] = P[a + n];
          V0[a + n] = V[a + n];
        }
        for (let n = 0; n < 4; n++) Q0[b + n] = Q[b + n];
        const far = Math.hypot(P[a] - C[a], P[a + 1] - C[a + 1], P[a + 2] - C[a + 2]);
        takes[k] = 0.65 + 0.22 * far + 0.25 * Math.random();
        until[k] = t;
        state[k] = st = DOCK;
      }
    } else {
      // Docking: a Hermite curve that starts with the shard's current velocity
      // and ends at rest in its slot, while the orientation unwinds to upright.
      const u = Math.min(1, (t - until[k]) / takes[k]);
      const u2 = u * u;
      const u3 = u2 * u;
      const h0 = 2 * u3 - 3 * u2 + 1;
      const h1 = (u3 - 2 * u2 + u) * takes[k];
      const h2 = -2 * u3 + 3 * u2;
      for (let n = 0; n < 3; n++) P[a + n] = h0 * P0[a + n] + h1 * V0[a + n] + h2 * C[a + n];
      q.slerpQuaternions(q0.fromArray(Q0, b), identity, u2 * (3 - 2 * u)).toArray(Q, b);
      if (u >= 1) {
        for (let n = 0; n < 3; n++) {
          P[a + n] = C[a + n];
          V[a + n] = 0;
        }
        identity.toArray(Q, b);
        state[k] = SET;
      }
    }

    // Place this shard's dots: rotate each offset, add the shard position.
    q.fromArray(Q, b);
    const e = m.makeRotationFromQuaternion(q).elements;
    const px = P[a];
    const py = P[a + 1];
    const pz = P[a + 2];
    const away = Math.hypot(px - C[a], py - C[a + 1], pz - C[a + 2]);
    const heat = Math.min(1, away / 0.5);
    const tint = heat * heat * (3 - 2 * heat);
    for (let n = first[k]; n < first[k + 1]; n++) {
      const i = members[n];
      const lx = home[i * 3] - C[a];
      const ly = home[i * 3 + 1] - C[a + 1];
      const lz = home[i * 3 + 2] - C[a + 2];
      put(i, px + e[0] * lx + e[4] * ly + e[8] * lz, py + e[1] * lx + e[5] * ly + e[9] * lz, pz + e[2] * lx + e[6] * ly + e[10] * lz, 0, tint, q);
    }
  }
}

stage.start(step);
