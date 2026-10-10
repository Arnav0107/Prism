import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8092;
const DIST_DIR = path.resolve(__dirname, "../dist");
const DOCS_DIR = path.resolve(__dirname, "../../docs/screenshots");

fs.mkdirSync(DOCS_DIR, { recursive: true });

const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = parsedUrl.pathname;
  if (pathname === "/") pathname = "/index.html";

  const filePath = path.join(DIST_DIR, pathname);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
});

let chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
if (!fs.existsSync(chromePath)) {
  chromePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
}

const targets = [
  {
    name: "landing-1440px-paper.png",
    theme: "paper",
    width: 1440,
    height: 900,
  },
  {
    name: "landing-1440px-ink.png",
    theme: "ink",
    width: 1440,
    height: 900,
  },
  {
    name: "landing-390px-paper.png",
    theme: "paper",
    width: 390,
    height: 844,
  },
  {
    name: "landing-390px-ink.png",
    theme: "ink",
    width: 390,
    height: 844,
  },
];

server.listen(PORT, "127.0.0.1", async () => {
  console.log(`Static server running on http://127.0.0.1:${PORT}`);

  try {
    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
    });

    const page = await browser.newPage();

    for (const target of targets) {
      console.log(`Rendering ${target.name} (${target.width}x${target.height}, ${target.theme})...`);
      await page.setViewport({
        width: target.width,
        height: target.height,
        deviceScaleFactor: 1,
      });

      await page.goto(`http://127.0.0.1:${PORT}/index.html?theme=${target.theme}`, {
        waitUntil: "networkidle0",
      });

      // Wait a moment for fonts and CSS to settle
      await new Promise((r) => setTimeout(r, 600));

      const outPath = path.join(DOCS_DIR, target.name);
      await page.screenshot({ path: outPath });
      const stats = fs.statSync(outPath);
      console.log(`Saved ${target.name} (${(stats.size / 1024).toFixed(1)} KB)`);
    }

    await browser.close();
    console.log("All screenshots captured successfully.");
  } catch (err) {
    console.error("Puppeteer screenshot failed:", err);
  } finally {
    server.close(() => process.exit(0));
  }
});
