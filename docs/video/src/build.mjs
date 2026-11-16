// build.mjs - assemble the Peal Tender film from src/ into a HyperFrames project.
//
//   node src/build.mjs            writes index.html and compositions/<id>.html
//
// Each src/scenes/NN-<id>.html starts with a JSON comment {"id","start","dur"} and
// holds the scene's <style>, markup and <script>. The script gets `tl` (the scene's
// paused timeline), `D` (the scene's duration) and the helpers in src/helpers.js.
// Elements marked data-split have their words wrapped in <span class="w"> here, at
// build time, so the composition is plain static HTML.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = dirname(fileURLToPath(import.meta.url));
const OUT = join(SRC, "..");
const fonts = readFileSync(join(SRC, "fonts.css"), "utf8");
const common = readFileSync(join(SRC, "common.css"), "utf8");
const helpers = readFileSync(join(SRC, "helpers.js"), "utf8");
const audio = JSON.parse(readFileSync(join(SRC, "audio.json"), "utf8"));
const TOTAL = audio.total;

function split(html) {
  return html.replace(/<(\w+)([^>]*\sdata-split[^>]*)>([\s\S]*?)<\/\1>/g, (_, tag, attrs, inner) => {
    const done = (">" + inner + "<").replace(/>([^<]+)</g, (m, text) => ">" + wrap(text) + "<").slice(1, -1);
    return `<${tag}${attrs}>${done}</${tag}>`;
  });
}
function wrap(text) {
  return text
    .split(/(\s+)/)
    .map((p) => (p.trim() ? `<span class="w">${p}</span>` : p))
    .join("");
}

mkdirSync(join(OUT, "compositions"), { recursive: true });
const scenes = [];
for (const f of readdirSync(join(SRC, "scenes")).filter((x) => x.endsWith(".html")).sort()) {
  const raw = readFileSync(join(SRC, "scenes", f), "utf8");
  const meta = JSON.parse(raw.match(/^<!--\s*(\{[\s\S]*?\})\s*-->/)[1]);
  const body = raw.replace(/^<!--[\s\S]*?-->\s*/, "");
  const style = (body.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];
  const script = (body.match(/<script>([\s\S]*?)<\/script>/) || [, ""])[1];
  const markup = split(body.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<script>[\s\S]*?<\/script>/, "").trim());
  const id = meta.id;
  const file = `<template>
  <style>
${fonts}
${common}
${style}
  </style>
  <div id="root" data-composition-id="${id}" data-width="1920" data-height="1080">
${markup}
  </div>
  <script>
    (function () {
      const D = ${meta.dur};
      const tl = gsap.timeline({ paused: true });
${helpers}
${script}
      window.__timelines["${id}"] = tl;
    })();
  </script>
</template>
`;
  writeFileSync(join(OUT, "compositions", `${id}.html`), file);
  scenes.push(meta);
}

const hosts = scenes
  .map(
    (s) => `      <div id="${s.id}" data-composition-id="${s.id}" data-composition-src="compositions/${s.id}.html"
        data-start="${s.start}" data-duration="${s.dur}" data-track-index="1" data-track-kind="graphics"
        data-width="1920" data-height="1080"></div>`,
  )
  .join("\n");
const clips = audio.clips
  .map((c) => {
    const a = Object.entries(c)
      .filter(([k]) => k !== "src" && k !== "id")
      .map(([k, v]) => `data-${k}="${v}"`)
      .join(" ");
    return `      <audio id="${c.id}" class="clip" ${a} src="${c.src}"></audio>`;
  })
  .join("\n");

writeFileSync(
  join(OUT, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>Peal Tender: the treasury Q-Day cannot open</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: #f1f4f2; }
      #paper { position: absolute; inset: 0; background: #f1f4f2; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="1920" data-height="1080">
      <div id="paper"></div>
${hosts}
${clips}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`,
);
console.log(`built ${scenes.length} scenes, ${audio.clips.length} audio clips, ${TOTAL}s`);
