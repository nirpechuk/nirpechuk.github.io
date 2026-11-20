// Shared stage for the particle demos: renderer, a subject made of dots (the
// name, or a scan of a person), pointer tracking and the frame loop. Each
// variant supplies only its physics, and runs unchanged on either subject.

import * as THREE from "three";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { PHOTO } from "./scan.mjs";

export const WIDTH = 4.2; // world-space width of the name
const FONT = '700 330px "Atkinson Hyperlegible", "Helvetica Neue", Arial, sans-serif';
const MAX_STD = 2; // a splat is drawn out to this many standard deviations

// Bridson's Poisson-disc sampling over the region where `inside(x, y)` holds:
// points no closer than `r`, with no gap wider than `r`. Returns [x0, y0, x1, ...].
function poissonPoints(inside, cw, ch, r) {
  const cell = r / Math.SQRT2;
  const gw = Math.ceil(cw / cell);
  const gh = Math.ceil(ch / cell);
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts = [];
  const active = [];
  const clear = (x, y) => {
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    for (let v = Math.max(0, gy - 2); v <= Math.min(gh - 1, gy + 2); v++) {
      for (let u = Math.max(0, gx - 2); u <= Math.min(gw - 1, gx + 2); u++) {
        const k = grid[v * gw + u];
        if (k >= 0 && (pts[k * 2] - x) ** 2 + (pts[k * 2 + 1] - y) ** 2 < r * r) return false;
      }
    }
    return true;
  };
  const add = (x, y) => {
    grid[Math.floor(y / cell) * gw + Math.floor(x / cell)] = pts.length / 2;
    active.push(pts.length / 2);
    pts.push(x, y);
  };
  // Seed every glyph (they are separate islands), then grow outward from the seeds.
  for (let y = 0; y < ch; y += r * 3) {
    for (let x = 0; x < cw; x += r * 3) if (inside(x, y) && clear(x, y)) add(x, y);
  }
  while (active.length) {
    const pick = Math.floor(Math.random() * active.length);
    const k = active[pick];
    let grew = false;
    for (let tries = 0; tries < 30; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = r * (1 + Math.random());
      const x = pts[k * 2] + Math.cos(a) * d;
      const y = pts[k * 2 + 1] + Math.sin(a) * d;
      if (inside(x, y) && clear(x, y)) {
        add(x, y);
        grew = true;
        break;
      }
    }
    if (!grew) {
      active[pick] = active[active.length - 1];
      active.pop();
    }
  }
  return pts;
}

// Blue-noise points inside the glyphs (Bridson's Poisson-disc sampling): no two
// closer than `r`, and no gap wider than `r`. Evenly dense like a grid, so discs
// of radius `r` fill the letters solidly, but with no rows or columns to show
// through as a pattern or to tear along when the dots come apart.
function sampleGlyphs(text, target, textY) {
  const cw = 2400;
  const ch = 560;
  const off = document.createElement("canvas");
  off.width = cw;
  off.height = ch;
  const g = off.getContext("2d", { willReadFrequently: true });
  g.font = FONT;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, cw / 2, ch / 2);
  const data = g.getImageData(0, 0, cw, ch).data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < cw && y < ch && data[((y | 0) * cw + (x | 0)) * 4 + 3] > 128;

  let filled = 0;
  let minX = cw;
  let maxX = 0;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (data[(y * cw + x) * 4 + 3] > 128) {
        filled++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }

  const r = Math.sqrt((0.7 * filled) / target);
  // Keep centres a little inside the outline so the discs do not fatten the letters.
  const inset = r * 0.45;
  const inside = (x, y) => solid(x, y) && solid(x - inset, y) && solid(x + inset, y) && solid(x, y - inset) && solid(x, y + inset);

  const pts = poissonPoints(inside, cw, ch, r);

  const scale = WIDTH / (maxX - minX);
  const midX = (minX + maxX) / 2;
  const home = new Float32Array((pts.length / 2) * 3);
  for (let i = 0; i < pts.length / 2; i++) {
    home[i * 3] = (pts[i * 2] - midX) * scale;
    home[i * 3 + 1] = -(pts[i * 2 + 1] - ch / 2) * scale + textY;
  }
  // spacing: closest two dots can be. area: glyph area each dot stands for.
  return { home, spacing: r * scale, area: (filled * scale * scale) / (pts.length / 2) };
}

