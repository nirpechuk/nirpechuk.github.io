// A panel for choosing the page's palette and the texture of its background.
// It sits folded at the bottom right; the arrow keys step through the choices.
// What is chosen is kept in this browser, and "Copy settings" puts the values
// on the clipboard.
//
// None of the colours are made up here. Each palette is a published one, with
// the values taken from its own source: a university's brand guide, Sanzo
// Wada's Dictionary of Color Combinations (by its combination number), or a
// scheme its authors documented role by role.

import GUI from "lil-gui";

// name: [source, background, text, secondary text, links]. Where a source gives
// no secondary text, or gives one too faint to read on its background, it is
// mixed from the text and the background; missing links take the text colour.
const PALETTES = {
  // Deep backgrounds: greens, and jewel tones.
  "CMU · Hornbostel Teal": [
    "cmu.edu/brand, campus palette: Hornbostel Teal, Kittanning Brick Beige, Machinery Hall Tan",
    "#1f4c4c",
    "#e4dac4",
    "#bcb49e",
  ],
  "CMU · Weaver Blue": ["cmu.edu/brand, campus palette: Weaver Blue, Kittanning Brick Beige, Machinery Hall Tan", "#182c4b", "#e4dac4", "#bcb49e"],
  "CMU · Skibo Red": ["cmu.edu/brand, campus palette: Skibo Red, Kittanning Brick Beige, Machinery Hall Tan", "#941120", "#e4dac4", "#bcb49e"],
  "Dartmouth · Forest Green": [
    "communications.dartmouth.edu: Forest Green, Snow White, Gray 2, Spring Green",
    "#12312b",
    "#ffffff",
    "#e2e2e2",
    "#c4dd88",
  ],
  "Dartmouth · Dartmouth Green": [
    "communications.dartmouth.edu: Dartmouth Green, Snow White, Gray 2, Spring Green",
    "#00693e",
    "#ffffff",
    "#e2e2e2",
    "#c4dd88",
  ],
  "Michigan State · Spartan Green": ["brand.msu.edu: Spartan Green, White", "#18453b", "#ffffff"],
  "Yale · Yale Blue": ["yaleidentity.yale.edu: Yale Blue, white", "#00356b", "#ffffff"],
  "Wada 84 · Deep Slate Green": ["Wada, combination 84: Deep Slate Green, Seashell Pink", "#112f2c", "#fdd4bd"],
  "Wada 325 · Deep Slate Green": ["Wada, combination 325: Deep Slate Green, Naples Yellow, Yellow Ocher", "#112f2c", "#fbe6a0", "#e2b540"],
  "Wada 166 · Deep Slate Green": ["Wada, combination 166: Deep Slate Green, Naples Yellow, Grenadine Pink", "#112f2c", "#fbe6a0", "#f48067"],
  "Wada 271 · Deep Slate Green": ["Wada, combination 271: Deep Slate Green, Cobalt Green", "#112f2c", "#96d1aa"],
  "Wada 151 · Vandar Poel's Blue": ["Wada, combination 151: Vandar Poel's Blue, Sulpher Yellow", "#064f6e", "#f5ecc2"],
  "Wada 60 · Dark Tyrian Blue": ["Wada, combination 60: Dark Tyrian Blue, Pale Lemon Yellow", "#12354e", "#ffefae"],
  "Wada 119 · Dark Tyrian Blue": ["Wada, combination 119: Dark Tyrian Blue, Light Glaucous Blue", "#12354e", "#a5c8d1"],
  "Wada 139 · Deep Indigo": ["Wada, combination 139: Deep Indigo, Neutral Gray, Salvia Blue", "#051230", "#b6bfc1", "#97acc8"],
  "Wada 50 · Dusky Madder Violet": ["Wada, combination 50: Dusky Madder Violet, Ivory Buff", "#4e1d4c", "#ebd3a2"],
  "Wada 329 · Cotinga Purple": ["Wada, combination 329: Cotinga Purple, Cream Yellow, Grayish Lavender", "#501345", "#fdbf68", "#c0a9b3"],
  Everforest: ["sainnhe/everforest, dark medium: bg0, fg, grey1", "#2d353b", "#d3c6aa", "#859289"],
  "Solarized Dark": ["ethanschoonover.com/solarized: base03, base1, base01", "#002b36", "#93a1a1", "#586e75"],
  "Night Owl": ["sdras/night-owl-vscode-theme: background, foreground, comments", "#011627", "#d6deeb", "#637777"],
  Cobalt2: ["wesbos/cobalt2-vscode: background, foreground, description, accent", "#193549", "#ffffff", "#aaaaaa", "#ffc600"],
  "Rosé Pine Moon": ["rose-pine palette, Moon: base, text, subtle", "#232136", "#e0def4", "#908caa"],
  "Rosé Pine": ["rose-pine palette, main: base, text, subtle", "#191724", "#e0def4", "#908caa"],
  "Catppuccin Mocha": ["catppuccin/palette, Mocha: base, text, subtext0", "#1e1e2e", "#cdd6f4", "#a6adc8"],
  "Nord Polar Night": ["nordtheme.com: nord0, nord6, nord4", "#2e3440", "#eceff4", "#d8dee9"],
  // Paper.
  "Tufte CSS": ["edwardtufte/tufte-css", "#fffff8", "#111111"],
  "LaTeX.css": ["vincentdoerig/latex-css", "#f9fafb", "#1b1818"],
  Flexoki: ["stephango.com/flexoki: paper, black, tx-2", "#fffcf0", "#100f0f", "#6f6e69"],
  "Solarized Light": ["ethanschoonover.com/solarized: base3, base01, base1", "#fdf6e3", "#586e75", "#93a1a1"],
  "Radix Sand": ["radix-ui/colors: sand 2, 12, 11", "#f9f9f8", "#21201c", "#63635e"],
  "Radix Slate": ["radix-ui/colors: slate 2, 12, 11", "#f9f9fb", "#1c2024", "#60646c"],
  "Radix Olive": ["radix-ui/colors: olive 2, 12, 11", "#f8faf8", "#1d211c", "#60655f"],
  "Radix Mauve": ["radix-ui/colors: mauve 2, 12, 11", "#faf9fb", "#211f26", "#65636d"],
  "Rosé Pine Dawn": ["rose-pine palette, Dawn: base, text, subtle", "#faf4ed", "#464261", "#797593"],
  "Catppuccin Latte": ["catppuccin/palette, Latte: base, text, subtext0", "#eff1f5", "#4c4f69", "#6c6f85"],
  "Nord Snow Storm": ["nordtheme.com: nord6, nord0, nord3", "#eceff4", "#2e3440", "#4c566a"],
  "Carnegie Mellon": ["cmu.edu/brand, core: White, Black, Iron Gray, Carnegie Red", "#ffffff", "#000000", "#6d6e71", "#c41230"],
  "Carnegie Mellon, steel": ["cmu.edu/brand, core: Steel Gray, Black, Iron Gray, Carnegie Red", "#e0e0e0", "#000000", "#6d6e71", "#c41230"],
};

