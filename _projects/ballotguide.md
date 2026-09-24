---
layout: "page"
title: "BallotGuide"
description: "See how your local ballot could change your neighborhood."
img: "assets/img/projects/ballotguide.png"
image_alt: "BallotGuide ballot annotations and local election interface"
importance: 2
selected: true
category: "TartanHacks 2026 winner"
technologies: "React, TypeScript, Three.js, Pinecone, RAG"
links:
  [
    { "label": "GitHub", "url": "https://github.com/Beckett-Munson/BallotGuide" },
    { "label": "Video", "url": "https://www.youtube.com/watch?v=UPvNxiCK0Lg" },
    { "label": "Writeup", "url": "https://github.com/Beckett-Munson/BallotGuide#readme" },
  ]
---

{% include project_links.liquid links=page.links %}

![ BallotGuide ballot annotations and local election interface]({{ page.img | relative_url }})

BallotGuide makes local elections easier to understand through personalized, source-grounded ballot explanations. I built a RAG pipeline backed by more than 30,000 scraped legislation entries and custom 3D visualizations of local policy impacts. The team also built budget-impact predictions to make policy tradeoffs tangible. Winner at CMU TartanHacks 2026, with 279 submitted projects.

**Built with:** React, TypeScript, Three.js, Pinecone, RAG.
