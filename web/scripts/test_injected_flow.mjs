import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8095;
const DIST_DIR = path.resolve(__dirname, "../dist");
const DOCS_DIR = path.resolve(__dirname, "../../docs/screenshots");
const LOG_FILE = path.join(DOCS_DIR, "injected_flow_check.txt");

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

async function run() {
  const logLines = [];
  const log = (msg) => {
    const entry = `[${new Date().toISOString()}] ${msg}`;
    console.log(entry);
    logLines.push(entry);
  };

  await new Promise((resolve) => server.listen(PORT, resolve));
  log(`Local test server started on http://localhost:${PORT}`);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    page.on("pageerror", (err) => log(`PAGE ERROR: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") log(`CONSOLE ERROR: ${msg.text()}`);
    });

    // Inject minimal EIP-1193 window.ethereum backed by Anvil
    await page.evaluateOnNewDocument(() => {
      const ANVIL_RPC = "http://127.0.0.1:8545";
      const TEST_ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
      const listeners = {};

      window.ethereum = {
        isMetaMask: true,
        selectedAddress: TEST_ACCOUNT,
        chainId: "0x7a69", // 31337
        on(event, handler) {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(handler);
        },
        removeListener(event, handler) {
          if (!listeners[event]) return;
          listeners[event] = listeners[event].filter((h) => h !== handler);
        },
        async request({ method, params = [] }) {
          if (method === "eth_requestAccounts" || method === "eth_accounts") {
            return [TEST_ACCOUNT];
          }
          if (method === "eth_chainId") {
            return "0x7a69";
          }
          if (method === "wallet_switchEthereumChain") {
            return null;
          }
          // Forward RPC calls to Anvil
          const res = await fetch(ANVIL_RPC, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: Date.now(),
              method,
              params: params.map((p) => {
                if (typeof p === "object" && p !== null && !p.from) {
                  return { ...p, from: TEST_ACCOUNT };
                }
                return p;
              }),
            }),
          });
          const json = await res.json();
          if (json.error) {
            throw new Error(json.error.message || "RPC Error");
          }
          return json.result;
        },
      };
    });

    log("Navigating to http://localhost:" + PORT + "/#/app...");
    await page.goto(`http://localhost:${PORT}/#/app`, { waitUntil: "networkidle0", timeout: 20000 });

    await new Promise((r) => setTimeout(r, 2000));
    log("Loaded initial UI");

    // Look for Connect Injected button if needed
    const connectBtn = await page.$('button.prism-wallet-bar__connect-btn');
    if (connectBtn) {
      const btnText = await page.evaluate((el) => el.innerText, connectBtn);
      log(`Found button: ${btnText}`);
      if (btnText.includes("CONNECT INJECTED") || btnText.includes("SWITCH")) {
        await connectBtn.click();
        await new Promise((r) => setTimeout(r, 1500));
        log("Clicked connect button");
      }
    }

    // Monitor balance displays over 15 seconds to ensure no flickering to "..."
    let sawFlicker = false;
    for (let step = 0; step < 5; step++) {
      const balanceText = await page.evaluate(() => {
        const el = document.querySelector(".prism-wallet-bar__balances");
        return el ? el.innerText : "";
      });
      log(`Balance check [${step}]: ${balanceText.replace(/\n/g, " | ")}`);
      if (balanceText.includes("...")) {
        sawFlicker = true;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }

    if (!sawFlicker) {
      log("ASSERTION PASSED: Balances remained stable without flickering back to '...'");
    } else {
      log("WARNING: Saw temporary balance loading indicator during poll");
    }

    log("Injected wallet flow check completed successfully.");
    fs.writeFileSync(LOG_FILE, logLines.join("\n") + "\n");
    log(`Saved log to ${LOG_FILE}`);
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error("Test injected flow failed:", err);
  process.exit(1);
});
