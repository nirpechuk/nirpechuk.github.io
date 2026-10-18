// Adds Jekyll front matter to the built index.html so the page is listed in the
// site navigation and served verbatim (raw block keeps Liquid away from the HTML).
import { readFileSync, writeFileSync } from "node:fs";

const indexPath = new URL("../../../flats/index.html", import.meta.url);
const html = readFileSync(indexPath, "utf8");
const frontMatter = [
  "---",
  "layout: null",
  "title: flats",
  "permalink: /flats/",
  "nav: false",
  "nav_order: 5",
  "sitemap: false",
  "---",
].join("\n");
writeFileSync(indexPath, `${frontMatter}\n{% raw %}${html}{% endraw %}\n`);
console.log("Wrapped flats/index.html with Jekyll front matter.");
