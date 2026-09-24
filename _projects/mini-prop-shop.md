---
layout: "page"
title: "Mini Prop Shop"
description: "Market data replay meets low-latency ML inference."
img: "assets/img/projects/mini-prop-shop.svg"
image_alt: "Illustration of market ticks flowing into a model and trading signals"
importance: 5
selected: false
category: "Systems & machine learning"
technologies: "Go, PyTorch, Kubernetes"
links: []
---

{% include project_links.liquid links=page.links %}

![ Illustration of market ticks flowing into a model and trading signals]({{ page.img | relative_url }})

A trading research system that replays 1.2 billion BTC ticks, serves trading signals in under 20 milliseconds, and fine-tunes an LSTM model nightly. The project combines data pipelines, model serving, and infrastructure.

**Built with:** Go, PyTorch, Kubernetes.
