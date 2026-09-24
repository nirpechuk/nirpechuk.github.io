---
layout: "page"
title: "Arduino Stock Ticker"
description: "Live market prices on a small physical display."
img: "assets/img/projects/stock-ticker.jpg"
image_alt: "Physical ESP8266 stock ticker with an illuminated price display"
importance: 6
selected: false
category: "Hardware"
technologies: "C++, ESP8266, Finnhub API"
links:
  [
    { "label": "GitHub", "url": "https://github.com/nirpechuk/ESP8266-stock-sticker" },
    { "label": "Build guide", "url": "https://github.com/nirpechuk/ESP8266-stock-sticker#readme" },
  ]
---

{% include project_links.liquid links=page.links %}

![ Physical ESP8266 stock ticker with an illuminated price display]({{ page.img | relative_url }})

A Wi-Fi-connected stock ticker that displays a stock’s price, symbol, and percentage change, refreshing every minute. The repository includes the firmware, wiring instructions, and a printable enclosure.

**Built with:** C++, ESP8266, Finnhub API.