// Textures to lay over the background: seamless tiles from Transparent
// Textures (transparenttextures.com), which are see-through, so they take on
// whatever colour is behind them. Served from there for now. The two stipples
// are drawn here instead: dots thrown at random, none too near another.
const TEXTURES = {
  None: null,
  Stipple: { dots: "even" },
  "Stipple, fading up": { dots: "fade" },
  "Linen, low contrast": "low-contrast-linen",
  "Linen, fine": "white-linen",
  "Linen, heavy": "black-linen",
  "Rough cloth": "rough-cloth",
  "Rough cloth, light": "rough-cloth-light",
  "Clean textile": "clean-textile",
  "Fabric of squares": "fabric-of-squares",
  Woven: "woven",
  "Woven, light": "woven-light",
  "Cloth alike": "cloth-alike",
  "Light wool": "light-wool",
  Tweed: "tweed",
  "Natural paper": "natural-paper",
  "Cream paper": "cream-paper",
  "Handmade paper": "handmade-paper",
  "Textured paper": "textured-paper",
  "Paper fibers": "paper-fibers",
  "Paper fibers, light": "light-paper-fibers",
  "Rice paper": "rice-paper",
};

// Colours for the text, to try against whichever background is chosen. Again
// none are invented: each is a named colour from a published palette.
const TONES = {
  "Snow White": ["#ffffff", "Dartmouth"],
  "Gray 1": ["#f7f7f7", "Dartmouth"],
  "Gray 2": ["#e2e2e2", "Dartmouth"],
  "Spring Green": ["#c4dd88", "Dartmouth"],
  "Rich Spring Green": ["#a5d75f", "Dartmouth"],
  "Summer Yellow": ["#f5dc69", "Dartmouth"],
  "Bonfire Orange": ["#ffa00f", "Dartmouth"],
  "Naples Yellow": ["#fbe6a0", "Wada, with Deep Slate Green (166, 325)"],
  "Seashell Pink": ["#fdd4bd", "Wada, with Deep Slate Green (84)"],
  "Cobalt Green": ["#96d1aa", "Wada, with Deep Slate Green (271)"],
  "Yellow Ocher": ["#e2b540", "Wada, with Deep Slate Green (325)"],
  "Olive Ocher": ["#d6b43e", "Wada, with Deep Slate Green (149)"],
  "Grenadine Pink": ["#f48067", "Wada, with Deep Slate Green (166)"],
  Orange: ["#f37420", "Wada, with Deep Slate Green (149)"],
  "Kittanning Brick Beige": ["#e4dac4", "Carnegie Mellon, campus palette"],
  "Machinery Hall Tan": ["#bcb49e", "Carnegie Mellon, campus palette"],
  "Palladian Green": ["#719f94", "Carnegie Mellon, campus palette"],
  "Everforest fg": ["#d3c6aa", "Everforest"],
  "Everforest green": ["#a7c080", "Everforest"],
  "Everforest aqua": ["#83c092", "Everforest"],
  "Everforest blue": ["#7fbbb3", "Everforest"],
  "Everforest yellow": ["#dbbc7f", "Everforest"],
  "Everforest orange": ["#e69875", "Everforest"],
  "Everforest red": ["#e67e80", "Everforest"],
  "Everforest purple": ["#d699b6", "Everforest"],
  "Everforest grey": ["#9da9a0", "Everforest"],
  "Flexoki paper": ["#fffcf0", "Flexoki"],
  "Flexoki base-200": ["#cecdc3", "Flexoki"],
  "Solarized base3": ["#fdf6e3", "Solarized"],
  "Solarized base2": ["#eee8d5", "Solarized"],
  "Tufte paper": ["#fffff8", "Tufte CSS"],
};

