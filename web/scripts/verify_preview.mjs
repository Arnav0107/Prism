import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4173;
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
  ".json": "application/json",
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = parsedUrl.pathname;
  if (pathname === "/" || !path.extname(pathname)) pathname = "/index.html";

  const filePath = path.join(DIST_DIR, pathname);
  if (!fs.existsSync(filePath)) {
    // SPA fallback
    const indexPath = path.join(DIST_DIR, "index.html");
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { "Content-Type": "text/html" });
      fs.createReadStream(indexPath).pipe(res);
      return;
    }
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

server.listen(PORT, "127.0.0.1", async () => {
  console.log(`Preview server running on http://127.0.0.1:${PORT}`);

  const pageErrors = [];
  const consoleErrors = [];

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

    page.on("pageerror", (err) => {
      console.error("PAGE ERROR:", err.message);
      pageErrors.push(err.message);
    });

    page.on("console", (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === "error") {
        console.error("PAGE LOG (ERROR):", text);
        consoleErrors.push(text);
      } else {
        console.log(`PAGE LOG (${type}):`, text);
      }
    });

    await page.setViewport({ width: 1440, height: 900 });

    const targetUrl = `http://127.0.0.1:${PORT}/#/app`;
    console.log(`Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: "networkidle0", timeout: 20000 });

    // Wait for on-chain queries to load or settle
    await new Promise((r) => setTimeout(r, 4000));

    // Check root content
    const rootHtml = await page.$eval("#root", (el) => el.innerHTML);
    const rootText = await page.$eval("#root", (el) => el.innerText);

    console.log(`Root HTML length: ${rootHtml.length}`);
    console.log(`Has real content: ${rootText.length > 50}`);

    // Assertions
    const hasReadonlyBanner = rootText.includes("Read-only: connect a wallet to interact");
    const hasConnectInjected = rootText.includes("CONNECT INJECTED");
    const hasMonadTag = rootText.includes("MONAD TESTNET");

    console.log(`Has read-only banner: ${hasReadonlyBanner}`);
    console.log(`Has CONNECT INJECTED button: ${hasConnectInjected}`);
    console.log(`Has MONAD TESTNET badge: ${hasMonadTag}`);

    const screenshotPath = path.resolve(DOCS_DIR, "live_readonly.png");
    await page.screenshot({ path: screenshotPath });
    console.log(`Saved screenshot to ${screenshotPath}`);

    await browser.close();

    if (pageErrors.length > 0) {
      console.error(`FAILED: Encountered ${pageErrors.length} pageerror event(s).`);
      process.exit(1);
    }

    // Filter console errors for app code vs benign network issues
    const appCodeErrors = consoleErrors.filter(
      (e) => !e.includes("favicon.ico") && !e.includes("net::ERR")
    );

    if (appCodeErrors.length > 0) {
      console.error(`FAILED: Encountered ${appCodeErrors.length} console error(s) from app code:`, appCodeErrors);
      process.exit(1);
    }

    if (!hasReadonlyBanner || !hasConnectInjected) {
      console.error("FAILED: Read-only banner or Connect Injected button missing.");
      process.exit(1);
    }

    console.log("SUCCESS: Preview headless verification passed with 0 pageerrors and 0 app console errors!");
  } catch (err) {
    console.error("Verification failed with exception:", err);
    process.exit(1);
  } finally {
    server.close(() => process.exit(0));
  }
});
