/**
 * Sync Drive folder filenames into config.js / images-map.json
 * Run: node sync-drive-images.js
 */
const fs = require("fs");
const https = require("https");

const FOLDER_ID = "1u3iqOZgoGRe7foBPUNiGnsAPeFxaIZuA";
const url = `https://drive.google.com/drive/folders/${FOLDER_ID}`;

function fetchText(u) {
  return new Promise((resolve, reject) => {
    https.get(u, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve, reject);
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

(async () => {
  const html = await fetchText(url);
  const files = [];
  const re = /<tr[^>]*data-id="(1[a-zA-Z0-9_-]{20,})"[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = re.exec(html))) {
    const id = m[1];
    const block = m[2];
    const nm = block.match(/>([^<>]+\.(?:jpe?g|png|webp|gif))</i);
    if (!nm) continue;
    files.push({ id, name: nm[1].trim() });
  }
  if (!files.length) throw new Error("No images found in Drive folder HTML");

  fs.writeFileSync("images-map.json", JSON.stringify(files, null, 2) + "\n");

  const cfg = fs.readFileSync("config.js", "utf8");
  const list = files.map((f) => `  { id: "${f.id}", name: ${JSON.stringify(f.name)} }`).join(",\n");
  const next = cfg.replace(
    /window\.DRIVE_IMAGES\s*=\s*\[[\s\S]*?\];/,
    `window.DRIVE_IMAGES = [\n${list}\n];`
  );
  fs.writeFileSync("config.js", next);
  console.log(`Synced ${files.length} images:`);
  files.forEach((f) => console.log(" -", f.name));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
