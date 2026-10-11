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
    name: "landing-1440px-ink.png",
    theme: "ink",
    hash: "#/",
    width: 1440,
    height: 900,
  },
  {
    name: "landing-1440px-paper.png",
    theme: "paper",
    hash: "#/",
    width: 1440,
    height: 900,
  },
  {
    name: "landing-390px-ink.png",
    theme: "ink",
    hash: "#/",
    width: 390,
    height: 844,
  },
  {
    name: "app-split-1440px-ink.png",
    theme: "ink",
    hash: "#/app",
    tab: "split",
    width: 1440,
    height: 900,
  },
  {
    name: "app-market-1440px-ink.png",
    theme: "ink",
    hash: "#/app",
    tab: "market",
    width: 1440,
    height: 900,
  },
  {
    name: "app-curve-1440px-ink.png",
    theme: "ink",
    hash: "#/app",
    tab: "curve",
    width: 1440,
    height: 900,
  },
  {
    name: "app-portfolio-390px-ink.png",
    theme: "ink",
    hash: "#/app",
    tab: "portfolio",
    width: 390,
    height: 844,
  },
  {
    name: "app-drawer-1440px-ink.png",
    theme: "ink",
    hash: "#/app",
    tab: "split",
    width: 1440,
    height: 900,
    action: "openDrawer",
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
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

    for (const target of targets) {
      console.log(`Rendering ${target.name} (${target.width}x${target.height}, ${target.theme}, hash: ${target.hash})...`);
      await page.setViewport({
        width: target.width,
        height: target.height,
        deviceScaleFactor: 1,
      });

      const url = `http://127.0.0.1:${PORT}/index.html?theme=${target.theme}${target.hash || ''}`;
      await page.goto(url, {
        waitUntil: "networkidle0",
        timeout: 15000,
      });

      // Allow fonts, CSS, and Anvil RPC data to settle
      await new Promise((r) => setTimeout(r, 1200));

      if (target.tab) {
        try {
          const tabBtn = await page.$(`button[data-tab="${target.tab}"]`);
          if (tabBtn) {
            await tabBtn.click();
            await new Promise((r) => setTimeout(r, 600));
          }
        } catch (e) {
          console.warn(`Could not click tab ${target.tab}:`, e);
        }
      }

      if (target.action === "openDrawer") {
        try {
          const btn = await page.$(".prism-app-header__demo-btn");
          if (btn) {
            await btn.click();
            await new Promise((r) => setTimeout(r, 600));
          }
        } catch (e) {
          console.warn("Could not click demo drawer button:", e);
        }
      }

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
