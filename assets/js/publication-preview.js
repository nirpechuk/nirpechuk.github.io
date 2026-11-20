document.querySelectorAll(".preview-toggle").forEach((button) => {
  const video = button.previousElementSibling.querySelector("video");
  if (video) {
    const label = button.dataset.previewLabel || "Paper preview";
    let paused = window.matchMedia("(prefers-reduced-motion: reduce)").matches || !!navigator.connection?.saveData;
    let visible = false;
    const load = (preload) => {
      video.preload = preload;
      if (!video.getAttribute("src")) video.src = video.dataset.src;
    };
    const update = () => {
      button.textContent = paused ? "Play preview" : "Pause preview";
      button.setAttribute("aria-label", `${paused ? "Play" : "Pause"} ${label}`);
      if (!paused && visible && !document.hidden) {
        load("auto");
        video.play().catch(() => {
          paused = true;
          update();
        });
      } else video.pause();
    };
    // Prepare the next visible paper without competing with the current clip.
    const warm = new IntersectionObserver(
      (entries) => {
        if (!paused && entries.some((entry) => entry.isIntersecting)) {
          load("metadata");
          warm.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    const playback = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        update();
      },
      { threshold: 0.1 }
    );
    warm.observe(video);
    playback.observe(video);
    button.addEventListener("click", () => {
      paused = !paused;
      update();
    });
    document.addEventListener("visibilitychange", update);
    update();
    return;
  }
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
