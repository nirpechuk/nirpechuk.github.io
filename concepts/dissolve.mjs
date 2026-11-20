// Concept: dissolve.
// A splat of a person is the hero. At rest it is the sharp picture. It turns
// to follow the pointer, the splats under the pointer blow apart into dots and
// settle back when you move on, and a click bursts the whole thing and reforms it.

import * as THREE from "three";
import { SparkRenderer, SplatMesh, dyno } from "@sparkjsdev/spark";
import { PHOTO as SCAN } from "./scan.mjs";

// The splat stops at the chest (its y axis points down). On wide screens it is
// anchored so that edge sits just below the bottom of the page; on tall ones,
// where the text goes underneath, it fades out toward the edge instead.
const CUT = SCAN.centre[1] + SCAN.cut;

const RADIUS = 0.22; // pointer circle, as a fraction of SCAN.size
const EASE_IN = 9; // 1/s
const EASE_OUT = 5; // 1/s
const FOLLOW = 18; // 1/s: how tightly the circle tracks the pointer
const TURN = [0.12, 0.22]; // max pitch and yaw toward the pointer, radians: a glance, never a turn away
const IDLE_AFTER = 2.5;
const TILT = SCAN.tilt ?? 0; // constant nod forward, radians
const BURST = { rise: 0.16, hold: 0.55, fall: 1.25 }; // seconds

const dark = matchMedia("(prefers-color-scheme: dark)").matches;
const BG = dark ? 0x111214 : 0xf6f5f1;

const canvas = document.getElementById("c");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
const spark = new SparkRenderer({ renderer });
scene.add(spark);

// Uniforms -------------------------------------------------------------------
const uTime = dyno.dynoFloat(0);
const uUnit = dyno.dynoFloat(SCAN.size); // lets every length below be size-relative
const uCentre = dyno.dynoVec3(new THREE.Vector3(...SCAN.centre));
const uStrength = dyno.dynoFloat(0); // pointer circle: 0 closed, 1 open
const uBurst = dyno.dynoFloat(1); // 1 = fully blown apart (also the load-in state)
const uOrigin = dyno.dynoVec3(new THREE.Vector3(0, 0, 1e4)); // pointer ray, scan space
const uDir = dyno.dynoVec3(new THREE.Vector3(0, 0, 1));
const uFadeFrom = dyno.dynoFloat(1e5); // scan-space y where the fade-out starts and ends
const uFadeTo = dyno.dynoFloat(1e6);

