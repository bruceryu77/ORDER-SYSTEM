/**
 * Sync Drive folder filenames into config.js / images-map.json
 * Run: node sync-drive-images.js
 *
 * On GitHub Actions, Google often blocks direct folder HTML.
 * This script tries direct fetch, then public proxies, then Drive API (optional key).
 */
const fs = require("fs");
const https = require("https");
const http = require("http");

const FOLDER_ID = "1u3iqOZgoGRe7foBPUNiGnsAPeFxaIZuA";
const FOLDER_URL = `https://drive.google.com/drive/folders/${FOLDER_ID}`;
const API_KEY = (process.env.GOOGLE_API_KEY || "").trim();

function fetchText(u, redirects = 0) {
  return new Promise((resolve, reject) => {
    const lib = u.startsWith("http://") ? http : https;
    const req = lib.get(
      u,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9"
        },
        timeout: 25000
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 6) {
          const next = res.headers.location.startsWith("http")
            ? res.headers.location
            : new URL(res.headers.location, u).href;
          res.resume();
          return fetchText(next, redirects + 1).then(resolve, reject);
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} for ${u}`));
            return;
          }
          resolve(data);
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout for ${u}`));
    });
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
    const loose = /data-id="(1[a-zA-Z0-9_-]{20,})"[^>]*>[\s\S]{0,1200}?([^<>"']+\.(?:jpe?g|png|webp|gif))/gi;
    while ((m = loose.exec(html))) {
      byId.set(m[1], { id: m[1], name: m[2].trim() });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchViaDriveApi() {
  if (!API_KEY) return [];
  const q = encodeURIComponent(`'${FOLDER_ID}' in parents and trashed=false`);
  const fields = encodeURIComponent("files(id,name),nextPageToken");
  let pageToken = "";
  const files = [];
  do {
    const page = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const url =
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}` +
      `&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true` +
      `&key=${encodeURIComponent(API_KEY)}${page}`;
    const text = await fetchText(url);
    const json = JSON.parse(text);
    for (const f of json.files || []) {
      if (/\.(jpe?g|png|webp|gif)$/i.test(f.name || "")) {
        files.push({ id: f.id, name: f.name });
      }
    }
    pageToken = json.nextPageToken || "";
  } while (pageToken);
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchFolderHtmlSources() {
  const encoded = encodeURIComponent(FOLDER_URL);
  const sources = [
    FOLDER_URL,
    `https://api.allorigins.win/raw?url=${encoded}`,
    `https://corsproxy.io/?${encoded}`,
    `https://r.jina.ai/http://drive.google.com/drive/folders/${FOLDER_ID}`
  ];
  const errors = [];
  for (const src of sources) {
    try {
      console.log(`Trying: ${src.slice(0, 90)}...`);
      const text = await fetchText(src);
      if (/accounts\.google\.com\/ServiceLogin/i.test(text)) {
        throw new Error("Got Google login page");
      }
      const files = parseFiles(text);
      if (files.length) {
        console.log(`Parsed ${files.length} files from HTML source`);
        return files;
      }
      // jina markdown has names but not ids — keep going
      throw new Error(`No file ids found (length=${text.length})`);
    } catch (err) {
      console.warn(`Failed: ${err.message || err}`);
      errors.push(`${src}: ${err.message || err}`);
    }
  }
  throw new Error(`All HTML sources failed:\n${errors.join("\n")}`);
}

function writeOutputs(files) {
  fs.writeFileSync("images-map.json", JSON.stringify(files, null, 2) + "\n");

  const cfg = fs.readFileSync("config.js", "utf8");
  const list = files.map((f) => `  { id: "${f.id}", name: ${JSON.stringify(f.name)} }`).join(",\n");
  const next = cfg.replace(
    /window\.DRIVE_IMAGES\s*=\s*\[[\s\S]*?\];/,
    `window.DRIVE_IMAGES = [\n${list}\n];`
  );
  if (next === cfg) throw new Error("Could not update DRIVE_IMAGES in config.js");
  fs.writeFileSync("config.js", next);
}

(async () => {
  let files = [];

  try {
    files = await fetchViaDriveApi();
    if (files.length) console.log(`Drive API returned ${files.length} files`);
  } catch (err) {
    console.warn("Drive API failed:", err.message || err);
  }

  if (!files.length) {
    files = await fetchFolderHtmlSources();
  }

  if (!files.length) throw new Error("No images found in Drive folder");

  writeOutputs(files);
  console.log(`Synced ${files.length} images:`);
  files.forEach((f) => console.log(" -", f.name));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
