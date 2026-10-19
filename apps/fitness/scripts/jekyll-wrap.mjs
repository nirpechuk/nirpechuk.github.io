import { readFileSync, writeFileSync } from "node:fs";
const path = new URL("../../../fitness/index.html", import.meta.url);
const html = readFileSync(path, "utf8");
writeFileSync(path, "---\nlayout: null\ntitle: fitness\npermalink: /fitness/\nnav: false\nsitemap: false\n---\n{% raw %}" + html + "{% endraw %}\n");
