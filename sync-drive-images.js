/**
 * Sync Drive folder filenames into config.js / images-map.json
 * Run: node sync-drive-images.js
 */
const fs = require("fs");
const https = require("https");

const FOLDER_ID = "1u3iqOZgoGRe7foBPUNiGnsAPeFxaIZuA";
const url = `https://drive.google.com/drive/folders/${FOLDER_ID}`;

function fetchText(u, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(u, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
        return fetchText(res.headers.location, redirects + 1).then(resolve, reject);
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function parseFiles(html) {
  const byId = new Map();
  const trRe = /<tr[^>]*data-id="(1[a-zA-Z0-9_-]{20,})"[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html))) {
    const id = m[1];
    const block = m[2];
    const nm =
      block.match(/>([^<>]+\.(?:jpe?g|png|webp|gif))</i) ||
      block.match(/aria-label="([^"]+\.(?:jpe?g|png|webp|gif))"/i);
    if (!nm) continue;
    byId.set(id, { id, name: nm[1].trim() });
  }
  if (!byId.size) {
    const loose = /data-id="(1[a-zA-Z0-9_-]{20,})"[^>]*>[\s\S]{0,800}?([^<>"']+\.(?:jpe?g|png|webp|gif))/gi;
    while ((m = loose.exec(html))) {
      byId.set(m[1], { id: m[1], name: m[2].trim() });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

(async () => {
  const html = await fetchText(url);
  const files = parseFiles(html);
  if (!files.length) throw new Error("No images found in Drive folder HTML");

  fs.writeFileSync("images-map.json", JSON.stringify(files, null, 2) + "\n");

  const cfg = fs.readFileSync("config.js", "utf8");
  const list = files.map((f) => `  { id: "${f.id}", name: ${JSON.stringify(f.name)} }`).join(",\n");
  const next = cfg.replace(
    /window\.DRIVE_IMAGES\s*=\s*\[[\s\S]*?\];/,
    `window.DRIVE_IMAGES = [\n${list}\n];`
  );
  if (next === cfg) throw new Error("Could not update DRIVE_IMAGES in config.js");
  fs.writeFileSync("config.js", next);
  console.log(`Synced ${files.length} images:`);
  files.forEach((f) => console.log(" -", f.name));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