function dissolveModifier() {
  const block = new dyno.Dyno({
    inTypes: {
      gsplat: dyno.Gsplat,
      t: "float",
      unit: "float",
      centre: "vec3",
      strength: "float",
      burst: "float",
      origin: "vec3",
      dir: "vec3",
      fadeFrom: "float",
      fadeTo: "float",
    },
    outTypes: { gsplat: dyno.Gsplat },
    globals: () => [
      dyno.unindent(`
        float dustHash(uint x) {
          x ^= x >> 16; x *= 0x7feb352dU;
          x ^= x >> 15; x *= 0x846ca68bU;
          x ^= x >> 16;
          return float(x) / 4294967295.0;
        }
      `),
    ],
    statements: ({ inputs: i, outputs: o }) =>
      dyno.unindentLines(`
        ${o.gsplat} = ${i.gsplat};
        {
          vec3 p = ${i.gsplat}.center;
          float unit = ${i.unit};
          uint id = uint(${i.gsplat}.index);
          float h = dustHash(id);
          vec3 rnd = vec3(dustHash(id + 101u), dustHash(id + 202u), dustHash(id + 303u)) - 0.5;

          // Pointer circle: splats near the pointer's ray are blown outward from it.
          vec3 rel = p - ${i.origin};
          vec3 off = rel - ${i.dir} * dot(rel, ${i.dir});
          float dist = length(off);
          float r = ${RADIUS.toFixed(3)} * unit * (0.35 + 0.65 * ${i.strength});
          float blow = ${i.strength} * (1.0 - smoothstep(r * 0.35, r, dist));
          blow = blow * blow * (3.0 - 2.0 * blow);
          vec3 away = off / (dist + 1e-4);
          vec3 drift = vec3(
            sin(${i.t} * 1.7 + h * 40.0),
            cos(${i.t} * 1.3 + rnd.x * 30.0),
            sin(${i.t} * 1.1 + rnd.y * 20.0)) * 0.012;
          vec3 blown = (away * (0.03 + 0.10 * h) + rnd * 0.12 + drift) * unit * blow;

          // Burst: everything flies out from the centre, each splat its own distance.
          float burst = ${i.burst};
          vec3 outward = normalize(p - ${i.centre} + rnd * 0.5 * unit);
          vec3 flung = (outward * (0.10 + 0.55 * h) + rnd * 0.22) * unit * burst;

          // Dust: the more a splat is displaced, the more it is just a small dot,
          // and only some of them stay visible.
          float dust = clamp(max(blow, burst), 0.0, 1.0);
          float keep = step(h, 0.55);
          ${o.gsplat}.center = p + blown + flung;
          ${o.gsplat}.scales = mix(${i.gsplat}.scales, vec3(0.0022 * unit), dust);
          float edge = 1.0 - smoothstep(${i.fadeFrom}, ${i.fadeTo}, p.y);
          ${o.gsplat}.rgba.a = ${i.gsplat}.rgba.a * mix(1.0, keep, smoothstep(0.0, 0.5, dust)) * edge;
        }
      `),
  });

  return dyno.dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => ({
    gsplat: block.apply({
      gsplat,
      t: uTime,
      unit: uUnit,
      centre: uCentre,
      strength: uStrength,
      burst: uBurst,
      origin: uOrigin,
      dir: uDir,
      fadeFrom: uFadeFrom,
      fadeTo: uFadeTo,
    }).gsplat,
  }));
}

// Scene ----------------------------------------------------------------------
// `head` turns to follow the pointer; `pose` puts the scan upright inside it;
// the mesh is offset so SCAN.centre sits at the pivot. World size is 1 unit.
const head = new THREE.Group();
const pose = new THREE.Group();
pose.rotation.set(...SCAN.rotation);
pose.scale.setScalar(1 / SCAN.size);
const scan = new SplatMesh({ url: SCAN.url });
scan.position.set(-SCAN.centre[0], -SCAN.centre[1], -SCAN.centre[2]);
scan.objectModifier = dissolveModifier();
scan.updateGenerator();
pose.add(scan);
head.add(pose);
scene.add(head);

const LOOK = new THREE.Vector3(0, 0, 0);
const TAN = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return; // hidden tab or collapsed layout: keep the last good size
  const aspect = w / h;
  const wide = aspect >= 1.15; // keep in sync with the media query in demo.css
  renderer.setSize(w, h, false);
  camera.aspect = aspect;
  const fitW = wide ? 0.42 : 0.78;
  const fitH = wide ? 0.66 : 0.46;
  const dist = Math.max(1 / (2 * TAN * fitH), 1 / (2 * TAN * aspect * fitW));
  camera.position.set(0, 0, dist);
  camera.lookAt(LOOK);
  let lift = wide ? 0 : h * 0.17; // pixels to raise the picture by
  {
    if (wide) {
      // Slide the picture down until the cut edge is a little below the page.
      const half = dist * TAN; // world height from the middle of the screen to its edge
      const cutY = -SCAN.cut / SCAN.size + 0.05; // treat the edge as a little higher than it is
      lift = -((half + cutY) / (2 * half)) * h;
      uFadeFrom.value = 1e5; // the edge is off the page: no fade needed
      uFadeTo.value = 1e6;
    } else {
      uFadeFrom.value = CUT - 0.2;
      uFadeTo.value = CUT;
    }
  }
  camera.setViewOffset(w, h, wide ? -w * 0.19 : 0, lift, w, h);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

