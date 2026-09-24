---
layout: "page"
title: "Phagentic"
description: "An autonomous bioreactor built from scratch."
img: "assets/img/projects/phagentic-reaction.gif"
img_static: "assets/img/projects/phagentic-reaction.jpg"
image_alt: "Phagentic’s reaction vessel cycling between blue and colorless liquid"
importance: 1
selected: true
category: "UC Berkeley AI Hackathon 2026"
technologies: "ESP32, Python, PyTorch, BLE, MPC"
links:
  [
    { "label": "GitHub", "url": "https://github.com/nirpechuk/phagentic" },
    { "label": "Video", "url": "https://www.youtube.com/watch?v=z2aTEHjq1O8" },
    { "label": "Devpost", "url": "https://devpost.com/software/phagentic" },
  ]
---

{% include project_links.liquid links=page.links %}

<div class="project-detail-media">
{% include project_media.liquid project=page %}
</div>

I built a physical bioreactor with an ESP32-driven stirrer, dosing pumps, an RGB sensor, and a 3D-printed rig. A chemistry-informed gray-box model and model predictive controller read live sensor state and actuate the hardware to sustain a reaction’s target oscillation amplitude and period. The project explores autonomous bioreactors for bacteriophage farming.

**Built with:** ESP32, Python, PyTorch, BLE, MPC.