// The name as dots: flat, hard-edged discs of ink on the z = 0 plane.
async function nameSubject(scene, { text = "Nir Pechuk", target = 26000, textY = 0.42, flyRadius, ink, accent }) {
  // The glyphs are rasterised from the web font, so it has to be loaded first.
  await document.fonts.load(FONT, text).catch(() => {});
  const { home, spacing, area } = sampleGlyphs(text, target, textY);
  const count = home.length / 3;
  const restRadius = spacing * 1.04; // no gap is wider than `spacing`, so this fills solid
  const fly = flyRadius ?? restRadius;

  const center = new THREE.Vector3();
  const scales = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const color = new THREE.Color();
  const mesh = new SplatMesh({
    maxSplats: count,
    constructSplats: (splats) => {
      for (let i = 0; i < count; i++) {
        center.set(home[i * 3], home[i * 3 + 1], 0);
        scales.setScalar(restRadius / MAX_STD);
        color.setRGB(ink[0], ink[1], ink[2]);
        splats.pushSplat(center, scales, quat, 1, color);
      }
    },
  });
  scene.add(mesh);
  await mesh.initialized;

  let lowest = Infinity;
  for (let i = 0; i < count; i++) lowest = Math.min(lowest, home[i * 3 + 1]);

  return {
    mesh,
    count,
    home,
    spacing,
    area,
    depth: 0,
    minX: -WIDTH / 2,
    maxX: WIDTH / 2,
    midY: textY,
    floorY: lowest - 0.4,
    fitWidth: WIDTH,
    // size: 0 = at rest, 1 = flying. heat: 0 = ink, 1 = accent.
    put(i, x, y, z, size, heat) {
      center.set(x, y, z);
      scales.setScalar((restRadius + (fly - restRadius) * size) / MAX_STD);
      color.setRGB(ink[0] + (accent[0] - ink[0]) * heat, ink[1] + (accent[1] - ink[1]) * heat, ink[2] + (accent[2] - ink[2]) * heat);
      mesh.packedSplats.setSplat(i, center, scales, quat, 1, color);
    },
  };
}

// A splat of a person as dots: its own splats, cropped to a bust and moved into
// world space, so at rest it is simply the splat. `SCAN` says which file and how
// to frame it (see scan.js).
async function scanSubject(scene, SCAN) {
  const HEIGHT = SCAN.height; // world height of the bust
  const BASE_Y = SCAN.base ?? -0.6; // world height of its base (where the scan is cropped)
  const FADE = 0.75; // world height over which the bust fades in above its base
  const DUST = 0.0055; // size a splat shrinks to once it is knocked loose

  const source = new SplatMesh({ url: SCAN.url });
  await source.initialized;

  const s = HEIGHT / (SCAN.above + SCAN.below);
  const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(...SCAN.rotation));
  const centre = new THREE.Vector3(...SCAN.centre);
  const lift = BASE_Y + SCAN.below * s;

  const kept = [];
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  source.packedSplats.forEachSplat((index, c, sc, rot, opacity, col) => {
    p.copy(c).sub(centre).applyQuaternion(turn).multiplyScalar(s);
    p.y += lift;
    if (p.y < BASE_Y || Math.abs(p.x) > 1.6 || Math.abs(p.z) > 1.6) return;
    // Dissolve gradually toward the base: a long, eased fade instead of an edge.
    const rise = Math.min(1, (p.y - BASE_Y) / FADE);
    const fade = rise * rise * rise * (rise * (rise * 6 - 15) + 10);
    if (opacity * fade < 0.02) return;
    q.multiplyQuaternions(turn, rot);
    kept.push(p.x, p.y, p.z, sc.x * s, sc.y * s, sc.z * s, q.x, q.y, q.z, q.w, opacity * fade, col.r, col.g, col.b);
  });
  source.dispose?.();

  const F = 14; // fields per splat in `kept`
  const count = kept.length / F;
  const base = new Float32Array(kept);
  const home = new Float32Array(count * 3);
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < count; i++) {
    home[i * 3] = base[i * F];
    home[i * 3 + 1] = base[i * F + 1];
    home[i * 3 + 2] = base[i * F + 2];
    minX = Math.min(minX, base[i * F]);
    maxX = Math.max(maxX, base[i * F]);
  }

  const center = new THREE.Vector3();
  const scales = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const color = new THREE.Color();
  const mesh = new SplatMesh({
    maxSplats: count,
    constructSplats: (splats) => {
      for (let i = 0; i < count; i++) {
        const b = i * F;
        center.set(base[b], base[b + 1], base[b + 2]);
        scales.set(base[b + 3], base[b + 4], base[b + 5]);
        quat.set(base[b + 6], base[b + 7], base[b + 8], base[b + 9]);
        color.setRGB(base[b + 11], base[b + 12], base[b + 13]);
        splats.pushSplat(center, scales, quat, base[b + 10], color);
      }
    },
  });
  scene.add(mesh);
  await mesh.initialized;

  return {
    mesh,
    count,
    home,
    spacing: 0.008,
    area: 0.45 / count, // a heap of all of it covers about this much
    depth: 0.3,
    minX,
    maxX,
    midY: BASE_Y + HEIGHT / 2,
    floorY: BASE_Y,
    eyeY: lift, // world height of `centre`: view it level from here, not from below
    fitWidth: 3.0,
    // size: 0 = the splat as scanned, 1 = a speck of dust. heat is not used:
    // the scan keeps its own colours. spin: optional rotation of a rigid piece.
    put(i, x, y, z, size, heat, spin) {
      const b = i * F;
      const k = 1 - size;
      center.set(x, y, z);
      scales.set(base[b + 3] * k + DUST * size, base[b + 4] * k + DUST * size, base[b + 5] * k + DUST * size);
      quat.set(base[b + 6], base[b + 7], base[b + 8], base[b + 9]);
      if (spin) quat.premultiply(spin);
      color.setRGB(base[b + 11], base[b + 12], base[b + 13]);
      mesh.packedSplats.setSplat(i, center, scales, quat, base[b + 10], color);
    },
  };
}

