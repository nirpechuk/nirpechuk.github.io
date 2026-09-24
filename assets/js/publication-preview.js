document.querySelectorAll(".preview-toggle").forEach((button) => {
  const image = button.previousElementSibling.querySelector("img");
  const label = button.dataset.previewLabel || "GenPHRI orbit preview";
  const source = button.previousElementSibling.querySelector("source");
  let paused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const update = () => {
    if (source) source.remove();
    image.src = paused ? button.dataset.static : button.dataset.animated;
    button.textContent = paused ? "Play preview" : "Pause preview";
    button.setAttribute("aria-label", `${paused ? "Play" : "Pause"} ${label}`);
  };
  update();
  button.addEventListener("click", () => {
    paused = !paused;
    update();
  });
});