// Pointer --------------------------------------------------------------------
const pointer = new THREE.Vector2(0, 0);
let present = false;
let lastSeen = -1e9;
let burstAt = null;

function setPointer(e) {
  const r = canvas.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  present = true;
  lastSeen = performance.now() / 1000;
}
function pointerGone() {
  present = false;
  lastSeen = performance.now() / 1000;
}
window.addEventListener("pointermove", setPointer);
window.addEventListener("pointerdown", (e) => {
  if (e.target.closest?.("a")) return;
  setPointer(e);
  if (loadedAt !== null) burstAt = performance.now() / 1000;
});
window.addEventListener("pointerup", (e) => e.pointerType === "touch" && pointerGone());
window.addEventListener("pointercancel", pointerGone);
window.addEventListener("blur", pointerGone);
document.documentElement.addEventListener("pointerleave", pointerGone);

const raycaster = new THREE.Raycaster();
const inverse = new THREE.Matrix4();
const circle = new THREE.Vector2();
const target = new THREE.Vector2();
const centreNdc = new THREE.Vector3();
const smooth = (x) => x * x * (3 - 2 * x);

let loadedAt = null;
scan.initialized.then(() => (loadedAt = performance.now() / 1000));

let last = performance.now() / 1000;
renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  const dt = Math.min(0.05, Math.max(0, t - last));
  last = t;

  // Where the scan sits on screen, so "toward the pointer" is relative to it.
  centreNdc.copy(LOOK).project(camera);

  // Turn toward the pointer; with none around, sway gently.
  const gazeX = present ? THREE.MathUtils.clamp(pointer.x - centreNdc.x, -1, 1) : Math.sin(t * 0.4) * 0.25;
  const gazeY = present ? THREE.MathUtils.clamp(pointer.y - centreNdc.y, -1, 1) : 0;
  const turn = 1 - Math.exp(-dt * 5);
  head.rotation.y += (gazeX * TURN[1] - head.rotation.y) * turn;
  head.rotation.x += (TILT - gazeY * TURN[0] - head.rotation.x) * turn;
  head.updateMatrixWorld(true);

  // Pointer circle, eased open and shut. Idle: it wanders across the scan.
  let open = present;
  if (present) {
    target.copy(pointer);
  } else if (t - lastSeen > IDLE_AFTER) {
    open = true;
    target.set(centreNdc.x + 0.2 * Math.sin(t * 0.55), centreNdc.y + 0.36 * Math.sin(t * 0.83 + 1.3));
  }
  if (uStrength.value < 0.02) circle.copy(target);
  else circle.lerp(target, 1 - Math.exp(-dt * FOLLOW));
  const goal = open ? 1 : 0;
  uStrength.value += (goal - uStrength.value) * (1 - Math.exp(-dt * (goal > uStrength.value ? EASE_IN : EASE_OUT)));

  raycaster.setFromCamera(circle, camera);
  inverse.copy(scan.matrixWorld).invert();
  uOrigin.value.copy(raycaster.ray.origin).applyMatrix4(inverse);
  uDir.value.copy(raycaster.ray.direction).transformDirection(inverse);

  // Burst timeline: out fast, hang, reform. Loading plays the reform half.
  if (loadedAt === null) {
    uBurst.value = 1;
  } else if (burstAt !== null) {
    const s = t - burstAt;
    if (s < BURST.rise) uBurst.value = Math.max(uBurst.value, 1 - Math.pow(1 - s / BURST.rise, 3));
    else if (s < BURST.rise + BURST.hold) uBurst.value = 1;
    else {
      const back = Math.min(1, (s - BURST.rise - BURST.hold) / BURST.fall);
      uBurst.value = 1 - smooth(back);
      if (back >= 1) burstAt = null;
    }
  } else {
    uBurst.value = 1 - smooth(Math.min(1, (t - loadedAt) / 1.6));
  }

  uTime.value = t;
  scan.updateVersion();
  renderer.render(scene, camera);
});
