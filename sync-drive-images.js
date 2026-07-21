/**
 * Sync Drive folder filenames into config.js / images-map.json
 * Run: node sync-drive-images.js
 *
 * GitHub Actions runners are often blocked by Google Drive HTML pages.
 * Preferred: set repository secret GOOGLE_API_KEY (Drive API enabled).
 * Fallback: direct/proxy HTML scrape (works on many local machines).
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
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 30000
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 6) {
          const next = res.headers.location.startsWith("http")
            ? res.headers.location
            : new URL(res.headers.location, u).href;
          res.resume();
          return fetchText(next, redirects + 1).then(resolve, reject);
        }
        let data = Buffer.alloc(0);
        res.on("data", (c) => {
          data = Buffer.concat([data, c]);
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} for ${u}`));
            return;
          }
          resolve(data.toString("utf8"));
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
  if (!API_KEY) {
    console.log("GOOGLE_API_KEY not set — skipping Drive API");
    return [];
  }
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
    if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
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
    `https://corsproxy.io/?${encoded}`
  ];
  const errors = [];
  for (const src of sources) {
    try {
      console.log(`Trying: ${src.slice(0, 100)}`);
      const text = await fetchText(src);
      if (/accounts\.google\.com\/ServiceLogin/i.test(text)) {
        throw new Error("Got Google login page (IP blocked)");
      }
      const files = parseFiles(text);
      if (files.length) {
        console.log(`Parsed ${files.length} files`);
        return files;
      }
      throw new Error(`No file ids found (length=${text.length})`);
    } catch (err) {
      console.warn(`Failed: ${err.message || err}`);
      errors.push(`${src}: ${err.message || err}`);
    }
  }
  throw new Error(`All HTML sources failed:\n${errors.join("\n")}`);
}

function writeOutputs(files) {
  // images-map.json is what the app loads first — always write it.
  fs.writeFileSync("images-map.json", JSON.stringify(files, null, 2) + "\n");

  let cfg = fs.readFileSync("config.js", "utf8");
  if (cfg.charCodeAt(0) === 0xfeff) cfg = cfg.slice(1);

  const start = cfg.search(/window\.DRIVE_IMAGES\s*=\s*\[/);
  if (start < 0) {
    console.warn("DRIVE_IMAGES block not found in config.js — images-map.json was still updated");
    return;
  }

  const openBracket = cfg.indexOf("[", start);
  let depth = 0;
  let end = -1;
  for (let i = openBracket; i < cfg.length; i++) {
    const ch = cfg[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        let j = i + 1;
        while (j < cfg.length && /\s/.test(cfg[j])) j++;
        end = cfg[j] === ";" ? j + 1 : i + 1;
        break;
      }
    }
  }
  if (end < 0) {
    console.warn("Could not find end of DRIVE_IMAGES array — images-map.json was still updated");
    return;
  }

  const list = files.map((f) => `  { id: "${f.id}", name: ${JSON.stringify(f.name)} }`).join(",\n");
  const block = `window.DRIVE_IMAGES = [\n${list}\n];`;
  const next = cfg.slice(0, start) + block + cfg.slice(end);
  fs.writeFileSync("config.js", next.replace(/\r\n/g, "\n"));
}

(async () => {
  let files = [];
  let apiError = null;

  if (!API_KEY && process.env.GITHUB_ACTIONS === "true") {
    throw new Error(
      "GOOGLE_API_KEY is empty in GitHub Actions. " +
        "Add repository secret GOOGLE_API_KEY (Settings → Secrets and variables → Actions)."
    );
  }

  try {
    files = await fetchViaDriveApi();
    if (files.length) console.log(`Drive API returned ${files.length} files`);
  } catch (err) {
    apiError = err;
    console.warn("Drive API failed:", err.message || err);
  }

  if (!files.length) {
    try {
      files = await fetchFolderHtmlSources();
    } catch (htmlErr) {
      const parts = [];
      if (apiError) parts.push(`Drive API: ${apiError.message || apiError}`);
      parts.push(`HTML scrape: ${htmlErr.message || htmlErr}`);
      throw new Error(parts.join("\n"));
    }
  }

  if (!files.length) throw new Error("No images found in Drive folder");

  writeOutputs(files);
  console.log(`Synced ${files.length} images:`);
  files.forEach((f) => console.log(" -", f.name));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