// The same dots every time, so a stipple does not shimmer when it is redrawn.
function dice(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A stippled sheet, w by h pixels, as an image. `even` is one tile that repeats
// seamlessly; otherwise the dots are close-set along the bottom and thin out
// to nothing about halfway up, the way a stippled drawing shades.
const TIGHT = 3.4; // the closest two dots come, px
function stipple(w, h, even) {
  const random = dice(even ? 11 : 23);
  const cell = TIGHT / Math.SQRT2;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const grid = new Int32Array(cols * rows).fill(-1);
  const xs = [];
  const ys = [];
  const scale = Math.min(devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const c = canvas.getContext("2d");
  c.scale(scale, scale);
  c.fillStyle = "rgba(0, 0, 0, 0.62)";
  for (let tries = (w * h * (even ? 1.2 : 2.4)) / (TIGHT * TIGHT); tries > 0; tries--) {
    const x = random() * w;
    const y = random() * h;
    // How thickly it should be dotted here: 1 is as close as dots go.
    let thick = 0.3;
    if (!even) {
      const up = 1 - y / h;
      thick = Math.max(0, 1 - up / 0.55) ** 2.2;
      if (thick < 1 / 16) {
        if (random() > thick * 16) continue;
        thick = 1 / 16;
      }
    }
    const gap = TIGHT / Math.sqrt(thick);
    const reach = Math.ceil(gap / cell);
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    let clear = true;
    for (let j = cy - reach; j <= cy + reach && clear; j++) {
      for (let i = cx - reach; i <= cx + reach && clear; i++) {
        // The tile wraps round; the full sheet does not.
        const gi = even ? (i + cols) % cols : i;
        const gj = even ? (j + rows) % rows : j;
        if (gi < 0 || gj < 0 || gi >= cols || gj >= rows) continue;
        const k = grid[gj * cols + gi];
        if (k < 0) continue;
        let dx = Math.abs(xs[k] - x);
        let dy = Math.abs(ys[k] - y);
        if (even) {
          dx = Math.min(dx, w - dx);
          dy = Math.min(dy, h - dy);
        }
        if (dx * dx + dy * dy < gap * gap) clear = false;
      }
    }
    if (!clear) continue;
    grid[cy * cols + cx] = xs.length;
    xs.push(x);
    ys.push(y);
    const r = 0.55 + random() * 0.5;
    // A dot on the edge of the tile shows on the opposite edge too.
    for (const ox of even ? [-w, 0, w] : [0]) {
      for (const oy of even ? [-h, 0, h] : [0]) {
        c.beginPath();
        c.arc(x + ox, y + oy, r, 0, 6.2832);
        c.fill();
      }
    }
  }
  return canvas.toDataURL();
}

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, t) =>
  `#${channels(a)
    .map((c, i) => Math.round(c * t + channels(b)[i] * (1 - t)))
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
// Relative luminance and contrast, as WCAG reckons them.
const luminance = (hex) => {
  const [r, g, b] = channels(hex).map((c) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

export function tune(tidy) {
  const body = document.body;
  // (Kept under a new name since the page's own colours changed, so nothing saved against the old ones comes back.)
  const store = "arms-palette-4";
  const css = (name) => getComputedStyle(body).getPropertyValue(name).trim();

  // The page as it stands is the first palette on the list, and what "Reset" returns to.
  const palettes = { "As it is": ["this page", css("--bg"), css("--ink"), css("--mute"), css("--link")], ...PALETTES };
  const colours = (name) => {
    const [source, background, ink, quiet, link] = palettes[name];
    const mute = quiet && contrast(quiet, background) >= 4.5 ? quiet : mix(ink, background, 0.62);
    return { source, background, ink, mute, link: link ?? ink };
  };

  const defaults = {
    palette: "As it is",
    ...colours("As it is"),
    nameTone: "As it is",
    linkTone: "As it is",
    texture: "None",
    grain: 0.5,
    weave: 1,
    flip: false,
  };
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(store) ?? "{}");
  } catch {
    /* nothing kept, or storage is off */
  }
  const look = { ...defaults };
  for (const key of Object.keys(defaults)) if (typeof saved[key] === typeof defaults[key]) look[key] = saved[key];
  if (!palettes[look.palette]) Object.assign(look, defaults);
  if (!(look.texture in TEXTURES)) look.texture = "None";

  // The texture is a sheet of its own between the page's colour and its text.
  const sheet = document.createElement("div");
  Object.assign(sheet.style, { position: "fixed", top: "0", left: "0", zIndex: "0", pointerEvents: "none", transformOrigin: "0 0" });
  body.prepend(sheet);

  function apply() {
    body.style.setProperty("--bg", look.background);
    body.style.setProperty("--ink", look.ink);
    body.style.setProperty("--mute", look.mute);
    body.style.setProperty("--link", look.link);
    // Shadows have to be heavier to show on a dark page.
    tidy.rig.backdrop(luminance(look.background) > 0.25);
    tidy.wake();

    const tile = TEXTURES[look.texture];
    sheet.style.display = tile ? "block" : "none";
    if (!tile) return;
    // Drawn larger or smaller by scaling the whole sheet; a texture's marks are
    // dark or light, and flipping them suits the other kind of background.
    Object.assign(sheet.style, {
      width: `${100 / look.weave}vw`,
      height: `${100 / look.weave}vh`,
      transform: `scale(${look.weave})`,
      opacity: String(look.grain),
      filter: look.flip ? "invert(1)" : "none",
    });
    let image = `https://www.transparenttextures.com/patterns/${tile}.png`;
    let size = "auto";
    if (tile.dots) {
      // The even stipple is one small tile; the fading one covers the sheet.
      const w = tile.dots === "even" ? 260 : Math.ceil(innerWidth / look.weave);
      const h = tile.dots === "even" ? 260 : Math.ceil(innerHeight / look.weave);
      const key = `${tile.dots} ${w} ${h}`;
      if (drawn.key !== key) Object.assign(drawn, { key, image: stipple(w, h, tile.dots === "even") });
      image = drawn.image;
      size = tile.dots === "even" ? `${w}px ${h}px` : "100% 100%";
    }
    Object.assign(sheet.style, {
      backgroundImage: `url("${image}")`,
      backgroundSize: size,
      backgroundRepeat: tile.dots === "fade" ? "no-repeat" : "repeat",
    });
  }
  const drawn = { key: "", image: "" }; // the last stipple made, kept until its size changes
  let resized = 0;
  addEventListener("resize", () => {
    clearTimeout(resized);
    resized = setTimeout(apply, 200);
  });

  const gui = new GUI({ title: "Palette and texture", width: 300 });
  Object.assign(gui.domElement.style, { top: "auto", bottom: "12px", right: "12px", zIndex: "10" });
  const refresh = () => gui.controllersRecursive().forEach((c) => c.updateDisplay());

  gui.add(look, "palette", Object.keys(palettes));
  gui.add(look, "source").name("from").disable();
  gui.addColor(look, "background");
  gui.addColor(look, "ink").name("text");
  gui.addColor(look, "mute").name("quiet text");
  gui.addColor(look, "link").name("links");

  // A colour for the name, and one for the links.
  const tones = ["As it is", ...Object.keys(TONES)];
  const text = gui.addFolder("Text colours");
  text.add(look, "nameTone", tones).name("name");
  text.add(look, "linkTone", tones).name("links");

  const cloth = gui.addFolder("Texture");
  cloth.add(look, "texture", Object.keys(TEXTURES));
  cloth.add(look, "grain", 0, 1, 0.01).name("strength");
  cloth.add(look, "weave", 0.4, 2.5, 0.05).name("scale");
  cloth.add(look, "flip").name("flip light and dark");

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
      refresh();
    },
  };
  const copied = gui.add(actions, "copy").name("Copy settings");
  gui.add(actions, "reset").name("Reset");

  gui.onChange((change) => {
    // Choosing a palette sets all four colours; they can then be adjusted one by one.
    if (change.property === "palette") {
      Object.assign(look, colours(change.value), { nameTone: "As it is", linkTone: "As it is" });
      refresh();
    }
    // A colour for the name, or one for the links.
    if (change.property === "nameTone" || change.property === "linkTone") {
      const own = colours(look.palette);
      const hex = TONES[change.value]?.[0];
      if (change.property === "nameTone") look.ink = hex ?? own.ink;
      else look.link = hex ?? own.link;
      refresh();
    }
    apply();
    try {
      localStorage.setItem(store, JSON.stringify(look));
    } catch {
      /* storage is off */
    }
  });
  // The arrow keys step through the choices, and a note in the corner says
  // which one this is.
  const note = document.createElement("div");
  Object.assign(note.style, {
    position: "fixed",
    left: "16px",
    bottom: "14px",
    zIndex: "10",
    font: "0.8rem/1.3 inherit",
    color: "var(--mute)",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity 0.25s",
  });
  body.append(note);
  let fading = 0;
  function step(property, names, by) {
    const next = names[(names.indexOf(look[property]) + by + names.length) % names.length];
    gui
      .controllersRecursive()
      .find((c) => c.property === property)
      .setValue(next);
    if (property === "palette") note.textContent = `${next} (${look.source})`;
    else if (property === "texture") note.textContent = `Texture: ${next}`;
    else {
      const hex = property === "nameTone" ? look.ink : look.link;
      const from = TONES[next] ? `${TONES[next][1]}, ` : "";
      note.textContent = `${property === "nameTone" ? "Name" : "Links"}: ${next} (${from}${hex}, ${contrast(hex, look.background).toFixed(1)}:1)`;
    }
    note.style.opacity = "1";
    clearTimeout(fading);
    fading = setTimeout(() => (note.style.opacity = "0"), 3000);
  }
  // Left and right step the links' colour, up and down the name's. With shift
  // held they step the palette and the texture instead.
  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.("input, textarea, select")) return;
    const by = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!by) return;
    const across = e.key === "ArrowRight" || e.key === "ArrowLeft";
    if (e.shiftKey) step(across ? "palette" : "texture", Object.keys(across ? palettes : TEXTURES), by);
    else step(across ? "linkTone" : "nameTone", tones, by);
    e.preventDefault();
  });

  gui.close();
  apply();
  return { look, apply, gui, palettes };
}
