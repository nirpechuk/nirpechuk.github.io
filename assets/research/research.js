(() => {
  const get = (id) => document.getElementById(id);
  const isReport = document.body.dataset.payload === "page.json";
  const sessionKey = isReport ? "research-password" : "admin-password";
  if (isReport) {
    document.body.classList.add("research-page");
    document.title = "Research | Nir Pechuk";
  }
  let payload;
  let counterScript;

  async function updateViewCounts(kind) {
    try {
      if (!window.NirPageViews) {
        counterScript ||= new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "/assets/js/page-views.js?v=analytics-1";
          script.onload = resolve;
          script.onerror = () => {
            counterScript = null;
            reject(new Error("load"));
          };
          document.head.append(script);
        });
        await counterScript;
      }
      if (kind !== "index") window.NirPageViews.track();
      if (kind === "index") {
        get("page-list")
          .querySelectorAll("[data-view-path]")
          .forEach((element) => {
            window.NirPageViews.show(element, element.dataset.viewPath);
          });
      }
    } catch {
      // Counter outages must never prevent reading a report.
    }
  }
  let adminScript;
  async function openConsole(pages) {
    try {
      await updateViewCounts("index");
      if (!window.NirAdmin) {
        adminScript ||= new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "/assets/research/admin.js?v=2";
          script.onload = resolve;
          script.onerror = () => {
            adminScript = null;
            reject(new Error("load"));
          };
          document.head.append(script);
        });
        await adminScript;
      }
      if (!get("directory").hidden) window.NirAdmin.open(pages);
    } catch {
      get("traffic-status").textContent = "Traffic explorer couldn’t load. Reload this page to try again.";
    }
  }
  // The research password persists in this browser, so every report opens without asking again;
  // the admin password stays per tab.
  const persistentKey = "research-password";
  const savedPassword = () => {
    try {
      return sessionStorage.getItem(sessionKey) || (sessionKey === persistentKey ? localStorage.getItem(persistentKey) : null);
    } catch {
      return null;
    }
  };
  const remember = (password, key = sessionKey) => {
    for (const storage of key === persistentKey ? ["sessionStorage", "localStorage"] : ["sessionStorage"]) {
      try {
        password ? window[storage].setItem(key, password) : window[storage].removeItem(key);
      } catch {
        /* Unlock still works without storage. */
      }
    }
  };
  // A top progress bar for reports, which can be tens of megabytes: download, decrypt, then render in the frame.
  function showProgress() {
    const bar = document.createElement("div");
    bar.className = "load-progress";
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", "Loading report");
    bar.innerHTML = '<div class="track"><div class="fill"></div></div><p></p>';
    document.body.append(bar);
    get("gate").classList.add("loading");
    return {
      set(fraction, text) {
        bar.querySelector(".fill").style.width = `${Math.round(100 * Math.min(fraction, 1))}%`;
        bar.setAttribute("aria-valuenow", String(Math.round(100 * fraction)));
        bar.querySelector("p").textContent = text;
      },
      remove() {
        bar.remove();
        get("gate").classList.remove("loading");
      },
    };
  }
  const megabytes = (count) => `${(count / 1e6).toFixed(1)} MB`;
  async function fetchPayload(url, onProgress) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("load");
    const sent = Number(response.headers.get("content-length")) || 0;
    if (!response.body || !sent) return response.json();
    // GitHub Pages gzips the JSON and reports the compressed length, while the stream yields decompressed
    // bytes; base64 payloads compress to about three quarters, so scale the estimate and cap it below 100%.
    const expected = response.headers.get("content-encoding") ? sent / 0.76 : sent;
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress(Math.min(received / expected, 0.99), `Loading ${megabytes(received)} of about ${megabytes(expected)}`);
    }
    const body = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder().decode(body));
  }
  const bytes = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

  async function decrypt(envelope, password) {
    if (envelope.version !== 1 || envelope.iterations !== 250000) throw new Error("load");
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: bytes(envelope.salt), iterations: envelope.iterations, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    try {
      const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(envelope.iv) }, key, bytes(envelope.data));
      return JSON.parse(new TextDecoder().decode(plaintext));
    } catch {
      throw new Error("password");
    }
  }
  async function unlock(password) {
    get("error").textContent = "";
    const submit = get("unlock-form").querySelector("button");
    submit.disabled = true;
    submit.textContent = "Unlocking…";
    const progress = isReport ? showProgress() : null;
    try {
      progress?.set(0.02, "Loading report");
      if (!payload) {
        // Old installed uploaders may still label the index as manifest.json.
        // The directory always authenticates against the separate admin envelope.
        payload = await fetchPayload(isReport ? "page.json" : "admin.json", (fraction, text) => progress?.set(0.02 + 0.83 * fraction, text));
      }
      progress?.set(0.88, "Decrypting");
      let content = await decrypt(payload, password);
      if (!isReport) {
        if (content.kind !== "admin" || typeof content.researchPassword !== "string") throw new Error("load");
        const researchPassword = content.researchPassword;
        const response = await fetch("manifest.json", { cache: "no-store" });
        if (!response.ok) throw new Error("load");
        try {
          content = await decrypt(await response.json(), researchPassword);
        } catch {
          throw new Error("load");
        }
        if (content.kind !== "index") throw new Error("load");
        remember(researchPassword, "research-password");
      } else if (content.kind !== "page") {
        throw new Error("load");
      }
      if (content.kind === "index") {
        get("page-list").replaceChildren();
        for (const page of content.pages) {
          const item = document.createElement("li");
          const link = document.createElement("a");
          link.href = `/research/${encodeURIComponent(page.slug)}/`;
          link.textContent = page.title;
          const date = document.createElement("time");
          date.dateTime = page.updated;
          date.textContent = page.updated;
          const views = document.createElement("span");
          views.className = "research-page-views";
          views.dataset.viewPath = link.getAttribute("href");
          views.hidden = true;
          const details = document.createElement("div");
          details.className = "research-page-meta";
          details.append(date, views);
          item.append(link, details);
          get("page-list").append(item);
        }
        get("empty").hidden = content.pages.length > 0;
        get("directory").hidden = false;
        document.title = "Admin | Nir Pechuk";
        openConsole(content.pages);
      } else if (content.kind === "page") {
        get("document-title").textContent = content.title;
        get("research-frame").title = content.title;
        progress?.set(0.94, "Rendering");
        get("research-frame").addEventListener(
          "load",
          () => {
            progress?.set(1, "Ready");
            setTimeout(() => progress?.remove(), 250);
          },
          { once: true }
        );
        get("research-frame").srcdoc = content.html;
        get("document").hidden = false;
        document.body.classList.add("research-page", "document-open");
        document.title = content.title;
      } else {
        throw new Error("load");
      }
      remember(password);
      get("password").value = "";
      get("gate").hidden = true;
      document.body.classList.remove("locked");
      get("lock").hidden = false;
      if (content.kind !== "index") updateViewCounts(content.kind);
    } catch (error) {
      progress?.remove();
      remember(null);
      get("error").textContent =
        error.message === "password" ? "That password didn’t work. Try again." : "This page couldn’t be unlocked. Please reload and try again.";
    } finally {
      submit.disabled = false;
      submit.textContent = "Unlock";
    }
  }
  get("unlock-form").addEventListener("submit", (event) => {
    event.preventDefault();
    unlock(get("password").value);
  });
  get("lock").addEventListener("click", () => {
    remember(null, "admin-password");
    remember(null, "research-password");
    window.NirAdmin?.close();
    get("research-frame").removeAttribute("srcdoc");
    get("research-frame").src = "about:blank";
    get("page-list").replaceChildren();
    get("document-title").textContent = "";
    get("research-frame").title = "Research page";
    get("directory").hidden = true;
    get("document").hidden = true;
    document.body.classList.remove("document-open");
    get("lock").hidden = true;
    get("gate").hidden = false;
    document.body.classList.add("locked");
    get("error").textContent = "";
    document.title = "Admin | Nir Pechuk";
    get("password").focus();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && !get("directory").hidden) updateViewCounts("index");
  });
  const password = savedPassword();
  if (password) unlock(password);
})();
