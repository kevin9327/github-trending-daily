import { chromium } from "playwright";

const baseUrl = process.env.VERIFY_URL ?? "http://localhost:3000";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  const health = await page.request.get(`${baseUrl}/api/health`).catch(() => null);
  const mode = health?.ok() ? "server" : "static";

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const title = await page.locator("h1").textContent();
  const cards = await page.locator(".repo-card").count();
  await page.locator("#searchInput").fill("python");
  const filtered = await page.locator(".repo-card").count();

  if (!title?.includes("GitHub 트렌딩")) {
    throw new Error("Main title did not render.");
  }

  if (cards < 1) {
    throw new Error("No repositories rendered.");
  }

  if (filtered < 1) {
    throw new Error("Search did not return any Python results.");
  }

  console.log(JSON.stringify({ ok: true, mode, title, cards, filtered }));
} finally {
  await browser.close();
}
