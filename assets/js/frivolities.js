document.querySelectorAll(".frivolities-menu").forEach((menu) => {
  const summary = menu.querySelector("summary");
  menu.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") menu.open = true;
  });
  summary.addEventListener("click", (event) => {
    // A mouse enters before it clicks: keep the hover-opened menu open.
    if (event.pointerType === "mouse" && menu.open) event.preventDefault();
  });
  menu.addEventListener("pointerleave", () => {
    if (!menu.contains(document.activeElement)) menu.open = false;
  });
  menu.addEventListener("focusout", (event) => {
    if (!menu.contains(event.relatedTarget)) menu.open = false;
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      menu.open = false;
      summary.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target)) menu.open = false;
  });
});
