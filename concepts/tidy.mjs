// Concept: two robot arms keep the page tidy.
//
// Parts of the page are loose pieces. Click on them, or hold the button and
// drag through them, and they are knocked off and fall as rigid things onto
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

const SWEEP = 260; // px/s the pointer must be moving for a hover to knock something
const QUIET = 0.9; // seconds without new mess before an arm starts on a piece
const STEP_MS = 1000 / 60;

const ease = (u) => u * u * u * (u * (u * 6 - 15) + 10); // minimum jerk
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// `blast` is how far around a click things are knocked off, in pixels.
// `stage` is how the arms are set out. "corners": large, standing in the
// bottom corners of the window, resting beside the text. "lifts": smaller,
// standing just outside the pieces on lifts that sink until only an elbow
// shows, and belonging to the top of the page: scroll down and they fade.
// `rest` is where a gripper hangs when idle in the corners, in metres from its
// shoulder: x towards the middle of the page, y up.
// `hover` lists the pieces that a fast pass of the pointer knocks off without
// a click. `look` is handed to the rig: how the arms are lit and finished.
// `still` leaves the arms standing and nothing able to be knocked off. `shy`
// takes the arms away altogether in a window too small for them to stand
// clear of each other, leaving the page as plain text.
export async function startTidy({
  canvas,
  elements,
  robot = "xarm7",
  floorInset = 0,
  blast = 46,
  stage = "corners",
  rest = { x: 0.2, y: 0.02 },
  hover = [],
  look = null,
  still = false,
  shy = false,
}) {
  const lifts = stage === "lifts";
  const hero = lifts;
  const rig = await createRig({ canvas, robot, pedestal: lifts, soft: lifts, look });
  const hovered = new Set(hover);
  // The joints that fold an arm up in its own plane.
  const PLANAR = robot === "xarm7" ? [1, 3, 5] : null;
  const arms = rig.arms.map((arm) => ({
    arm,
    side: arm.side,
    job: null,
    held: null,
    claim: null, // everywhere it has spoken for: its shape along the path it is on
    exit: null, // the way it backs off whatever it last set down
    restQ: null,
    lift: 0,
    baseY: 0,
    sh0: new THREE.Vector3(),
  }));

  // Pieces ----------------------------------------------------------------

  const probe = document.createElement("canvas").getContext("2d");
  const pieces = elements.map((el) => ({
    el,
    hover: hovered.has(el),
    state: "home",
    body: null,
    x: 0,
    y: 0,
    angle: 0,
    claim: null,
    still: 0,
    gaveUp: {},
    skipUntil: 0,
  }));

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

  const cursor = { x: 0, y: 0, vx: 0, vy: 0, t: 0, down: false, seen: false };
  let lastMess = -1e9;
  let now = 0;
  let asleep = false; // scrolled away from the arms: they wait
  let away = false; // no room for the arms in this window: they are not shown
  let idleFrames = 0; // frames with nothing loose and both arms at rest

  function knock(p, vx, vy, spin) {
    if (still || away) return;
    idleFrames = 0;
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

  // A click knocks off what is under and just around it; holding the button and
  // dragging knocks off what the pointer is dragged through. Pieces listed in
  // `hover` also go when the pointer merely passes over them quickly.
  function strike(x, y) {
    for (const p of pieces) {
      const gap = distanceTo(p, x, y);
      if (gap > blast) continue;
      const c = p.state === "home" ? homeOf(p) : p;
      const dx = c.x - x;
      const dy = c.y - y;
      const d = Math.hypot(dx, dy);
      const f = 1 - (gap / blast) * 0.6;
      const kick = (260 + 380 * Math.random()) * f;
      knock(p, (dx / (d + 12)) * kick, (dy / (d + 12)) * kick - 260 * f, (Math.random() - 0.5) * 0.4 * f);
    }
  }
  addEventListener("pointerdown", (e) => {
    if (e.button || e.target.closest?.("a, button, input, textarea, select, nav, .lil-gui")) return;
    cursor.down = true;
    strike(e.clientX, e.clientY);
  });
  addEventListener("pointermove", (e) => {
    const t = performance.now() / 1000;
    const fromX = cursor.seen ? cursor.x : e.clientX;
    const fromY = cursor.seen ? cursor.y : e.clientY;
    if (cursor.seen) {
      const dt = Math.max(1 / 240, t - cursor.t);
      cursor.vx += ((e.clientX - cursor.x) / dt - cursor.vx) * 0.5;
      cursor.vy += ((e.clientY - cursor.y) / dt - cursor.vy) * 0.5;
    }
    cursor.x = e.clientX;
    cursor.y = e.clientY;
    cursor.t = t;
    cursor.seen = true;
    const speed = Math.hypot(cursor.vx, cursor.vy);
    // With the button down, whatever the pointer is dragged across goes. With
    // it up, only the pieces that give way to a hover, and only to a quick pass.
    if (!cursor.down && speed < SWEEP) return;
    const k = Math.min(1, (cursor.down ? 1100 : 1500) / (speed + 1));
    const steps = Math.min(40, Math.ceil(Math.hypot(cursor.x - fromX, cursor.y - fromY) / 8)) || 1;
    for (const p of pieces) {
      if (!cursor.down && !p.hover) continue;
      let hit = false;
      for (let i = 1; i <= steps && !hit; i++)
        hit = distanceTo(p, fromX + ((cursor.x - fromX) * i) / steps, fromY + ((cursor.y - fromY) * i) / steps) < 7;
      if (hit) knock(p, cursor.vx * k * 0.55 + (Math.random() - 0.5) * 120, cursor.vy * k * 0.55 - 120, (Math.random() - 0.5) * 0.25);
    }
  });
  document.documentElement.addEventListener("pointerleave", () => (cursor.seen = false));
  for (const type of ["pointerup", "pointercancel", "blur"]) addEventListener(type, () => (cursor.down = false));

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

  // Each arm stands on a lift. At rest it is lowered until little more than
  // its shoulder shows above the bottom of the window; to work it rises until
  // its shoulder is about level with what it is reaching for.
  let liftMax = 1;
  function setLift(A, lift) {
    A.lift = lift;
    A.arm.root.position.y = A.baseY + lift;
  }
  const liftFor = (A, py) => clamp(rig.toWorld(0, py).y + 0.03 - A.sh0.y, 0, liftMax);
  const shoulderAt = (A, lift) => rig.toScreen(_x.copy(A.sh0).setY(A.sh0.y + lift));

  // The joints for a pose with the lift at a given height, found from the rest
  // posture so the same pose always gives the same arm. Null when the arm
  // cannot get there, or could only get there with an elbow through the page.
  function jointsFor(A, pose, lift, only = null) {
    const arm = A.arm;
    const keep = Float64Array.from(arm.q);
    const was = A.lift;
    setLift(A, lift);
    arm.q.set(A.restQ ?? arm.rest);
    arm.apply();
    const { posErr, rotErr } = arm.solve(pose.pos, pose.quat, { iterations: 70, stride: 0.3, posture: 0.08, only });
    let q = posErr < 0.004 && rotErr < 0.03 ? Float64Array.from(arm.q) : null;
    if (q) for (const joint of arm.chain) if (_x.setFromMatrixPosition(joint.node.matrixWorld).z < 0.04) q = null;
    setLift(A, was);
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
  // An arm's whole configuration is one list of numbers: its joints, then the
  // height of its lift. A move is a path through a few such lists, and the arm
  // does not stop at the ones in the middle: the corner at each is rounded
  // off, and a single easing runs over the whole path. A reach, a carry or a
  // retreat is then one sweep that starts and ends at rest.

  let hurry = 1;
  const LIFT_WEIGHT = 3; // a metre of lift counts as this many radians along a path
  const stateOf = (A) => Float64Array.of(...A.arm.q, A.lift);
  const stateFor = (pose) => Float64Array.of(...pose.q, pose.lift);
  const restState = (A) => Float64Array.of(...A.restQ, 0);
  function setState(A, v) {
    A.arm.q.set(v.subarray(0, A.arm.n));
    setLift(A, v[A.arm.n]);
  }
  const blend = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const apart = (a, b) => {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += ((a[i] - b[i]) * (i === a.length - 1 ? LIFT_WEIGHT : 1)) ** 2;
    return Math.sqrt(sum);
  };

  // The path through some points with its corners rounded: a run of closely
  // spaced configurations, and how far along the path each one is.
  function route(points) {
    const ROUND = 0.45; // how much of each leg a corner takes up
    const dense = [points[0]];
    let from = points[0];
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      if (i === points.length - 1) {
        for (let k = 1; k <= 8; k++) dense.push(blend(from, p, k / 8));
        break;
      }
      const enter = blend(p, points[i - 1], ROUND);
      const leave = blend(p, points[i + 1], ROUND);
      for (let k = 1; k <= 6; k++) dense.push(blend(from, enter, k / 6));
      for (let k = 1; k <= 8; k++) dense.push(blend(blend(enter, p, k / 8), blend(p, leave, k / 8), k / 8));
      from = leave;
    }
    const along = [0];
    for (let i = 1; i < dense.length; i++) along.push(along[i - 1] + apart(dense[i - 1], dense[i]));
    const total = along.at(-1);
    return {
      dense,
      total,
      at(length) {
        if (length <= 0 || total === 0) return dense[0];
        if (length >= total) return dense.at(-1);
        let i = 1;
        while (along[i] < length) i++;
        return blend(dense[i - 1], dense[i], (length - along[i - 1]) / (along[i] - along[i - 1] || 1));
      },
    };
  }

  // How long a path should take: each leg at the pace its furthest-turning
  // joint (or the lift) allows, and a little saved for not stopping between legs.
  function timeFor(points, rate, climb) {
    let T = 0;
    for (let i = 1; i < points.length; i++) {
      let far = 0;
      const n = points[i].length - 1;
      for (let j = 0; j < n; j++) far = Math.max(far, Math.abs(points[i][j] - points[i - 1][j]));
      T += Math.max(0.24, (far / rate) * 1.5, (Math.abs(points[i][n] - points[i - 1][n]) / climb) * 1.5);
    }
    return Math.max(0.36, T * (points.length > 2 ? 0.92 : 1));
  }

  // Sweep an arm along a path. If `stopIf` comes true on the way it slows to a
  // halt where it is, and the sweep says so by returning false.
  // `pace` stretches it: 1.5 takes half as long again.
  function* sweep(A, points, { rate = 3, climb = 0.75, pace = 1, stopIf = null } = {}) {
    const path = route(points);
    const T = (timeFor(points, rate, climb) * pace) / hurry;
    let was = 0;
    for (let t = 0; t < T;) {
      const dt = yield;
      t += dt;
      const s = ease(Math.min(1, t / T)) * path.total;
      if (stopIf?.()) {
        const speed = (s - was) / Math.max(dt, 1e-3);
        const brake = 0.16;
        for (let tau = 0; tau < brake;) {
          tau = Math.min(brake, tau + (yield));
          setState(A, path.at(was + speed * (tau - (tau * tau) / (2 * brake))));
        }
        return false;
      }
      was = s;
      setState(A, path.at(s));
    }
    setState(A, points.at(-1));
    return true;
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

  // Arms: keeping clear of each other ---------------------------------------
  // A light touch, because an arm that keeps stopping for the other looks worse
  // than two that now and then pass close. Only the working end of each arm is
  // watched, from the elbow down, taken for a chain of fat line segments. A
  // sweep lays claim to where that will be and when, and a sweep that would
  // put its hand where the other's is at the same moment is not refused, only
  // slowed until it would not.

  const BONE = 0.04; // half the thickness of a forearm, metres
  const HAND = 0.032; // and of a gripper
  const GAP = 0; // the air kept between them: none, they may brush

  // The arm's segments, in the world, were it in configuration `v`: from the
  // elbow down, or (`whole`) all of it.
  function shapeAt(A, v, whole = false) {
    const keep = stateOf(A);
    setState(A, v);
    A.arm.apply();
    const chain = whole ? A.arm.chain : A.arm.chain.slice(Math.min(3, A.arm.chain.length - 2));
    const points = [
      ...(whole ? [A.arm.root.position.clone()] : []),
      ...chain.map((joint) => new THREE.Vector3().setFromMatrixPosition(joint.node.matrixWorld)),
      A.arm.toolPosition(),
    ];
    setState(A, keep);
    A.arm.apply();
    const shape = points.slice(1).map((b, i) => ({ a: points[i], b, r: i >= points.length - 3 ? HAND : BONE }));
    // A ball round the lot, for telling quickly that two shapes are nowhere near.
    shape.middle = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(points.length);
    shape.reach = Math.max(...points.map((p) => p.distanceTo(shape.middle))) + BONE;
    return shape;
  }
  // Standing still, an arm holds its place for good.
  function shapeNow(A) {
    const shape = shapeAt(A, stateOf(A));
    shape.from = -Infinity;
    shape.until = Infinity;
    return [shape];
  }
  // How far through a sweep's time it is when it is a fraction `f` along its path.
  function unease(f) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (ease(mid) < f) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  // Everywhere a sweep takes the arm's working end, and when: its shape at
  // steps along the path, each with the seconds after setting off (at an
  // unhurried pace of 1) that it is about there. Worked out a few shapes a
  // frame, so it never makes a frame late.
  const NEAR = 0.2; // seconds either side of a moment that count as that moment
  const LINGER = 0.45; // seconds an arm is taken to stay where a sweep ends
  function* claimOf(A, points, { rate = 3, climb = 0.75 } = {}) {
    const path = route(points);
    const T = timeFor(points, rate, climb) / hurry;
    const steps = Math.min(50, Math.max(2, Math.ceil(path.total / 0.1)));
    const shapes = [];
    for (let i = 0; i <= steps; i++) {
      const shape = shapeAt(A, path.at((path.total * i) / steps));
      const at = unease(i / steps) * T;
      // (At the far end it stays a moment, to grip or let go, and is then taken to have left.)
      shape.rel = [at, i < steps ? at : at + LINGER];
      shape.early = i < steps * 0.2; // where it is setting off from, and cannot help being
      shapes.push(shape);
      if (i % 8 === 7) yield;
    }
    return shapes;
  }
  // Take a claim, as of setting off now at a given pace.
  function commit(A, claim, pace = 1) {
    for (const shape of claim) {
      shape.from = now + shape.rel[0] * pace - NEAR;
      shape.until = now + shape.rel[1] * pace + NEAR;
    }
    A.claim = claim;
  }

  // The least distance between two segments.
  const _d1 = new THREE.Vector3();
  const _d2 = new THREE.Vector3();
  const _r = new THREE.Vector3();
  function between(p, q) {
    _d1.subVectors(p.b, p.a);
    _d2.subVectors(q.b, q.a);
    _r.subVectors(p.a, q.a);
    const a = _d1.dot(_d1);
    const e = _d2.dot(_d2);
    const f = _d2.dot(_r);
    let s = 0;
    let t = 0;
    if (a > 1e-9 && e > 1e-9) {
      const b = _d1.dot(_d2);
      const c = _d1.dot(_r);
      const denom = a * e - b * b;
      s = denom > 1e-9 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    } else if (a > 1e-9) {
      s = clamp(-_d1.dot(_r) / a, 0, 1);
    } else if (e > 1e-9) {
      t = clamp(f / e, 0, 1);
    }
    return _r.addScaledVector(_d1, s).addScaledVector(_d2, -t).length();
  }
  // Would a sweep setting off now come too near where the other arm will be
  // at the same moment? (A claim already taken can be asked about too.)
  // How much of a sweep setting off now, at this pace, would bring the arm's
  // working end too near where the other's will be at the same moment: the
  // number of steps along it that would. None is what is wanted.
  let crowded = false; // a window too small for the two arms even to rest apart: then they are not kept apart
  function touching(mine, theirs, pace = 1, enough = Infinity) {
    if (!theirs || crowded) return 0;
    let count = 0;
    for (const shape of mine) {
      // Where a sweep starts is where the arm already is: nothing to decide there.
      if (shape.rel && shape.early) continue;
      const from = shape.rel ? now + shape.rel[0] * pace - NEAR : shape.from;
      const until = shape.rel ? now + shape.rel[1] * pace + NEAR : shape.until;
      let hit = false;
      for (const other of theirs) {
        if (hit) break;
        if (until < other.from || other.until < from) continue;
        if (shape.middle.distanceTo(other.middle) > shape.reach + other.reach + GAP) continue;
        for (const p of shape) {
          if (hit) break;
          for (const q of other) {
            if (between(p, q) < p.r + q.r + GAP) {
              hit = true;
              break;
            }
          }
        }
      }
      if (hit && ++count >= enough) return count;
    }
    return count;
  }
  const hits = (mine, theirs, pace = 1) => touching(mine, theirs, pace, 1) > 0;

  // The pace to take a sweep at: as it is if that keeps clear, else the slower
  // one that does. If none does and the other arm is on the move, it goes
  // anyway, gently: better two arms that pass close than one that stands and
  // waits. Only an arm standing in the way is waited for, a moment, having
  // been asked to move.
  function* paceFor(A, claim, other) {
    for (let waited = 0; ; waited += yield) {
      for (const pace of [1, 1.3, 1.7, 2.3]) {
        if (hits(claim, other.claim, pace)) continue;
        if (pace > 1 || waited > 0) note(A, `paced ${pace}`);
        return pace;
      }
      const standing = other.claim?.length === 1;
      if (standing) other.asked = now;
      if (!standing || waited > 0.25) {
        note(A, "went-anyway");
        return 1.5;
      }
    }
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
    // The lift brings the shoulder level with each end of the job.
    const liftP = liftFor(A, p.y);
    const liftH = liftFor(A, h.y);
    const shP = { ...shoulderAt(A, liftP) };
    const sh = { ...shoulderAt(A, liftH) };
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
        const lx = (shP.x - p.x) * c + (shP.y - p.y) * s;
        const ly = -(shP.x - p.x) * s + (shP.y - p.y) * c;
        holds.push(
          [g, clamp(sh.x - h.x, -rx, rx) * 0.85, clamp(sh.y - h.y, -ry, ry) * 0.85],
          [g, clamp(lx, -rx, rx) * 0.85, clamp(ly, -ry, ry) * 0.85],
          [g, 0, 0]
        );
      } else {
        const room = Math.max(0, g.free / 2 - 16) * 0.8;
        const along = g.jaw === 0 ? [0, 1] : [1, 0];
        const there = clamp((sh.x - h.x) * along[0] + (sh.y - h.y) * along[1], -room, room);
        const here = clamp(((shP.x - p.x) * c + (shP.y - p.y) * s) * along[0] + (-(shP.x - p.x) * s + (shP.y - p.y) * c) * along[1], -room, room);
        for (const t of room > 20 ? [there, here, 0] : [0]) holds.push([g, along[0] * t, along[1] * t]);
      }
    }
    for (const [g, gx, gy] of holds) {
      const pick = { x: p.x + gx * c - gy * s, y: p.y + gx * s + gy * c, lift: liftP, from: shP };
      const place = { x: h.x + gx, y: h.y + gy, lift: liftH, from: sh };
      for (const at of [pick, place]) at.natural = Math.atan2(at.y - at.from.y, at.x - at.from.x);
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
        cost += (1 - align) * 0.5 + Math.max(0, Math.hypot(at.x - at.from.x, at.y - at.from.y) / rig.K - 0.45) * 4;
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
          a.lift = at.lift;
          a.q = jointsFor(A, a, at.lift);
          yield; // spread the solving over frames
          if (!a.q) continue;
          const b = poseAt(at.x, at.y, at.gamma, at.heading, tau, BACK);
          b.lift = at.lift;
          b.q = jointsFor(A, b, at.lift);
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

  const waiting = () => pieces.some((p) => p.state === "loose" && !p.claim && p.still > 14 && now >= p.skipUntil);

  // Pick a piece for this arm and plan the whole of fetching it, setting off
  // from `from` (by way of `exit`, if it has just put something down there).
  // The piece is spoken for from the moment it is chosen.
  function* choose(A, from, exit) {
    // Nearest its own side first: the two arms rebuild from the outside in.
    // And not, if there is a choice, a piece that lies or belongs right beside
    // the one the other arm is on: two hands in one spot is what makes them wait.
    const other = arms.find((o) => o !== A);
    const close = 0.11 * rig.K;
    const beside = (p) => {
      if (!other.target) return 0;
      const h = homeOf(p);
      return other.target.some((at) => Math.hypot(p.x - at.x, p.y - at.y) < close || Math.hypot(h.x - at.x, h.y - at.y) < close) ? 1e6 : 0;
    };
    const todo = pieces
      .filter((p) => p.state === "loose" && !p.claim && p.still > 14 && now >= p.skipUntil)
      .sort((a, b) => beside(a) - beside(b) + (homeOf(a).x - homeOf(b).x) * -A.side + (a.y - b.y) * 0.15);
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
      p.claim = A;
      plan.pick0 = { x: p.x, y: p.y, angle: p.angle };
      A.target = [plan.pick, plan.place]; // where its hand will be, for the other arm to steer clear of
      // One sweep: back off whatever it last set down, over to the piece, and in onto it.
      const reach = [from, ...(exit ? [exit] : []), stateFor(plan.before), stateFor(plan.grasp)];
      const claim = yield* claimOf(A, reach);
      return { p, plan, reach, claim };
    }
    return null;
  }
  const shifted = (job) =>
    job.p.state !== "loose" ||
    Math.hypot(job.p.x - job.plan.pick0.x, job.p.y - job.plan.pick0.y) > 5 ||
    Math.abs(wrap(job.p.angle - job.plan.pick0.angle)) > 0.06;

  // While an arm carries one piece home it is already choosing the next, a
  // little each frame, so that it can set off again the moment it lets go.
  function scout(A) {
    const s = A.scout;
    if (!s || s.done) return;
    const r = s.gen.next();
    if (r.done) Object.assign(s, { done: true, job: r.value });
  }
  function* along(A, move) {
    let r = move.next();
    while (!r.done) {
      scout(A);
      r = move.next(yield);
    }
    return r.value;
  }

  function* work(A) {
    const other = arms.find((o) => o !== A);
    // What was lined up during the last carry, if it is still as it was.
    let job = null;
    if (A.scout) {
      while (!A.scout.done) {
        scout(A);
        if (!A.scout.done) yield;
      }
      job = A.scout.job;
      A.scout = null;
      if (job && (job.p.claim !== A || shifted(job))) {
        if (job.p.claim === A) job.p.claim = null;
        job = null;
      }
    }
    if (!job) {
      const since = now;
      job = yield* choose(A, stateOf(A), A.exit);
      if (job && A.exit) note(A, `late-choice ${(now - since).toFixed(2)}`);
    }
    if (!job) return false;
    const { p, plan } = job;
    // (If the arm is not where the plan supposed it would be, the way there is drawn again.)
    if (apart(stateOf(A), job.reach[0]) > 0.02) {
      job.reach = [stateOf(A), stateFor(plan.before), stateFor(plan.grasp)];
      job.claim = yield* claimOf(A, job.reach);
    }
    A.abort = false;
    const lost = () => A.abort || p.claim !== A;
    const moved = () => shifted(job);
    const K = rig.K;
    // Pinching, it opens a little wider than the piece; pressing, it stays shut.
    const wide = plan.pinch ? Math.min(A.arm.maxGap, plan.width / K + 0.024) : 0.006;

    let pace = yield* paceFor(A, job.claim, other);
    let there = false;
    if (!lost() && !moved()) {
      note(A, `go ${plan.pinch ? "pinch" : "press"}`, p);
      commit(A, job.claim, pace);
      A.exit = null;
      [there] = yield* both(sweep(A, job.reach, { pace, stopIf: () => lost() || moved() }), grip(A, wide, 0.3));
    }
    if (there && !lost() && !moved()) {
      // Close on it; and while the gripper closes, work out the way home: up
      // off the pile, across, and down into place.
      const home = [stateFor(plan.grasp), stateFor(plan.before), stateFor(plan.above), stateFor(plan.set)];
      const [, homeClaim] = yield* both(grip(A, plan.pinch ? Math.max(0, plan.width / K - 0.002) : 0.006, plan.pinch ? 0.2 : 0.08), claimOf(A, home));
      take(A, p);
      note(A, "took", p);
      A.claim = shapeNow(A);
      pace = yield* paceFor(A, homeClaim, other);
      let placed = false;
      if (!lost()) {
        commit(A, homeClaim, pace);
        A.scout = { gen: choose(A, stateFor(plan.set), stateFor(plan.above)), done: false, job: null };
        placed = yield* along(A, sweep(A, home, { pace, stopIf: lost }));
      }
      if (placed && !lost()) {
        // Open, and the piece is home.
        // (Whatever is left to straighten is taken the short way round: an
        // upright piece can come in a whole turn out by the numbers.)
        const from = { x: p.x, y: p.y, angle: wrap(p.angle) };
        const h = homeOf(p);
        A.held = null;
        const opening = grip(A, wide, 0.22);
        let u = 0;
        for (let r = opening.next(); !r.done; r = opening.next(yield)) {
          scout(A);
          u = Math.min(1, u + 0.12);
          p.x = from.x + (h.x - from.x) * u;
          p.y = from.y + (h.y - from.y) * u;
          p.angle = from.angle * (1 - u);
        }
        if (p.state === "held") settle(p);
        note(A, "home", p);
        // It backs off this way as the first leg of whatever it does next.
        A.exit = stateFor(plan.above);
      }
    } else {
      note(A, "missed", p);
      if (p.claim === A) p.claim = null;
    }
    if (A.held) drop(A);
    A.claim = shapeNow(A);
    if (!A.scout) A.target = null;
    return true;
  }

  // Run two moves at once; the results of both come back.
  function* both(a, b) {
    let ra = a.next();
    let rb = b.next();
    while (!ra.done || !rb.done) {
      const dt = yield;
      if (!ra.done) ra = a.next(dt);
      if (!rb.done) rb = b.next(dt);
    }
    return [ra.value, rb.value];
  }

  function* life(A) {
    const other = arms.find((o) => o !== A);
    let idle = 0;
    for (;;) {
      const quiet = now - lastMess > QUIET && !asleep;
      const did = quiet ? yield* work(A) : false;
      if (did) {
        idle = 0;
        continue;
      }
      const out = A.lift > 0.004 || A.restQ.some((v, i) => Math.abs(v - A.arm.q[i]) > 0.02);
      const pending = pieces.some((p) => p.state !== "home");
      const asked = now - (A.asked ?? -9) < 0.3;
      // Still work about, only none this arm can get at just now (a piece yet
      // to settle, say): it stays where it is, ready, and does not go back to
      // rest for that. Unless the other arm is waiting on it to move.
      if (out && quiet && pending && !asked && idle < 6) {
        for (let t = 0; t < 0.1;) {
          const dt = yield;
          t += dt;
          idle += dt;
        }
        continue;
      }
      // Nothing left to do, or in the way: fold up and go back to rest, but keep looking.
      if (out && (quiet || asleep)) {
        const path = [stateOf(A), ...(A.exit ? [A.exit] : []), restState(A)];
        const claim = yield* claimOf(A, path, { rate: 1.8, climb: 0.5 });
        const pace = yield* paceFor(A, claim, other);
        idle = 0;
        commit(A, claim, pace);
        A.exit = null;
        // Only a fresh mess calls it back before it has got there.
        const began = now;
        yield* both(
          sweep(A, path, { rate: 1.8, climb: 0.5, pace, stopIf: () => lastMess > began && waiting() && now - lastMess > QUIET && !asleep }),
          grip(A, 0.02, 0.4)
        );
        A.claim = shapeNow(A);
      } else {
        yield* pause(0.12);
      }
    }
  }

  // Layout ------------------------------------------------------------------

  const STAND = 0.16; // on lifts: how far outside the pieces each arm stands, metres
  const REACH = 0.6; // on lifts: how far sideways an arm works comfortably, metres
  const SUNK = 0.12; // on lifts: how far below the window a resting shoulder is, metres
  const FOLDED = [0, 0.5, 0, 0, 0, -0.2, 0]; // on lifts: forearm doubled back, so an elbow is all that shows
  const DEPTH = 0.22; // how far in front of the page the arms stand, metres

  function layout() {
    room();
    for (const p of pieces) if (p.state !== "home") settle(p);
    measure();
    const inView = pieces.map((p) => ({ p, h: homeOf(p) })).filter(({ h }) => h.y > -20 && h.y < H);
    let K;
    if (lifts) {
      // The arms stand just outside the pieces, one each side, and are as small
      // as will still let them meet in the middle.
      let lo = Math.min(...inView.map(({ p, h }) => h.x - p.w / 2), W * 0.4);
      let hi = Math.max(...inView.map(({ p, h }) => h.x + p.w / 2), W * 0.6);
      const mid = (lo + hi) / 2;
      K = 640;
      let feet = [0, 0];
      for (let pass = 0; pass < 6; pass++) {
        feet = [Math.max(0.09 * K, lo - STAND * K), Math.min(W - 0.09 * K, hi + STAND * K)];
        const need = (Math.max(mid - feet[0], feet[1] - mid) + 24) / REACH;
        if (need <= K * 1.01) break;
        K = Math.min(need, 1300);
      }
      // The shoulder is 0.387 m above the foot of the model.
      rig.layout({ K, bases: feet.map((x) => [x, H - floorInset + (0.387 + SUNK) * K]), baseZ: DEPTH });
      liftMax = H / K + SUNK;
    } else {
      // Big enough for the window, and then big enough that between them the
      // two arms can reach every piece's place: a tall narrow window needs longer arms.
      K = Math.min(1000, Math.max(330, W * 0.62));
      for (let pass = 0; pass < 3; pass++) {
        // (Feet given where they sit on the page plane, as this stage was first laid out.)
        const s = rig.toScreen(new THREE.Vector3(0, 0, DEPTH)).scale;
        const at = (x, y) => [W / 2 + (x - W / 2) * s, H / 2 + (y - H / 2) * s];
        rig.layout({ K, bases: [at(0.2 * K, H - floorInset + 0.1 * K), at(W - 0.2 * K, H - floorInset + 0.1 * K)], baseZ: DEPTH });
        const shoulders = arms.map((A) => rig.toScreen(A.arm.shoulder(_x)));
        let far = 0;
        for (const { h } of inView) far = Math.max(far, Math.min(...shoulders.map((sh) => Math.hypot(h.x - sh.x, h.y - sh.y))));
        const need = far / 0.56;
        if (need <= K) break;
        K = Math.min(need, 1300);
      }
      liftMax = 0;
    }
    for (const A of arms) {
      A.held = null;
      A.exit = null;
      A.scout = null;
      A.baseY = A.arm.root.position.y;
      A.lift = 0;
      const home = rig.spec.home ?? new Array(A.arm.n).fill(0);
      A.arm.rest.set(home);
      A.restQ = null;
      A.arm.shoulder(A.sh0);
      if (lifts && PLANAR) {
        A.restQ = Float64Array.from(FOLDED);
      } else {
        // Folded beside the text, gripper hanging: found in the arm's own
        // plane, where only shoulder, elbow and wrist bend.
        const down = new THREE.Vector3(0, -1, 0);
        const across = new THREE.Vector3(0, 0, A.side);
        const tuck = {
          pos: new THREE.Vector3(A.sh0.x - A.side * rest.x, A.sh0.y + rest.y, A.sh0.z),
          quat: new THREE.Quaternion().setFromRotationMatrix(_mat.makeBasis(new THREE.Vector3().crossVectors(across, down), across, down)),
        };
        A.restQ = jointsFor(A, tuck, 0, PLANAR) ?? Float64Array.from(home);
      }
      A.arm.rest.set(A.restQ);
      A.arm.q.set(A.restQ);
      A.arm.gap = 0.02;
      A.arm.apply();
      A.job = life(A);
    }
    for (const A of arms) A.claim = shapeNow(A);
    crowded = false;
    crowded = hits(arms[0].claim, arms[1].claim);
    away = shy && crowded;
    canvas.style.visibility = away ? "hidden" : "visible";
    idleFrames = 0;
  }
  layout();
  let resizing = 0;
  addEventListener("resize", () => {
    clearTimeout(resizing);
    resizing = setTimeout(layout, 150);
  });
  // With `hero`, the arms belong to the top of the page: scrolled away from it
  // they fade out and stop work, and come back when it does.
  function fade() {
    if (!hero) return;
    const gone = clamp(scrollY / (innerHeight * 0.45), 0, 1);
    canvas.style.opacity = String(1 - gone);
    asleep = gone > 0.5;
  }
  fade();
  // The page slides under the window: loose pieces go with it, and anything in hand is let go.
  let lastScroll = scrollY;
  addEventListener(
    "scroll",
    () => {
      const dy = scrollY - lastScroll;
      lastScroll = scrollY;
      idleFrames = 0;
      for (const A of arms) if (A.held) drop(A);
      for (const p of pieces) {
        if (!p.body) continue;
        Body.translate(p.body, { x: 0, y: -dy });
        Sleeping.set(p.body, false);
      }
      lastMess = now;
      fade();
    },
    { passive: true }
  );

  // The loop ----------------------------------------------------------------

  let owed = 0;
  function tick(dt) {
    if (away) return;
    // With everything in its place and both arms at rest there is nothing to
    // work out or draw, until something is knocked off again.
    const settled =
      pieces.every((p) => p.state === "home") && arms.every((A) => A.lift < 0.004 && A.restQ.every((v, i) => Math.abs(v - A.arm.q[i]) < 0.02));
    idleFrames = settled ? idleFrames + 1 : 0;
    if (idleFrames > 40) return;
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

  // The air between the two arms right now, in metres (negative if they overlap).
  const clearance = () => {
    const [mine, theirs] = arms.map((A) => shapeAt(A, stateOf(A), true));
    let least = Infinity;
    let which = null;
    mine.forEach((p, i) =>
      theirs.forEach((q, j) => {
        const gap = between(p, q) - p.r - q.r;
        if (gap < least) {
          least = gap;
          which = [i, j];
        }
      })
    );
    clearance.which = which;
    return least;
  };
  // Draw again after a change made from outside (a colour, say) while all is at rest.
  const wake = () => (idleFrames = 0);
  return { rig, arms, pieces, knock, tick, log, relayout: layout, clearance, wake };
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

// Wrap each word of an element's text in a span of its own, so it can be a piece.
export function words(el) {
  const out = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue.trim()) nodes.push(n);
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    for (const part of node.nodeValue.split(/(\s+)/)) {
      if (!part || /^\s+$/.test(part)) {
        frag.append(part);
        continue;
      }
      const span = document.createElement("span");
      span.className = "piece";
      span.textContent = part;
      frag.append(span);
      out.push(span);
    }
    node.replaceWith(frag);
  }
  return out;
}
