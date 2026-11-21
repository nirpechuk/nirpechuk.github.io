// Concept: two robot arms keep the page tidy.
//
// Parts of the page are loose pieces. Sweep the pointer through them, or click,
// and they are knocked off and fall as rigid things, tumbling into a heap on
// the bottom edge of the window. When it goes quiet the two arms get to work,
// each on its own: reach for a piece, close on it, carry it back to where it
// belongs, set it down straight, go for the next.
//
// The arms are real models driven by inverse kinematics (rig.mjs). A piece the
// gripper can open around is pinched; anything bigger is pressed and slid.

import * as THREE from "three";
import Matter from "matter-js";
import { createRig } from "./rig.mjs";

const { Engine, Bodies, Body, Composite, Sleeping } = Matter;

const QUIET = 0.9; // seconds without new mess before an arm starts on a piece
const SWEEP = 260; // px/s the pointer must be moving to knock something
const BLAST = 170; // click blast radius, px
const STEP_MS = 1000 / 60;

const ease = (u) => u * u * u * (u * (u * 6 - 15) + 10); // minimum jerk
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// `rest` is where each gripper hangs when idle, in metres from its shoulder:
// x towards the middle of the page, y up.
export async function startTidy({ canvas, elements, robot = "xarm7", floorInset = 0, rest = { x: 0.2, y: 0.02 } }) {
  const rig = await createRig({ canvas, robot });
  const arms = rig.arms.map((arm) => ({ arm, side: arm.side, job: null, held: null, span: null, restQ: null, wait: 0 }));
  // The joints that fold an arm up in its own plane, for the pose it rests in.
  const PLANAR = robot === "xarm7" ? [1, 3, 5] : null;

  // Pieces ----------------------------------------------------------------

  const probe = document.createElement("canvas").getContext("2d");
  const pieces = elements.map((el) => ({ el, state: "home", body: null, x: 0, y: 0, angle: 0, claim: null, still: 0, gaveUp: {}, skipUntil: 0 }));

  // Where each piece lives, and the box that stands for it once it is loose:
  // for a line of text, the ink of the letters rather than the tall line box.
  function measure() {
    for (const p of pieces) p.el.style.transform = "";
    for (const p of pieces) {
      const el = p.el;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      let box = { x: r.left, y: r.top, w: r.width, h: r.height };
      const text = el.textContent.trim();
      const plain = text && !el.querySelector("img, picture, video");
      if (plain) {
        // Text takes up its lines, not the block it is set in (which may run under a float).
        const range = document.createRange();
        range.selectNodeContents(el);
        const lines = range.getBoundingClientRect();
        if (lines.width && lines.height) box = { x: lines.left, y: lines.top, w: lines.width, h: lines.height };
      }
      if (plain && box.h < size * 1.9) {
        probe.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const m = probe.measureText(text);
        const font = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
        const baseline = box.y + (box.h - font) / 2 + m.fontBoundingBoxAscent;
        const ink = Math.max(8, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
        const line = { x: box.x, y: baseline - m.actualBoundingBoxAscent, w: Math.max(8, box.w), h: ink };
        if (text.length <= 2) {
          const w = Math.max(8, m.actualBoundingBoxLeft + m.actualBoundingBoxRight);
          line.x = box.x + (box.w - w) / 2;
          line.w = w;
        }
        box = line;
      }
      p.w = box.w;
      p.h = box.h;
      // Home, in document pixels, and how far the box's middle is from the element's.
      p.homeX = box.x + box.w / 2 + scrollX;
      p.homeY = box.y + box.h / 2 + scrollY;
      p.offX = box.x + box.w / 2 - (r.left + r.width / 2);
      p.offY = box.y + box.h / 2 - (r.top + r.height / 2);
      el.style.transformOrigin = `calc(50% + ${p.offX.toFixed(2)}px) calc(50% + ${p.offY.toFixed(2)}px)`;
    }
  }
  const homeOf = (p) => ({ x: p.homeX - scrollX, y: p.homeY - scrollY });

  // Physics ---------------------------------------------------------------

  const engine = Engine.create({ enableSleeping: true });
  engine.gravity.scale = 0.0017;
  let walls = [];
  let W = 0;
  let H = 0;
  // The room is the window: a floor along its bottom edge and a wall up each side.
  function room() {
    W = innerWidth;
    H = innerHeight;
    const t = 400;
    Composite.remove(engine.world, walls);
    const wall = (x, y, w, h) => Bodies.rectangle(x, y, w, h, { isStatic: true, friction: 0.9 });
    walls = [wall(W / 2, H - floorInset + t / 2, W + 4 * t, t), wall(-t / 2, H / 2 - 2000, t, H + 6000), wall(W + t / 2, H / 2 - 2000, t, H + 6000)];
    Composite.add(engine.world, walls);
  }

  function loosen(p) {
    if (p.state === "home") {
      const h = homeOf(p);
      p.x = h.x;
      p.y = h.y;
      p.angle = 0;
    }
    if (!p.body) {
      p.body = Bodies.rectangle(p.x, p.y, p.w, p.h, {
        restitution: 0.14,
        friction: 0.7,
        frictionStatic: 0.9,
        frictionAir: 0.012,
        density: 0.002,
        chamfer: { radius: Math.min(3, p.h / 4) },
      });
      Body.setAngle(p.body, p.angle);
      Composite.add(engine.world, p.body);
    }
    Sleeping.set(p.body, false);
    p.state = "loose";
    p.still = 0;
    p.el.classList.add("loose");
  }
  function unbody(p) {
    if (!p.body) return;
    Composite.remove(engine.world, p.body);
    p.body = null;
    // Whatever was leaning on it has to notice.
    for (const o of pieces) if (o.body) Sleeping.set(o.body, false);
  }
  function settle(p) {
    unbody(p);
    p.state = "home";
    p.claim = null;
    p.gaveUp = {};
    p.el.classList.remove("loose", "held");
    p.el.style.transform = "";
  }

  // The pointer -----------------------------------------------------------

  const cursor = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, present: false, t: 0 };
  let lastMess = -1e9;
  let now = 0;

  function knock(p, vx, vy, spin) {
    for (const a of arms) {
      if (a.held === p) drop(a);
    }
    loosen(p);
    Body.setVelocity(p.body, { x: (vx * STEP_MS) / 1000, y: (vy * STEP_MS) / 1000 });
    Body.setAngularVelocity(p.body, spin);
    lastMess = now;
  }

  // Distance from a point to a piece's box, in the piece's own frame.
  function distanceTo(p, x, y) {
    const c = p.state === "home" ? homeOf(p) : p;
    const a = p.state === "home" ? 0 : p.angle;
    const dx = x - c.x;
    const dy = y - c.y;
    const lx = Math.abs(dx * Math.cos(a) + dy * Math.sin(a)) - p.w / 2;
    const ly = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) - p.h / 2;
    return Math.hypot(Math.max(0, lx), Math.max(0, ly));
  }

  addEventListener("pointermove", (e) => {
    const t = performance.now() / 1000;
    if (cursor.present) {
      const dt = Math.max(1 / 240, t - cursor.t);
      cursor.vx += ((e.clientX - cursor.x) / dt - cursor.vx) * 0.5;
      cursor.vy += ((e.clientY - cursor.y) / dt - cursor.vy) * 0.5;
    }
    const fromX = cursor.present ? cursor.x : e.clientX;
    const fromY = cursor.present ? cursor.y : e.clientY;
    cursor.x = e.clientX;
    cursor.y = e.clientY;
    cursor.t = t;
    cursor.present = true;
    const speed = Math.hypot(cursor.vx, cursor.vy);
    if (speed < SWEEP) return;
    const k = Math.min(1, 1500 / speed);
    // Everything along the stretch the pointer just crossed.
    const steps = Math.min(40, Math.ceil(Math.hypot(cursor.x - fromX, cursor.y - fromY) / 8)) || 1;
    for (const p of pieces) {
      let hit = false;
      for (let i = 1; i <= steps && !hit; i++)
        hit = distanceTo(p, fromX + ((cursor.x - fromX) * i) / steps, fromY + ((cursor.y - fromY) * i) / steps) < 7;
      if (hit) knock(p, cursor.vx * k * 0.55 + (Math.random() - 0.5) * 120, cursor.vy * k * 0.55 - 120, (Math.random() - 0.5) * 0.25);
    }
  });
  document.documentElement.addEventListener("pointerleave", () => (cursor.present = false));
  addEventListener("pointerdown", (e) => {
    if (e.target.closest?.("a, button, input, textarea, select, nav")) return;
    for (const p of pieces) {
      const c = p.state === "home" ? homeOf(p) : p;
      const dx = c.x - e.clientX;
      const dy = c.y - e.clientY;
      const d = Math.hypot(dx, dy);
      if (distanceTo(p, e.clientX, e.clientY) > BLAST * 0.6 && d > BLAST) continue;
      const f = Math.max(0.25, 1 - d / (BLAST * 1.6));
      const kick = (500 + 700 * Math.random()) * f;
      knock(p, (dx / (d + 8)) * kick, (dy / (d + 8)) * kick - 380 * f, (Math.random() - 0.5) * 0.5 * f);
    }
  });

  // Arms: poses -------------------------------------------------------------
  // The gripper comes at the page from in front of it, the way an arm over a
  // table comes down on a thing, leaning back towards its own arm so that the
  // fingers and what they hold stay in view. Turning the wrist turns the piece,
  // so how a piece lies and how it must end up never constrain each other.

  const PAD_Z = 0.018; // how far in front of the page the pads close, metres
  const LEAN = 0.72; // the most the gripper leans back, radians from straight on
  const BACK = 0.07; // how far it stands off before going in

  const _x = new THREE.Vector3();
  const _y = new THREE.Vector3();
  const _mat = new THREE.Matrix4();
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // A tool pose from the screen: the pads at a pixel, the jaws closing along
  // the screen angle `gamma`, the gripper leaning back by `tau` along the
  // screen direction `heading`, and pulled `back` off the page along its axis.
  function poseAt(px, py, gamma, heading, tau, back = 0) {
    const a = new THREE.Vector3(Math.cos(heading) * Math.sin(tau), -Math.sin(heading) * Math.sin(tau), -Math.cos(tau));
    const j = new THREE.Vector3(Math.cos(gamma), -Math.sin(gamma), 0);
    j.addScaledVector(a, -j.dot(a)).normalize();
    const pos = rig.toWorld(px, py, PAD_Z).addScaledVector(a, -back);
    return { pos, quat: new THREE.Quaternion().setFromRotationMatrix(_mat.makeBasis(new THREE.Vector3().crossVectors(j, a), j, a)) };
  }

  // The joints for a pose, found from the rest posture so the same pose always
  // gives the same arm. Null when the arm cannot get there, or could only get
  // there with an elbow through the page.
  function jointsFor(A, pose, only = null) {
    const arm = A.arm;
    const keep = Float64Array.from(arm.q);
    arm.q.set(A.restQ ?? arm.rest);
    arm.apply();
    const { posErr, rotErr } = arm.solve(pose.pos, pose.quat, { iterations: 70, stride: 0.3, posture: 0.08, only });
    let q = posErr < 0.004 && rotErr < 0.03 ? Float64Array.from(arm.q) : null;
    if (q) for (const joint of arm.chain) if (_x.setFromMatrixPosition(joint.node.matrixWorld).z < 0.04) q = null;
    arm.q.set(keep);
    arm.apply();
    return q;
  }

  // Where the pads are on screen, and the angle of the line the jaws close along.
  const toolScreen = (A) => {
    const s = rig.toScreen(A.arm.toolPosition(_x));
    _y.setFromMatrixColumn(A.arm.tool.matrixWorld, 1);
    return { x: s.x, y: s.y, gamma: Math.atan2(-_y.y, _y.x) };
  };

  // Arms: motion ------------------------------------------------------------
  // Each move is a generator that is handed the frame time until it is done.

  let hurry = 1;

  function* moveJ(A, goal, { rate = 3, floor = 0.36 } = {}) {
    const from = Float64Array.from(A.arm.q);
    let far = 0;
    for (let i = 0; i < goal.length; i++) far = Math.max(far, Math.abs(goal[i] - from[i]));
    const T = Math.max(floor, (far / rate) * 1.5) / hurry;
    for (let t = 0; t < T;) {
      t += yield;
      const s = ease(Math.min(1, t / T));
      for (let i = 0; i < goal.length; i++) A.arm.q[i] = from[i] + (goal[i] - from[i]) * s;
    }
  }

  function* moveL(A, pose, seconds) {
    const p0 = A.arm.toolPosition();
    const q0 = A.arm.toolQuaternion();
    const T = seconds / hurry;
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    for (let t = 0; t < T;) {
      t += yield;
      const s = ease(Math.min(1, t / T));
      p.lerpVectors(p0, pose.pos, s);
      q.slerpQuaternions(q0, pose.quat, s);
      A.arm.solve(p, q, { iterations: 6, posture: 0.05 });
    }
  }

  function* grip(A, gap, seconds) {
    const from = A.arm.gap;
    const T = seconds / hurry;
    for (let t = 0; t < T;) {
      t += yield;
      A.arm.gap = from + (gap - from) * ease(Math.min(1, t / T));
    }
  }

  function* pause(seconds) {
    for (let t = 0; t < seconds;) t += yield;
  }

  // Arms: holding -----------------------------------------------------------

  function take(A, p) {
    const tool = toolScreen(A);
    const c = Math.cos(-tool.gamma);
    const s = Math.sin(-tool.gamma);
    const dx = p.x - tool.x;
    const dy = p.y - tool.y;
    A.held = p;
    A.grasp = { x: dx * c - dy * s, y: dx * s + dy * c, angle: p.angle - tool.gamma };
    unbody(p);
    p.state = "held";
    p.el.classList.add("held");
  }
  function carry(A) {
    const p = A.held;
    const tool = toolScreen(A);
    const c = Math.cos(tool.gamma);
    const s = Math.sin(tool.gamma);
    p.x = tool.x + A.grasp.x * c - A.grasp.y * s;
    p.y = tool.y + A.grasp.x * s + A.grasp.y * c;
    p.angle = tool.gamma + A.grasp.angle;
  }
  // Let go wherever it is: the piece is loose again.
  function drop(A) {
    const p = A.held;
    A.held = null;
    if (!p) return;
    p.state = "loose";
    p.claim = null;
    p.el.classList.remove("held");
    p.body = null;
    loosen(p);
    A.abort = true;
  }

  // Arms: planning ----------------------------------------------------------

  const log = [];
  const note = (A, what, p) => {
    log.push(`${now.toFixed(1)} ${A.side < 0 ? "L" : "R"} ${what} ${p ? p.el.textContent.trim().slice(0, 8) : ""}`);
    if (log.length > 400) log.shift();
  };
  // How to take a piece and how to set it down. If the jaws open wide enough
  // they close across it, one way or the other; if not, the closed gripper
  // presses on it and slides it. At each end the gripper leans back along
  // whichever way across its jaws points more nearly away from its own arm.
  function* planFor(A, p) {
    const open = A.arm.maxGap * rig.K;
    const h = homeOf(p);
    const sh = rig.toScreen(A.arm.shoulder(_x));
    const grips = [];
    if (p.w <= open - 12) grips.push({ jaw: 0, width: p.w, free: p.h });
    if (p.h <= open - 12) grips.push({ jaw: Math.PI / 2, width: p.h, free: p.w });
    if (!grips.length) grips.push({ jaw: null, width: 0, free: 0 });
    const options = [];
    const c = Math.cos(p.angle);
    const s = Math.sin(p.angle);
    const holds = [];
    for (const g of grips) {
      // Where on the piece: its middle, or along its free length towards the
      // arm, either as it lies or as it will end up.
      if (g.jaw === null) {
        const rx = Math.max(0, p.w / 2 - 24);
        const ry = Math.max(0, p.h / 2 - 24);
        const lx = (sh.x - p.x) * c + (sh.y - p.y) * s;
        const ly = -(sh.x - p.x) * s + (sh.y - p.y) * c;
        holds.push(
          [g, clamp(sh.x - h.x, -rx, rx) * 0.85, clamp(sh.y - h.y, -ry, ry) * 0.85],
          [g, clamp(lx, -rx, rx) * 0.85, clamp(ly, -ry, ry) * 0.85],
          [g, 0, 0]
        );
      } else {
        const room = Math.max(0, g.free / 2 - 16) * 0.8;
        const along = g.jaw === 0 ? [0, 1] : [1, 0];
        const there = clamp((sh.x - h.x) * along[0] + (sh.y - h.y) * along[1], -room, room);
        const here = clamp(((sh.x - p.x) * c + (sh.y - p.y) * s) * along[0] + (-(sh.x - p.x) * s + (sh.y - p.y) * c) * along[1], -room, room);
        for (const t of room > 20 ? [there, here, 0] : [0]) holds.push([g, along[0] * t, along[1] * t]);
      }
    }
    for (const [g, gx, gy] of holds) {
      const pick = { x: p.x + gx * c - gy * s, y: p.y + gx * s + gy * c };
      const place = { x: h.x + gx, y: h.y + gy };
      for (const at of [pick, place]) at.natural = Math.atan2(at.y - sh.y, at.x - sh.x);
      if (g.jaw === null) {
        place.gamma = place.natural + Math.PI / 2;
        pick.gamma = place.gamma + p.angle;
      } else {
        pick.gamma = p.angle + g.jaw;
        place.gamma = g.jaw;
      }
      let cost = 0;
      for (const at of [pick, place]) {
        at.heading = at.gamma + Math.PI / 2;
        let align = Math.cos(at.heading - at.natural);
        if (align < 0) {
          at.heading += Math.PI;
          align = -align;
        }
        at.tau = LEAN * align;
        // Leaning the wrong way costs a little; a long reach costs more.
        cost += (1 - align) * 0.5 + Math.max(0, Math.hypot(at.x - sh.x, at.y - sh.y) / rig.K - 0.45) * 4;
      }
      options.push({ pick, place, pinch: g.jaw !== null, width: g.width, cost });
    }
    options.sort((a, b) => a.cost - b.cost);
    for (const o of options.slice(0, 4)) {
      const poses = {};
      for (const [near, far, at] of [
        ["grasp", "before", o.pick],
        ["set", "above", o.place],
      ]) {
        // Lean as planned if the arm can; straighten up if that is what it takes to reach.
        for (const tau of [at.tau, at.tau * 0.5, 0]) {
          const a = poseAt(at.x, at.y, at.gamma, at.heading, tau);
          a.q = jointsFor(A, a);
          yield; // spread the solving over frames
          if (!a.q) continue;
          const b = poseAt(at.x, at.y, at.gamma, at.heading, tau, BACK);
          b.q = jointsFor(A, b);
          yield;
          if (!b.q) continue;
          poses[near] = a;
          poses[far] = b;
          break;
        }
        if (!poses[near]) break;
      }
      if (poses.set) return { ...o, ...poses };
    }
    return null;
  }

  // What an arm has spoken for: where its gripper is and where it is headed.
  // The other arm keeps its own gripper and goals a clear distance from those.
  const reserve = (A, ...targets) => (A.span = [toolScreen(A), ...targets]);
  const clash = (points, other) => {
    if (!other.span) return false;
    const clear = 0.19 * rig.K;
    return points.some((a) => other.span.some((b) => Math.hypot(a.x - b.x, a.y - b.y) < clear));
  };

  function* work(A) {
    const other = arms.find((o) => o !== A);
    // Nearest its own side first: the two arms rebuild from the outside in.
    const todo = pieces
      .filter((p) => p.state === "loose" && !p.claim && p.still > 14 && now >= p.skipUntil)
      .sort((a, b) => (homeOf(a).x - homeOf(b).x) * -A.side + (a.y - b.y) * 0.15);
    for (const p of todo.slice(0, 3)) {
      const plan = yield* planFor(A, p);
      if (p.state !== "loose" || p.claim) continue;
      if (!plan) {
        note(A, "no-plan", p);
        // Out of this arm's reach, or lying awkwardly. Once both arms have given
        // up on it twice, stir it towards where it belongs and look again.
        p.gaveUp[A.side] = (p.gaveUp[A.side] ?? 0) + 1;
        if (Math.min(p.gaveUp[-1] ?? 0, p.gaveUp[1] ?? 0) >= 2 && p.body) {
          p.gaveUp = {};
          Sleeping.set(p.body, false);
          Body.setVelocity(p.body, { x: Math.sign(homeOf(p).x - p.x) * (4 + 4 * Math.random()), y: -8 - 4 * Math.random() });
          Body.setAngularVelocity(p.body, (Math.random() - 0.5) * 0.35);
        }
        p.skipUntil = now + 0.5;
        continue;
      }
      if (clash([plan.pick], other)) continue;
      note(A, `go ${plan.pinch ? "pinch" : "press"}`, p);
      reserve(A, plan.pick);
      p.claim = A;
      A.abort = false;
      const lost = () => A.abort || p.claim !== A;
      const moved = () =>
        p.state !== "loose" || Math.hypot(p.x - plan.pick0.x, p.y - plan.pick0.y) > 5 || Math.abs(wrap(p.angle - plan.pick0.angle)) > 0.06;
      plan.pick0 = { x: p.x, y: p.y, angle: p.angle };
      const K = rig.K;
      // Pinching, it opens a little wider than the piece; pressing, it stays shut.
      const wide = plan.pinch ? Math.min(A.arm.maxGap, plan.width / K + 0.024) : 0.006;

      yield* both(moveJ(A, plan.before.q), grip(A, wide, 0.3));
      if (!lost() && !moved()) yield* moveL(A, plan.grasp, 0.34);
      if (!lost() && !moved()) {
        yield* grip(A, plan.pinch ? Math.max(0, plan.width / K - 0.002) : 0.006, plan.pinch ? 0.2 : 0.08);
        take(A, p);
        note(A, "took", p);
        yield* moveL(A, plan.before, 0.26);
        // Hold it there until the other arm is clear of where it goes; not for ever.
        reserve(A);
        for (let waited = 0; !lost() && waited < 2.5 && clash([plan.place], other);) waited += yield;
        reserve(A, plan.place);
        if (!lost()) yield* moveJ(A, plan.above.q);
        if (!lost()) yield* moveL(A, plan.set, 0.36);
        if (!lost()) {
          // Open, and the piece is home.
          const from = { x: p.x, y: p.y, angle: p.angle };
          const h = homeOf(p);
          A.held = null;
          const opening = grip(A, wide, 0.22);
          let u = 0;
          for (let r = opening.next(); !r.done; r = opening.next(yield)) {
            u = Math.min(1, u + 0.12);
            p.x = from.x + (h.x - from.x) * u;
            p.y = from.y + (h.y - from.y) * u;
            p.angle = from.angle * (1 - u);
          }
          if (p.state === "held") settle(p);
          note(A, "home", p);
          yield* moveL(A, plan.above, 0.24);
        }
      } else {
        note(A, "missed", p);
        if (p.claim === A) p.claim = null;
      }
      if (A.held) drop(A);
      A.span = null;
      return true;
    }
    return false;
  }

  // Run two moves at once.
  function* both(a, b) {
    let ra = a.next();
    let rb = b.next();
    while (!ra.done || !rb.done) {
      const dt = yield;
      if (!ra.done) ra = a.next(dt);
      if (!rb.done) rb = b.next(dt);
    }
  }

  function* life(A) {
    for (;;) {
      const quiet = now - lastMess > QUIET;
      const did = quiet ? yield* work(A) : false;
      if (did) continue;
      // Nothing to do: go and rest, but keep looking.
      const away = A.restQ.some((v, i) => Math.abs(v - A.arm.q[i]) > 0.02);
      if (away && quiet) {
        const resting = both(moveJ(A, A.restQ, { rate: 1.6 }), grip(A, 0.02, 0.4));
        for (let r = resting.next(); !r.done; r = resting.next(yield)) {
          if (pieces.some((p) => p.state === "loose" && !p.claim && p.still > 14 && now >= p.skipUntil) && now - lastMess > QUIET) break;
        }
      } else {
        yield* pause(0.12);
      }
    }
  }

  // Layout ------------------------------------------------------------------

  function layout() {
    room();
    for (const p of pieces) if (p.state !== "home") settle(p);
    measure();
    // Big enough for the window, and then big enough that between them the two
    // arms can reach every piece's place: a tall narrow window needs longer arms.
    let K = Math.min(1000, Math.max(330, W * 0.62));
    for (let pass = 0; pass < 3; pass++) {
      rig.layout({ K, baseX: 0.2 * K, baseY: H - floorInset + 0.1 * K, baseZ: 0.22 });
      const shoulders = arms.map((A) => rig.toScreen(A.arm.shoulder(_x)));
      let far = 0;
      for (const p of pieces) {
        const h = homeOf(p);
        if (h.y < -20 || h.y > H) continue; // scrolled out of the window
        far = Math.max(far, Math.min(...shoulders.map((s) => Math.hypot(h.x - s.x, h.y - s.y))));
      }
      const need = far / 0.56;
      if (need <= K) break;
      K = Math.min(need, 1300);
    }
    for (const A of arms) {
      A.held = null;
      A.span = null;
      // Rest: folded up beside its own edge of the window, gripper hanging.
      const home = rig.spec.home ?? new Array(A.arm.n).fill(0);
      A.arm.rest.set(home);
      A.restQ = null;
      // (Found in the arm's own plane: only shoulder, elbow and wrist bend.)
      const sh = A.arm.shoulder();
      const down = new THREE.Vector3(0, -1, 0);
      const across = new THREE.Vector3(0, 0, A.side);
      const tuck = {
        pos: new THREE.Vector3(sh.x - A.side * rest.x, sh.y + rest.y, sh.z),
        quat: new THREE.Quaternion().setFromRotationMatrix(_mat.makeBasis(new THREE.Vector3().crossVectors(across, down), across, down)),
      };
      A.restQ = jointsFor(A, tuck, PLANAR) ?? Float64Array.from(home);
      A.arm.rest.set(A.restQ);
      A.arm.q.set(A.restQ);
      A.arm.gap = 0.02;
      A.arm.apply();
      A.job = life(A);
    }
  }
  layout();
  let resizing = 0;
  addEventListener("resize", () => {
    clearTimeout(resizing);
    resizing = setTimeout(layout, 150);
  });
  // The page slides under the window: loose pieces go with it, and anything in hand is let go.
  let lastScroll = scrollY;
  addEventListener(
    "scroll",
    () => {
      const dy = scrollY - lastScroll;
      lastScroll = scrollY;
      for (const A of arms) if (A.held) drop(A);
      for (const p of pieces) {
        if (!p.body) continue;
        Body.translate(p.body, { x: 0, y: -dy });
        Sleeping.set(p.body, false);
      }
      lastMess = now;
    },
    { passive: true }
  );

  // The loop ----------------------------------------------------------------

  let owed = 0;
  function tick(dt) {
    now += dt;
    owed = Math.min(owed + dt * 1000, STEP_MS * 3);
    for (; owed >= STEP_MS - 0.01; owed -= STEP_MS) Engine.update(engine, STEP_MS);
    let loose = 0;
    for (const p of pieces) {
      if (!p.body) continue;
      loose++;
      p.x = p.body.position.x;
      p.y = p.body.position.y;
      p.angle = p.body.angle;
      const calm = p.body.isSleeping || (p.body.speed < 0.25 && Math.abs(p.body.angularVelocity) < 0.012);
      p.still = calm ? p.still + 1 : 0;
      // Anything that got out of the room comes back in.
      if (p.y > H + 200 || p.x < -200 || p.x > W + 200) {
        Body.setPosition(p.body, { x: Math.min(W - 40, Math.max(40, p.x)), y: H - floorInset - 60 });
        Body.setVelocity(p.body, { x: 0, y: 0 });
      }
    }
    hurry = 1 + Math.min(0.9, loose / 14);

    for (const A of arms) {
      A.job.next(dt);
      A.arm.apply();
      if (A.held) carry(A);
    }
    for (const p of pieces) {
      if (p.state === "home") continue;
      const h = homeOf(p);
      p.el.style.transform = `translate(${(p.x - h.x).toFixed(2)}px, ${(p.y - h.y).toFixed(2)}px) rotate(${p.angle.toFixed(4)}rad)`;
    }
    rig.render();
  }
  let last = null;
  requestAnimationFrame(function frame(ms) {
    const t = ms / 1000;
    tick(last === null ? 1 / 60 : Math.min(1 / 30, Math.max(0, t - last)));
    last = t;
    requestAnimationFrame(frame);
  });

  return { rig, arms, pieces, knock, tick, log };
}

// Wrap each letter of an element's text in a span of its own, so it can be a piece.
export function letters(el) {
  const out = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = walk.nextNode(); n; n = walk.nextNode()) nodes.push(n);
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    for (const ch of node.nodeValue) {
      if (/\s/.test(ch)) {
        frag.append(ch);
        continue;
      }
      const span = document.createElement("span");
      span.className = "piece";
      span.textContent = ch;
      frag.append(span);
      out.push(span);
    }
    node.replaceWith(frag);
  }
  return out;
}
