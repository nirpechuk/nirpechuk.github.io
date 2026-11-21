// A panel for tuning how the arms look: the light on them, the shadows they
// drop, what they are made of, and the colours of the page behind. It sits
// folded at the bottom right. What is set is kept in this browser (apart for
// light and dark), and "Copy settings" puts the values on the clipboard.

import * as THREE from "three";
import GUI from "lil-gui";

const TONES = { ACES: THREE.ACESFilmicToneMapping, Neutral: THREE.NeutralToneMapping, AgX: THREE.AgXToneMapping, Plain: THREE.LinearToneMapping };

export function tune(rig) {
  const { renderer, scene, key, fill, ground, materials } = rig;
  const root = document.documentElement;
  const css = (name) => getComputedStyle(root).getPropertyValue(name).trim();
  const hex = (color) => `#${color.getHexString()}`;
  const store = `arms-look-${matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"}`;

  // Where things stand now is what "Reset" goes back to.
  const from = key.position.clone().sub(key.target.position);
  const defaults = {
    exposure: renderer.toneMappingExposure,
    tone: "ACES",
    key: key.intensity,
    keyColor: hex(key.color),
    azimuth: Math.round(THREE.MathUtils.radToDeg(Math.atan2(from.y, from.x))),
    elevation: Math.round(THREE.MathUtils.radToDeg(Math.asin(from.z / from.length()))),
    room: scene.environmentIntensity,
    fill: 0,
    shadow: ground.opacity,
    blur: 0,
    shell: hex(materials.shell.color),
    shellRough: materials.shell.roughness,
    shellCoat: materials.shell.clearcoat,
    trim: hex(materials.trim.color),
    trimRough: materials.trim.roughness,
    trimMetal: materials.trim.metalness,
    grip: hex(materials.grip.color),
    gripRough: materials.grip.roughness,
    background: css("--bg"),
    ink: css("--ink"),
    mute: css("--mute"),
  };
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(store) ?? "{}");
  } catch {
    /* nothing kept, or storage is off */
  }
  const look = { ...defaults, ...saved };

  const recompile = () => scene.traverse((o) => o.material && (o.material.needsUpdate = true));

  function apply() {
    if (renderer.toneMapping !== TONES[look.tone]) {
      renderer.toneMapping = TONES[look.tone];
      recompile();
    }
    renderer.toneMappingExposure = look.exposure;
    key.intensity = look.key;
    key.color.set(look.keyColor);
    rig.light.azimuth = look.azimuth;
    rig.light.elevation = look.elevation;
    rig.aim();
    scene.environmentIntensity = look.room;
    fill.intensity = look.fill;

    // Blurred shadows need the other kind of shadow map.
    const kind = look.blur > 0 ? THREE.VSMShadowMap : THREE.PCFSoftShadowMap;
    if (renderer.shadowMap.type !== kind) {
      renderer.shadowMap.type = kind;
      key.shadow.map?.dispose();
      key.shadow.map = null;
      recompile();
    }
    key.shadow.radius = Math.max(1, look.blur);
    key.shadow.blurSamples = Math.round(Math.min(25, Math.max(8, look.blur * 1.2)));
    ground.opacity = look.shadow;

    materials.shell.color.set(look.shell);
    materials.shell.roughness = look.shellRough;
    materials.shell.clearcoat = look.shellCoat;
    materials.trim.color.set(look.trim);
    materials.trim.roughness = look.trimRough;
    materials.trim.metalness = look.trimMetal;
    materials.grip.color.set(look.grip);
    materials.grip.roughness = look.gripRough;

    root.style.setProperty("--bg", look.background);
    root.style.setProperty("--ink", look.ink);
    root.style.setProperty("--mute", look.mute);
  }

  const gui = new GUI({ title: "Tune the look", width: 280 });
  Object.assign(gui.domElement.style, { top: "auto", bottom: "12px", right: "12px", zIndex: "10" });

  const light = gui.addFolder("Light");
  light.add(look, "key", 0, 6, 0.05).name("strength");
  light.addColor(look, "keyColor").name("colour");
  light.add(look, "azimuth", -180, 180, 1).name("from (round)");
  light.add(look, "elevation", 20, 89, 1).name("from (height)");
  light.add(look, "room", 0, 2.5, 0.01).name("room light");
  light.add(look, "fill", 0, 3, 0.01).name("flat fill");
  light.add(look, "exposure", 0.3, 2, 0.01);
  light.add(look, "tone", Object.keys(TONES)).name("tone curve");

  const shadow = gui.addFolder("Shadow");
  shadow.add(look, "shadow", 0, 1, 0.01).name("darkness");
  shadow.add(look, "blur", 0, 30, 0.5).name("diffusion");

  const arms = gui.addFolder("Arms");
  arms.addColor(look, "shell").name("shell");
  arms.add(look, "shellRough", 0, 1, 0.01).name("shell roughness");
  arms.add(look, "shellCoat", 0, 1, 0.01).name("shell gloss coat");
  arms.addColor(look, "trim").name("trim");
  arms.add(look, "trimRough", 0, 1, 0.01).name("trim roughness");
  arms.add(look, "trimMetal", 0, 1, 0.01).name("trim metal");
  arms.addColor(look, "grip").name("gripper");
  arms.add(look, "gripRough", 0, 1, 0.01).name("gripper roughness");

  const page = gui.addFolder("Page");
  page.addColor(look, "background");
  page.addColor(look, "ink").name("text");
  page.addColor(look, "mute").name("quiet text");

  const actions = {
    async copy() {
      const text = JSON.stringify(look, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        copied.name("Copied");
      } catch {
        prompt("Copy these settings:", text);
      }
      setTimeout(() => copied.name("Copy settings"), 1500);
    },
    reset() {
      Object.assign(look, defaults);
      for (const c of gui.controllersRecursive()) c.updateDisplay();
      try {
        localStorage.removeItem(store);
      } catch {
        /* storage is off */
      }
      apply();
    },
  };
  const copied = gui.add(actions, "copy").name("Copy settings");
  gui.add(actions, "reset").name("Reset");

  gui.onChange(() => {
    apply();
    try {
      localStorage.setItem(store, JSON.stringify(look));
    } catch {
      /* storage is off */
    }
  });
  gui.close();
  apply();
  return { look, apply, gui };
}