// Build the stage for whichever subject the URL asks for: the name by default,
// or the 3D splat predicted from the portrait photo with `?of=photo`.
export async function createStage({ parallax = 1, pinTagline = false, ...nameOptions } = {}) {
  const portrait = new URLSearchParams(location.search).get("of") === "photo"; // the person, not the name
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const ink = dark ? [0.9, 0.9, 0.88] : [0.08, 0.08, 0.09];
  const accent = [0.92, 0.3, 0.16];
  const mute = dark ? 0x3a3b3e : 0xc9c7c0;

  const canvas = document.getElementById("c");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(dark ? 0x111214 : 0xf6f5f1);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  // The name is drawn with flat falloff: hard-edged discs instead of soft blobs.
  // The scan keeps the normal Gaussian falloff it was captured with.
  const spark = new SparkRenderer({ renderer, ...(portrait ? {} : { falloff: 0, maxStdDev: MAX_STD }) });
  scene.add(spark);

  const subject = portrait ? await scanSubject(scene, PHOTO) : await nameSubject(scene, { ...nameOptions, ink, accent });
  document.body.classList.toggle("portrait", portrait);
  let wrote = false;
  const put = (i, x, y, z, size, heat, spin) => {
    subject.put(i, x, y, z, size, heat, spin);
    wrote = true;
  };

  // Layout -------------------------------------------------------------------
  const TAN = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  let camDist = 7;
  const eyeY = subject.eyeY ?? 0;
  const screenY = (worldY) => canvas.clientHeight * (0.5 - worldY / (2 * camDist * TAN));
  const resizeHooks = [];
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return; // hidden tab or collapsed layout: keep the last good size
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // The subject fills at most 72% of the width, and is never closer than 6.2 units.
    camDist = Math.max(6.2, subject.fitWidth / (0.72 * 2 * TAN * camera.aspect));
    // The camera sits at the subject's eye level so it is seen straight on. A
    // lens shift (not a tilt) then moves the picture so the layout is unchanged:
    // world height 0 still lands on the middle of the screen.
    camera.setViewOffset(w, h, 0, (eyeY / (2 * camDist * TAN)) * h, w, h);
    camera.updateProjectionMatrix();
    for (const hook of resizeHooks) hook();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // Keep the text block just under the subject's floor line where asked.
  const tagline = document.querySelector(".under");
  if (tagline && (portrait || pinTagline)) {
    resizeHooks.push(() => (tagline.style.top = `${Math.round(screenY(subject.floorY) + 22)}px`));
    resizeHooks.at(-1)();
  }

  // Pointer ------------------------------------------------------------------
  const ndc = new THREE.Vector2(0, 0);
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  // x, y: where the pointer is on the z = 0 plane. px, py: where it was at the
  // previous step. sweeping: it is moving fast enough to disturb things.
  const cursor = { x: 99, y: 99, px: 99, py: 99, vx: 0, vy: 0, speed: 0, present: false, sweeping: false };
  let lastInput = -1e9;
  const clicks = [];
  let onClick = null;

  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(plane, hit);
  }
  window.addEventListener("pointermove", (e) => {
    if (!toWorld(e)) return;
    const now = performance.now() / 1000;
    if (cursor.present) {
      const dt = Math.max(1 / 240, now - lastInput);
      cursor.vx += ((hit.x - cursor.x) / dt - cursor.vx) * 0.5;
      cursor.vy += ((hit.y - cursor.y) / dt - cursor.vy) * 0.5;
    } else {
      cursor.px = hit.x;
      cursor.py = hit.y;
    }
    cursor.x = hit.x;
    cursor.y = hit.y;
    cursor.present = true;
    lastInput = now;
  });
  document.documentElement.addEventListener("pointerleave", () => (cursor.present = false));
  window.addEventListener("pointerdown", (e) => {
    if (e.target.closest?.("a")) return;
    if (toWorld(e)) clicks.push([hit.x, hit.y]);
  });

  // Squared distance from (x, y) to the segment the pointer swept this step.
  cursor.dist2 = (x, y) => {
    const sx = cursor.x - cursor.px;
    const sy = cursor.y - cursor.py;
    const len2 = sx * sx + sy * sy;
    let u = len2 > 1e-9 ? ((x - cursor.px) * sx + (y - cursor.py) * sy) / len2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const dx = x - (cursor.px + sx * u);
    const dy = y - (cursor.py + sy * u);
    return dx * dx + dy * dy;
  };

  // Loop ---------------------------------------------------------------------
  // Simulation time advances by the clamped frame time, so a stalled tab resumes
  // where it left off instead of jumping.
  let simTime = 0;
  let stepFn = null;
  const look = new THREE.Vector3(0, eyeY, 0);
  camera.position.set(0, eyeY, camDist);

  function advance(dt) {
    simTime += dt;
    cursor.speed = Math.min(10, Math.hypot(cursor.vx, cursor.vy));
    cursor.sweeping = cursor.present && cursor.speed > 0.2 && performance.now() / 1000 - lastInput < 0.12;
    while (clicks.length) {
      const [x, y] = clicks.shift();
      onClick?.(x, y, simTime);
    }
    stepFn(simTime, dt);
    cursor.px = cursor.x;
    cursor.py = cursor.y;
    const fade = Math.exp(-8 * dt);
    cursor.vx *= fade;
    cursor.vy *= fade;
    if (wrote) {
      subject.mesh.packedSplats.needsUpdate = true;
      subject.mesh.needsUpdate = true;
      wrote = false;
    }
  }

  function frame(dt) {
    // Slight parallax so depth reads.
    const tx = cursor.present ? ndc.x * 0.55 * parallax : 0;
    const ty = cursor.present ? ndc.y * 0.3 * parallax : 0;
    camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 2);
    camera.position.y += (eyeY + ty - camera.position.y) * Math.min(1, dt * 2);
    camera.position.z = camDist;
    camera.lookAt(look);
    renderer.render(scene, camera);
  }

  function start(step) {
    stepFn = step;
    let last = null;
    renderer.setAnimationLoop((ms) => {
      const now = ms / 1000;
      const dt = last === null ? 1 / 60 : Math.min(1 / 30, Math.max(0, now - last));
      last = now;
      advance(dt);
      frame(dt);
    });
  }

  return {
    portrait,
    count: subject.count,
    home: subject.home,
    spacing: subject.spacing,
    area: subject.area,
    depth: subject.depth, // how far the subject extends in z
    minX: subject.minX,
    maxX: subject.maxX,
    midY: subject.midY,
    floorY: subject.floorY,
    cursor,
    scene,
    camera,
    renderer,
    canvas,
    mute,
    put,
    start,
    set onClick(fn) {
      onClick = fn;
    },
    onResize: (hook) => {
      resizeHooks.push(hook);
      hook();
    },
    screenY, // screen y (CSS px) of a world height on the z = 0 plane, camera at rest
    // How much of the z = 0 plane is on screen: half its width, and its top edge.
    view: () => ({ halfWidth: camDist * TAN * camera.aspect, top: camDist * TAN }),
  };
}
