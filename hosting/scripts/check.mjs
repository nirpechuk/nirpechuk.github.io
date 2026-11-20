const origin = process.env.RESEARCH_SITE || "https://nir.pechuk.com";
let failed = false;
for (const route of ["/", "/fitness/", "/flats/", "/research/", "/research/admin.json", "/research/manifest.json"]) {
  try {
    const response = await fetch(new URL(route, origin), { redirect: "error", signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (route.endsWith(".json")) {
      const value = await response.json();
      if (value.version !== 1 || typeof value.data !== "string") throw new Error("Expected an encrypted envelope");
    } else {
      const html = await response.text();
      if (!html.toLowerCase().includes("<!doctype html") || html.startsWith("---") || html.includes("{% raw %}"))
        throw new Error("Expected rendered HTML");
      if (route === "/" && !html.includes("https://nir.pechuk.com")) throw new Error("Homepage does not reference the new canonical domain");
    }
    console.log(`OK ${route}`);
  } catch (error) {
    console.error(`FAIL ${route}: ${error.message}`);
    failed = true;
  }
}
for (const [route, options, expected] of [
  ["/api/publish/state", {}, 401],
  ["/research/does-not-exist/", {}, 404],
  ["/talks/robot-ttt/video/robottt-teaser-loop.mp4", { headers: { Range: "bytes=0-31" } }, 206],
]) {
  try {
    const response = await fetch(new URL(route, origin), { ...options, redirect: "error", signal: AbortSignal.timeout(30000) });
    if (response.status !== expected) throw new Error(`HTTP ${response.status}; expected ${expected}`);
    if (expected === 206 && (await response.arrayBuffer()).byteLength !== 32) throw new Error("Incorrect byte-range response");
    console.log(`OK ${route}`);
  } catch (error) {
    console.error(`FAIL ${route}: ${error.message}`);
    failed = true;
  }
}
if (origin === "https://nir.pechuk.com") {
  try {
    const response = await fetch("https://reports.pechuk.com/session", { headers: { Origin: origin }, signal: AbortSignal.timeout(30000) });
    if (!response.ok || (await response.json()).authenticated !== false || response.headers.get("access-control-allow-origin") !== origin)
      throw new Error("Protected report session routing or CORS is unavailable.");
    console.log("OK protected report session (anonymous access stays locked)");
  } catch (error) {
    console.error(`FAIL protected reports: ${error.message}`);
    failed = true;
  }
}
process.exitCode = failed ? 1 : 0;
