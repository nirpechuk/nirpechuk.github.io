(() => {
  const get = (id) => document.getElementById(id);
  const count = (value) => (value === null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 1 }));
  let pages = [],
    selected,
    controller,
    catalogController,
    currentData;
  let generation = 0;
  const svgNS = "http://www.w3.org/2000/svg";
  function svgNode(tag, attrs = {}, text) {
    const node = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function chart(rows) {
    const width = Math.max(300, get("traffic-chart").clientWidth),
      height = 270,
      left = 44,
      right = 14,
      top = 18,
      bottom = 38;
    const plotWidth = width - left - right,
      plotHeight = height - top - bottom;
    const maximum = Math.max(1, ...rows.flatMap((row) => [row.views || 0, row.unique || 0]));
    const step = Math.max(1, Math.ceil(maximum / 4));
    const ceiling = step * 4;
    const x = (index) => left + (rows.length > 1 ? index / (rows.length - 1) : 0.5) * plotWidth;
    const y = (value) => top + plotHeight * (1 - value / ceiling);
    const svg = svgNode("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-labelledby": "chart-title chart-description" });
    svg.append(svgNode("title", { id: "chart-title" }, `Daily views and unique viewers for ${selected.path}`));
    svg.append(
      svgNode(
        "desc",
        { id: "chart-description" },
        "Solid blue: total views. Dashed purple: daily unique browsers. Exact values are available in the daily counts table. Missing responses appear as gaps."
      )
    );
    for (let i = 0; i <= 4; i++) {
      svg.append(svgNode("line", { x1: left, x2: width - right, y1: y(step * i), y2: y(step * i), stroke: "var(--line)" }));
      svg.append(svgNode("text", { x: left - 10, y: y(step * i) + 4, "text-anchor": "end", fill: "var(--muted)", "font-size": 12 }, count(step * i)));
    }
    const tickIndexes = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])].filter((i) => i >= 0);
    for (const index of tickIndexes) {
      const date = new Date(`${rows[index].date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
      svg.append(
        svgNode(
          "text",
          {
            x: x(index),
            y: height - 10,
            "text-anchor": rows.length === 1 ? "middle" : index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle",
            fill: "var(--muted)",
            "font-size": 12,
          },
          date
        )
      );
    }
    for (const field of ["views", "unique"]) {
      const color = field === "views" ? "var(--accent)" : "var(--unique)";
      let d = "",
        previous = false;
      rows.forEach((row, i) => {
        if (row[field] === null) {
          previous = false;
          return;
        }
        d += `${previous ? "L" : "M"}${x(i)},${y(row[field])} `;
        previous = true;
      });
      svg.append(
        svgNode("path", { d, fill: "none", stroke: color, "stroke-width": 2.5, ...(field === "unique" ? { "stroke-dasharray": "6 5" } : {}) })
      );
      rows.forEach((row, i) => {
        if (row[field] === null) return;
        const dot = svgNode("circle", { cx: x(i), cy: y(row[field]), r: field === "views" ? 4 : 2.5, fill: color });
        dot.append(svgNode("title", {}, `${row.date}: ${row[field]} ${field === "views" ? "views" : "unique viewers"}`));
        svg.append(dot);
      });
    }
    get("traffic-chart").replaceChildren(svg);
  }
  const collapsedPaths = new Set();
  function renderPages() {
    const search = get("page-search").value.toLowerCase().trim();
    const visible = pages.filter((page) => page.path.toLowerCase().includes(search));
    const active = document.activeElement;
    const focusPath = active?.dataset.treePath;
    const focusAction = active?.dataset.treeAction;
    const root = { children: new Map() };
    for (const page of visible) {
      let node = root;
      let pathname = "/";
      for (const segment of page.path.split("/").filter(Boolean)) {
        pathname += segment + "/";
        if (!node.children.has(segment)) node.children.set(segment, { name: segment, path: pathname, children: new Map() });
        node = node.children.get(segment);
      }
      node.page = page;
    }
    const container = get("analytics-pages");
    container.replaceChildren();
    if (!visible.length) {
      container.textContent = "No matching pages.";
      return;
    }
    function pageButton(page, name) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "page-choice";
      button.textContent = name;
      button.title = page.path;
      button.dataset.treePath = page.path;
      button.dataset.treeAction = "select";
      button.setAttribute("aria-label", page.path);
      button.setAttribute("aria-pressed", String(page.path === selected?.path));
      button.addEventListener("click", () => select(page));
      return button;
    }
    function appendNodes(parent, nodes) {
      for (const node of [...nodes.values()].sort((a, b) => a.name.localeCompare(b.name))) {
        const item = document.createElement("li");
        const row = document.createElement("div");
        row.className = "path-row";
        item.append(row);
        const hasChildren = node.children.size > 0;
        const name = node.name + (hasChildren || node.page?.path.endsWith("/") ? "/" : "");
        if (hasChildren) {
          const children = document.createElement("ul");
          children.id = `path-children-${encodeURIComponent(node.path)}`;
          children.hidden = !search && collapsedPaths.has(node.path);
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "path-toggle";
          toggle.dataset.treePath = node.path;
          toggle.dataset.treeAction = "toggle";
          toggle.setAttribute("aria-controls", children.id);
          toggle.setAttribute("aria-expanded", String(!children.hidden));
          toggle.setAttribute("aria-label", `${children.hidden ? "Expand" : "Collapse"} ${node.path}`);
          const chevron = document.createElement("span");
          chevron.setAttribute("aria-hidden", "true");
          chevron.textContent = "›";
          toggle.append(chevron);
          if (!node.page) toggle.append(document.createTextNode(name));
          toggle.addEventListener("click", () => {
            children.hidden = !children.hidden;
            if (children.hidden) collapsedPaths.add(node.path);
            else collapsedPaths.delete(node.path);
            toggle.setAttribute("aria-expanded", String(!children.hidden));
            toggle.setAttribute("aria-label", `${children.hidden ? "Expand" : "Collapse"} ${node.path}`);
          });
          row.append(toggle);
          if (node.page) row.append(pageButton(node.page, name));
          appendNodes(children, node.children);
          item.append(children);
        } else {
          row.classList.add("path-leaf");
          row.append(pageButton(node.page, name));
        }
        parent.append(item);
      }
    }
    const list = document.createElement("ul");
    list.className = "path-tree";
    if (root.page) {
      const item = document.createElement("li");
      item.className = "path-row path-leaf";
      item.append(pageButton(root.page, "/"));
      list.append(item);
    }
    appendNodes(list, root.children);
    container.append(list);
    if (focusPath) {
      [...container.querySelectorAll("button")]
        .find((button) => button.dataset.treePath === focusPath && button.dataset.treeAction === focusAction)
        ?.focus({ preventScroll: true });
    }
  }
  function select(page) {
    selected = page;
    for (const pathname of collapsedPaths) {
      if (page.path.startsWith(pathname)) collapsedPaths.delete(pathname);
    }
    get("selected-path").textContent = page.path;
    get("selected-path").href = page.path;
    renderPages();
    load();
  }
  function clearData() {
    currentData = null;
    get("download-traffic").disabled = true;
    for (const id of ["period-views", "daily-unique"]) get(id).textContent = "—";
    for (const id of ["traffic-chart", "daily-counts", "history-note", "lifetime-counts"]) get(id).replaceChildren();
  }
  async function load(refresh = false) {
    if (!selected) return;
    controller?.abort();
    const active = new AbortController();
    controller = active;
    clearData();
    get("traffic-status").textContent = "Loading traffic…";
    get("traffic-chart").setAttribute("aria-busy", "true");
    try {
      const data = await window.NirPageViews.history(selected.path, Number(get("traffic-range").value), { signal: active.signal, refresh });
      if (active.signal.aborted) return;
      currentData = data;
      const { rows } = data;
      const sum = (field) => (rows.length && rows.every((row) => row[field] !== null) ? rows.reduce((total, row) => total + row[field], 0) : null);
      const views = sum("views"),
        uniques = sum("unique");
      get("period-views").textContent = count(views);
      get("daily-unique").textContent = count(uniques === null ? null : uniques / rows.length);
      const missing = rows.some((row) => row.views === null || row.unique === null) || data.lifetime === null || data.unique === null;
      get("traffic-status").textContent = missing
        ? "Some counts couldn’t load. Gaps mean unavailable data. Try Refresh."
        : views === 0
          ? "No recorded views in this period yet."
          : "Up to date. Today’s counts are still growing.";
      chart(rows);
      get("history-note").textContent = rows.length
        ? `${rows[0].date} to ${rows.at(-1).date} · UTC. Daily tracking starts September 27, 2026; earlier history is unavailable.`
        : "Daily tracking starts September 27, 2026. No history is available for this period.";
      get("lifetime-counts").textContent =
        `${count(data.lifetime)} lifetime views (since Sep 24, 2026). ${count(data.unique)} unique browsers (since Sep 27, 2026).`;
      for (const row of [...rows].reverse()) {
        const tr = document.createElement("tr");
        for (const value of [row.date, count(row.views), count(row.unique)]) {
          const td = document.createElement("td");
          td.textContent = value;
          tr.append(td);
        }
        get("daily-counts").append(tr);
      }
      get("download-traffic").disabled = !rows.length;
    } catch (error) {
      if (!active.signal.aborted) get("traffic-status").textContent = "Traffic couldn’t load. Try Refresh.";
    } finally {
      if (!active.signal.aborted) get("traffic-chart").setAttribute("aria-busy", "false");
    }
  }
  get("page-search").addEventListener("input", renderPages);
  get("traffic-range").addEventListener("change", () => load());
  get("refresh-traffic").addEventListener("click", () => load(true));
  get("download-traffic").addEventListener("click", () => {
    if (!currentData) return;
    const csv = [
      "date_utc,total_views,daily_unique_browsers",
      ...currentData.rows.map((row) => `${row.date},${row.views ?? ""},${row.unique ?? ""}`),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `traffic-${selected.path.replace(/[^a-z0-9]+/gi, "-") || "home"}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  let chartWidth = 0;
  new ResizeObserver(([entry]) => {
    if (entry.contentRect.width > 0 && entry.contentRect.width !== chartWidth) {
      chartWidth = entry.contentRect.width;
      if (currentData && selected) chart(currentData.rows);
    }
  }).observe(get("traffic-chart"));
  let flatsConfig = null;
  let residents = [];
  let flatsController;
  let flatsBusy = false;
  function renderResidents() {
    const container = get("flats-residents");
    container.replaceChildren();
    const visible = residents.filter((p) => !p.deletedAt || get("show-deleted-flats").checked);
    for (const resident of visible) {
      const row = document.createElement("tr");
      const name = document.createElement("td");
      const title = document.createElement("strong");
      title.textContent = resident.name;
      const pet = document.createElement("small");
      pet.textContent = `${resident.petName} · ${resident.petKind}${resident.deletedAt ? " · deleted" : ""}`;
      name.append(title, pet);
      const building = document.createElement("td");
      building.textContent = resident.building;
      const code = document.createElement("small");
      code.textContent = resident.groupCode;
      building.append(code);
      const workouts = document.createElement("td");
      workouts.textContent = String(resident.workouts);
      const actions = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quiet";
      button.textContent = resident.deletedAt ? "Restore" : "Delete";
      button.setAttribute("aria-label", `${button.textContent} ${resident.name}`);
      button.disabled = flatsBusy;
      button.addEventListener("click", () => {
        if (resident.deletedAt) {
          void updateResidents("restore", resident.id);
          return;
        }
        const confirmation = document.createElement("span");
        confirmation.textContent = `Delete ${resident.name}? `;
        const yes = document.createElement("button");
        yes.type = "button";
        yes.className = "quiet";
        yes.textContent = "Confirm delete";
        yes.addEventListener("click", () => {
          void updateResidents("delete", resident.id);
        });
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "quiet";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", renderResidents);
        actions.replaceChildren(confirmation, yes, cancel);
        yes.focus();
      });
      actions.append(button);
      row.append(name, building, workouts, actions);
      container.append(row);
    }
    if (!visible.length) {
      const row = document.createElement("tr"),
        cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = "No residents to show yet.";
      row.append(cell);
      container.append(row);
    }
  }
  async function updateResidents(action = "list", playerId = null) {
    if (!flatsConfig || flatsBusy) return;
    const token = generation;
    const active = new AbortController();
    flatsController = active;
    flatsBusy = true;
    get("refresh-flats").disabled = true;
    renderResidents();
    get("flats-status").textContent = action === "list" ? "Loading residents…" : "Saving…";
    try {
      const response = await fetch(`${flatsConfig.url}/rest/v1/rpc/flats_admin`, {
        method: "POST",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { apikey: flatsConfig.publishableKey, "Content-Type": "application/json" },
        body: JSON.stringify({ p_token: flatsConfig.token, p_action: action, p_player_id: playerId }),
        signal: AbortSignal.any([active.signal, AbortSignal.timeout(15000)]),
      });
      if (!response.ok) throw new Error("Residents couldn't load. Try Refresh.");
      const result = await response.json();
      if (token !== generation) return;
      residents = result;
      const activeResidents = residents.filter((p) => !p.deletedAt);
      const buildingCount = new Set(activeResidents.map((p) => p.groupCode)).size;
      get("flats-status").textContent =
        action === "delete"
          ? "Resident deleted. Turn on “Show deleted residents” to restore them."
          : action === "restore"
            ? "Resident restored."
            : `${activeResidents.length} resident${activeResidents.length === 1 ? "" : "s"} across ${buildingCount} building${buildingCount === 1 ? "" : "s"}`;
    } catch (error) {
      if (token === generation && !active.signal.aborted) get("flats-status").textContent = error.message || "Couldn't reach Flats. Try Refresh.";
    } finally {
      if (token === generation) {
        flatsBusy = false;
        get("refresh-flats").disabled = false;
        renderResidents();
      }
    }
  }
  get("refresh-flats").addEventListener("click", () => {
    void updateResidents();
  });
  get("show-deleted-flats").addEventListener("change", renderResidents);
  window.NirAdmin = {
    async open(reports, configuration) {
      const token = ++generation;
      flatsController?.abort();
      flatsBusy = false;
      flatsConfig = configuration ?? null;
      residents = [];
      get("show-deleted-flats").checked = false;
      get("flats-status").textContent = flatsConfig ? "" : "Flats management hasn't been connected yet.";
      get("refresh-flats").disabled = !flatsConfig;
      renderResidents();
      void updateResidents();
      catalogController?.abort();
      catalogController = new AbortController();
      pages = [{ title: "Home", path: "/" }, ...reports.map((page) => ({ title: page.title, path: `/research/${encodeURIComponent(page.slug)}/` }))];
      get("page-search").value = "";
      get("catalog-status").textContent = "Loading pages…";
      select(pages[0]);
      for (const [index, item] of [...get("page-list").children].entries()) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "quiet";
        button.textContent = "View traffic";
        button.addEventListener("click", () => {
          get("page-search").value = "";
          select({ title: reports[index].title, path: `/research/${encodeURIComponent(reports[index].slug)}/` });
          get("traffic-title").scrollIntoView({ block: "start" });
        });
        const actions = document.createElement("div");
        actions.className = "report-actions";
        actions.append(item.querySelector(".research-page-meta"), button);
        item.append(actions);
      }
      try {
        const response = await fetch("/assets/analytics-pages.json", { cache: "no-store", signal: catalogController.signal });
        if (!response.ok) throw new Error("catalog");
        const catalog = await response.json();
        if (token !== generation) return;
        for (const page of catalog) {
          if (typeof page.path !== "string" || !page.path.startsWith("/") || page.path.startsWith("//") || page.path.startsWith("/research/"))
            continue;
          const normalized = window.NirPageViews.normalize(page.path);
          if (!pages.some((entry) => entry.path === normalized)) pages.push({ title: page.title || normalized, path: normalized });
        }
        get("catalog-status").textContent = "";
        renderPages();
      } catch {
        if (token === generation)
          get("catalog-status").textContent = "Public page list unavailable. Reload to retry. Home and research are still available.";
      }
    },
    close() {
      generation++;
      flatsController?.abort();
      flatsConfig = null;
      residents = [];
      flatsBusy = false;
      get("flats-residents").replaceChildren();
      get("flats-status").textContent = "";
      controller?.abort();
      catalogController?.abort();
      pages = [];
      selected = null;
      clearData();
      get("analytics-pages").replaceChildren();
      collapsedPaths.clear();
      get("selected-path").textContent = "";
      get("selected-path").removeAttribute("href");
      window.NirPageViews.history.cache.clear();
    },
  };
})();
