// Two real robot arms, drawn over a page.
//
// The arms are the ones I work with: UFACTORY xArm7s with their grippers. The
// joint tree and meshes are baked from the MuJoCo Menagerie model (see
// arms/LICENSE.txt). The page is the plane z = 0, seen straight on, one metre
// to `K` pixels; the arms stand in front of it at the bottom corners and reach
// back to it. Everything here is in metres and radians.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";

const CAMERA_DISTANCE = 2.6; // far enough that the page plane maps to pixels almost without perspective
const CREASE = 0.7; // edges sharper than this stay sharp

// Looks -------------------------------------------------------------------

function materialFor([r, g, b]) {
  const light = (r + g + b) / 3;
  if (light > 0.85)
    return new THREE.MeshPhysicalMaterial({ color: 0xf1f1ee, roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  if (light > 0.5) return new THREE.MeshStandardMaterial({ color: 0xb9bbbd, roughness: 0.35, metalness: 0.75 });
  return new THREE.MeshStandardMaterial({ color: light > 0.2 ? 0x2f3134 : 0x1b1c1e, roughness: 0.55, metalness: 0.1 });
}

// Loading -----------------------------------------------------------------

export async function loadRobot(name) {
  const base = new URL(`arms/${name}`, import.meta.url);
  const [spec, bin] = await Promise.all([fetch(`${base}.json`).then((r) => r.json()), fetch(`${base}.bin`).then((r) => r.arrayBuffer())]);
  spec.geometries = spec.meshes.map((m) => {
    const q = new Int16Array(bin, m.vOff, m.vCount * 3);
    const position = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) {
      const axis = i % 3;
      position[i] = m.lo[axis] + ((q[i] + 32768) / 65535) * (m.hi[axis] - m.lo[axis]);
    }
    const indexed = new THREE.BufferGeometry();
    indexed.setAttribute("position", new THREE.BufferAttribute(position, 3));
    indexed.setIndex(new THREE.BufferAttribute(new Uint16Array(bin, m.iOff, m.iCount), 1));
    return toCreasedNormals(indexed, CREASE);
  });
  spec.materials = new Map();
  return spec;
}

const quat = ([w, x, y, z]) => new THREE.Quaternion(x, y, z, w); // MuJoCo keeps w first

// One arm -----------------------------------------------------------------

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _m3 = new THREE.Matrix3();

export class Arm {
  // side: -1 stands at the left and faces right, +1 the mirror of it.
  constructor(spec, side) {
    this.spec = spec;
    this.side = side;
    this.root = new THREE.Group();
    // The arm's own frame is z up, x forward. Here up is the page's up, and
    // forward is towards the middle of the page.
    this.root.quaternion.setFromRotationMatrix(
      _m.makeBasis(new THREE.Vector3(-side, 0, 0), new THREE.Vector3(0, 0, side), new THREE.Vector3(0, 1, 0))
    );

    // Each body is a frame fixed in its parent, holding a node its joint turns.
    const moving = [];
    spec.bodies.forEach((body, i) => {
      const frame = new THREE.Group();
      frame.position.fromArray(body.pos);
      frame.quaternion.copy(quat(body.quat));
      const node = new THREE.Group();
      frame.add(node);
      (body.parent < 0 ? this.root : moving[body.parent]).add(frame);
      moving[i] = node;
    });
    for (const g of spec.geoms) {
      const key = g.color.join();
      if (!spec.materials.has(key)) spec.materials.set(key, materialFor(g.color));
      const mesh = new THREE.Mesh(spec.geometries[g.mesh], spec.materials.get(key));
      mesh.position.fromArray(g.pos);
      mesh.quaternion.copy(quat(g.quat));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      moving[g.body].add(mesh);
    }

    this.joints = new Map(spec.joints.map((j) => [j.name, { ...j, node: moving[j.body], axis: new THREE.Vector3().fromArray(j.axis) }]));
    this.chain = spec.armJoints.map((n) => this.joints.get(n));
    this.n = this.chain.length;
    this.q = new Float64Array(this.n);
    this.rest = new Float64Array(this.n);

    // The tool frame: z along the approach, y across the jaws.
    this.tool = new THREE.Group();
    this.tool.position.fromArray(spec.tcp.pos);
    const z = new THREE.Vector3().fromArray(spec.tcp.approach);
    const y = new THREE.Vector3().fromArray(spec.tcp.jaw);
    this.tool.quaternion.setFromRotationMatrix(_m.makeBasis(new THREE.Vector3().crossVectors(y, z), y, z));
    moving[spec.tcp.body].add(this.tool);

    this.maxGap = spec.gripper.table.reduce((m, [, gap]) => Math.max(m, gap), 0);
    this.gap = this.maxGap;
    this.apply();
  }

  static set(joint, value) {
    if (joint.type === "hinge") joint.node.quaternion.setFromAxisAngle(joint.axis, value);
    else joint.node.position.copy(joint.axis).multiplyScalar(value);
  }

  // Put the joints and the gripper where `q` and `gap` say.
  apply() {
    for (let i = 0; i < this.n; i++) Arm.set(this.chain[i], this.q[i]);
    const table = this.spec.gripper.table;
    const gap = Math.min(this.maxGap, Math.max(0, this.gap));
    // The table runs one way; find the stretch the gap falls in.
    let drive = table[0][0];
    for (let i = 1; i < table.length; i++) {
      const [d0, g0] = table[i - 1];
      const [d1, g1] = table[i];
      if ((gap - g0) * (gap - g1) <= 0 && g0 !== g1) {
        drive = d0 + ((gap - g0) / (g1 - g0)) * (d1 - d0);
        break;
      }
    }
    for (const [name, coef] of Object.entries(this.spec.gripper.joints)) Arm.set(this.joints.get(name), coef * drive);
    this.root.updateMatrixWorld(true);
  }

  toolPosition(out = new THREE.Vector3()) {
    return out.setFromMatrixPosition(this.tool.matrixWorld);
  }
  toolQuaternion(out = new THREE.Quaternion()) {
    return out.setFromRotationMatrix(this.tool.matrixWorld);
  }
  shoulder(out = new THREE.Vector3()) {
    return out.setFromMatrixPosition(this.chain[1].node.matrixWorld);
  }

  // Damped least squares towards a tool pose, from wherever the joints are now.
  // What freedom is left over pulls gently towards the rest posture, which is
  // what keeps the elbow from wandering. Returns what it could not close.
  // `only` names the joints allowed to move (by index); the rest hold still.
  solve(position, quaternion, { iterations = 8, posture = 0.06, damping = 0.045, only = null, stride = 0.12 } = {}) {
    const n = this.n;
    const J = this._J ?? (this._J = Array.from({ length: 6 }, () => new Float64Array(n)));
    const A = this._A ?? (this._A = Array.from({ length: 6 }, () => new Float64Array(7)));
    const e = new Float64Array(6);
    let posErr = 0;
    let rotErr = 0;
    for (let it = 0; it < iterations; it++) {
      this.root.updateMatrixWorld(true);
      const p = this.toolPosition(_v);
      e[0] = position.x - p.x;
      e[1] = position.y - p.y;
      e[2] = position.z - p.z;
      // Rotation error: half the sum of the cross products of matching axes.
      _m3.setFromMatrix4(this.tool.matrixWorld);
      const cur = _m3.elements;
      _m.makeRotationFromQuaternion(quaternion);
      const tgt = _m.elements;
      _c.set(0, 0, 0);
      for (let k = 0; k < 3; k++) {
        _a.set(cur[k * 3], cur[k * 3 + 1], cur[k * 3 + 2]).normalize();
        _b.set(tgt[k * 4], tgt[k * 4 + 1], tgt[k * 4 + 2]);
        _c.add(_a.cross(_b));
      }
      e[3] = _c.x * 0.5;
      e[4] = _c.y * 0.5;
      e[5] = _c.z * 0.5;
      posErr = Math.hypot(e[0], e[1], e[2]);
      rotErr = Math.hypot(e[3], e[4], e[5]);
      // Never ask for more than a short step at a time.
      const reach = Math.min(1, stride / (posErr + 1e-9));
      const turn = Math.min(1, 0.5 / (rotErr + 1e-9));
      for (let k = 0; k < 3; k++) {
        e[k] *= reach;
        e[k + 3] *= turn * 0.35; // metres and radians on one scale
      }

      for (let i = 0; i < n; i++) {
        if (only && !only.includes(i)) {
          for (let r = 0; r < 6; r++) J[r][i] = 0;
          continue;
        }
        const joint = this.chain[i];
        _a.copy(joint.axis).transformDirection(joint.node.matrixWorld);
        _b.setFromMatrixPosition(joint.node.matrixWorld);
        _c.copy(p).sub(_b);
        _b.crossVectors(_a, _c);
        J[0][i] = _b.x;
        J[1][i] = _b.y;
        J[2][i] = _b.z;
        J[3][i] = _a.x * 0.35;
        J[4][i] = _a.y * 0.35;
        J[5][i] = _a.z * 0.35;
      }
      // Solve (J Jt + damping^2) y = e, then dq = Jt y.
      const solveWith = (rhs) => {
        for (let r = 0; r < 6; r++) {
          for (let c = 0; c < 6; c++) {
            let s = r === c ? damping * damping : 0;
            for (let i = 0; i < n; i++) s += J[r][i] * J[c][i];
            A[r][c] = s;
          }
          A[r][6] = rhs[r];
        }
        for (let c = 0; c < 6; c++) {
          let pivot = c;
          for (let r = c + 1; r < 6; r++) if (Math.abs(A[r][c]) > Math.abs(A[pivot][c])) pivot = r;
          [A[c], A[pivot]] = [A[pivot], A[c]];
          for (let r = c + 1; r < 6; r++) {
            const f = A[r][c] / A[c][c];
            for (let k = c; k < 7; k++) A[r][k] -= f * A[c][k];
          }
        }
        const y = new Float64Array(6);
        for (let r = 5; r >= 0; r--) {
          let s = A[r][6];
          for (let k = r + 1; k < 6; k++) s -= A[r][k] * y[k];
          y[r] = s / A[r][r];
        }
        const dq = new Float64Array(n);
        for (let i = 0; i < n; i++) for (let r = 0; r < 6; r++) dq[i] += J[r][i] * y[r];
        return dq;
      };
      const dq = solveWith(e);
      // Posture, projected so it does not move the tool.
      const want = new Float64Array(n);
      for (let i = 0; i < n; i++) want[i] = only && !only.includes(i) ? 0 : posture * (this.rest[i] - this.q[i]);
      const Jw = new Float64Array(6);
      for (let r = 0; r < 6; r++) for (let i = 0; i < n; i++) Jw[r] += J[r][i] * want[i];
      const back = solveWith(Jw);
      for (let i = 0; i < n; i++) {
        const [lo, hi] = this.chain[i].range;
        this.q[i] = Math.min(hi, Math.max(lo, this.q[i] + dq[i] + want[i] - back[i]));
        Arm.set(this.chain[i], this.q[i]);
      }
    }
    this.root.updateMatrixWorld(true);
    return { posErr, rotErr };
  }
}

// The rig -----------------------------------------------------------------

export async function createRig({ canvas, robot = "xarm7" }) {
  const spec = await loadRobot(robot);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // White arms on a light page need a dimmer room to keep their shape.
  const [r, g, b] = (getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) ?? [255, 255, 255]).map(Number);
  const lightPage = (r + g + b) / 3 > 140;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = lightPage ? 0.62 : 0.85;
  renderer.toneMappingExposure = lightPage ? 0.96 : 1.05;

  // One key light from up and to the left, in front of the page, so the arms
  // drop a soft shadow onto what they reach over.
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 7;
  key.shadow.blurSamples = 16;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.004;
  scene.add(key, key.target);

  // The page: nothing to see but the shadows that land on it.
  const page = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: lightPage ? 0.2 : 0.45 }));
  page.receiveShadow = true;
  scene.add(page);

  const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 20);
  const arms = [new Arm(spec, -1), new Arm(spec, 1)];
  for (const arm of arms) scene.add(arm.root);

  const rig = {
    spec,
    arms,
    scene,
    camera,
    renderer,
    K: 800, // pixels to the metre
    W: 0,
    H: 0,
    // Page pixels (from the window's top left) to the plane z, and back.
    toWorld(px, py, z = 0, out = new THREE.Vector3()) {
      const s = (CAMERA_DISTANCE - z) / CAMERA_DISTANCE; // further from the eye covers more
      return out.set(((px - rig.W / 2) / rig.K) * s, ((rig.H / 2 - py) / rig.K) * s, z);
    },
    toScreen(v) {
      const s = CAMERA_DISTANCE / (CAMERA_DISTANCE - v.z);
      return { x: rig.W / 2 + v.x * rig.K * s, y: rig.H / 2 - v.y * rig.K * s, scale: s };
    },
    // Lay the stage out for a window: the scale, and where the two bases stand.
    layout({ K, baseX, baseY, baseZ = 0.13 }) {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      rig.W = w;
      rig.H = h;
      rig.K = K;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(h / K / 2 / CAMERA_DISTANCE));
      camera.position.set(0, 0, CAMERA_DISTANCE);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      const halfW = w / K / 2;
      const halfH = h / K / 2;
      page.scale.set(halfW * 2.4, halfH * 2.4, 1);
      key.position.set(-halfW * 0.5, halfH * 1.3, 1.9);
      key.target.position.set(0, -halfH * 0.2, 0);
      const cam = key.shadow.camera;
      cam.left = -halfW * 1.4;
      cam.right = halfW * 1.4;
      cam.top = halfH * 1.6;
      cam.bottom = -halfH * 1.6;
      cam.near = 0.2;
      cam.far = 6;
      cam.updateProjectionMatrix();
      for (const arm of arms) {
        rig.toWorld(arm.side < 0 ? baseX : w - baseX, baseY, 0, arm.root.position);
        arm.root.position.z = baseZ;
        arm.root.updateMatrixWorld(true);
      }
    },
    render() {
      renderer.render(scene, camera);
    },
  };
  return rig;
}
