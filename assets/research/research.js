(() => {
  const get = (id) => document.getElementById(id);
  const sessionKey = "research-password";
  if (document.body.dataset.payload === "page.json") document.body.classList.add("research-page");
  let payload;
  const savedPassword = () => {
    try {
      return sessionStorage.getItem(sessionKey);
    } catch {
      return null;
    }
  };
  const remember = (password) => {
    try {
      password ? sessionStorage.setItem(sessionKey, password) : sessionStorage.removeItem(sessionKey);
    } catch {
      /* Unlock still works without storage. */
    }
  };
  const bytes = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

  async function unlock(password) {
    get("error").textContent = "";
    const submit = get("unlock-form").querySelector("button");
    submit.disabled = true;
    submit.textContent = "Unlocking…";
    try {
      if (!payload) {
        const response = await fetch(document.body.dataset.payload, { cache: "no-store" });
        if (!response.ok) throw new Error("load");
        payload = await response.json();
      }
      if (payload.version !== 1 || payload.iterations !== 250000) throw new Error("load");
      const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
      const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: bytes(payload.salt), iterations: payload.iterations, hash: "SHA-256" },
        material,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );
      let content;
      try {
        const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(payload.iv) }, key, bytes(payload.data));
        content = JSON.parse(new TextDecoder().decode(plaintext));
      } catch {
        throw new Error("password");
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
          item.append(link, date);
          get("page-list").append(item);
        }
        get("empty").hidden = content.pages.length > 0;
        get("directory").hidden = false;
      } else if (content.kind === "page") {
        get("document-title").textContent = content.title;
        get("research-frame").title = content.title;
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
      get("lock").hidden = false;
    } catch (error) {
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
    remember(null);
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
    get("error").textContent = "";
    document.title = "Research | Nir Pechuk";
    get("password").focus();
  });
  const password = savedPassword();
  if (password) unlock(password);
})();
