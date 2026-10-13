import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, "../../docs/screenshots");

fs.mkdirSync(DOCS_DIR, { recursive: true });

let chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
if (!fs.existsSync(chromePath)) {
  chromePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
}

async function verifyLive() {
  const pageErrors = [];
  const consoleErrors = [];
  const consoleLogs = [];

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

  try {
    const page = await browser.newPage();

    page.on("pageerror", (err) => {
      console.error("LIVE PAGE ERROR:", err.message);
      pageErrors.push(err.message);
    });

    page.on("console", (msg) => {
      const type = msg.type();
      const text = msg.text();
      consoleLogs.push({ type, text });
      if (type === "error") {
        console.error("LIVE PAGE LOG (ERROR):", text);
        consoleErrors.push(text);
      } else {
        console.log(`LIVE PAGE LOG (${type}):`, text);
      }
    });

    await page.setViewport({ width: 1440, height: 900 });

    const liveUrl = "https://prism-pink-ten.vercel.app/#/app";
    console.log(`Navigating to live URL: ${liveUrl}...`);
    await page.goto(liveUrl, { waitUntil: "networkidle0", timeout: 30000 });

    // Allow Monad RPC queries and activity feed to fetch and settle
    console.log("Waiting 6 seconds for on-chain state to load...");
    await new Promise((r) => setTimeout(r, 6000));

    const rootHtml = await page.$eval("#root", (el) => el.innerHTML);
    const rootText = await page.$eval("#root", (el) => el.innerText);

    console.log(`Live Root HTML length: ${rootHtml.length}`);
    console.log(`Live Has real content: ${rootText.length > 50}`);

    const hasReadonlyBanner = rootText.includes("Read-only: connect a wallet to interact");
    const hasConnectInjected = rootText.includes("CONNECT INJECTED");
    const hasMonadTag = rootText.includes("MONAD TESTNET");

    console.log(`Has read-only banner: ${hasReadonlyBanner}`);
    console.log(`Has CONNECT INJECTED button: ${hasConnectInjected}`);
    console.log(`Has MONAD TESTNET badge: ${hasMonadTag}`);

    const screenshotPath = path.resolve(DOCS_DIR, "live_verified.png");
    await page.screenshot({ path: screenshotPath });
    console.log(`Saved live screenshot to ${screenshotPath}`);

    // Check for any app code errors
    const appCodeErrors = consoleErrors.filter(
      (e) => !e.includes("favicon.ico") && !e.includes("net::ERR")
    );

    console.log("=== SUMMARY ===");
    console.log(`Page Errors: ${pageErrors.length}`);
    console.log(`App Code Console Errors: ${appCodeErrors.length}`);

    if (pageErrors.length > 0) {
      console.error("Encountered pageerror events on live site:", pageErrors);
      process.exit(1);
    }

    if (appCodeErrors.length > 0) {
      console.error("Encountered app code console errors on live site:", appCodeErrors);
      process.exit(1);
    }

    if (!hasReadonlyBanner || !hasConnectInjected) {
      console.error("Live site missing Read-only banner or Connect Injected button");
      process.exit(1);
    }

    console.log("SUCCESS: Live site verified with 0 pageerrors and 0 app console errors!");
  } finally {
    await browser.close();
  }
}

verifyLive().catch((e) => {
  console.error("Live verification script threw:", e);
  process.exit(1);
});
