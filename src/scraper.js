import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  buildTrendingUrl,
  dateInTimezone,
  minimumRepositoryCount,
  timezone,
  trendingLanguage,
  trendingSince
} from "./config.js";
import { readLatestSnapshot, writeSnapshot } from "./storage.js";

function normalizeNumber(value) {
  if (!value) return 0;
  const compact = value.replace(/,/g, "").trim().toLowerCase();
  const multiplier = compact.endsWith("k") ? 1000 : 1;
  const cleaned = compact.replace(/[^\d.]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * multiplier) : 0;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateSnapshot(snapshot) {
  if (!Array.isArray(snapshot.repositories) || snapshot.repositories.length < minimumRepositoryCount) {
    throw new Error(`Only ${snapshot.repositories?.length ?? 0} repositories were parsed.`);
  }

  const invalid = snapshot.repositories.find((repo) => !repo.fullName || !repo.url);
  if (invalid) {
    throw new Error("Parsed repository data is missing a required name or URL.");
  }
}

async function scrapeTrendingOnce() {
  const source = buildTrendingUrl();
  const browser = await chromium.launch({
    headless: true
  });

  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
    });

    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "font", "media"].includes(type)) {
        route.abort();
        return;
      }
      route.continue();
    });

    await page.goto(source, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("article.Box-row", { timeout: 30_000 });

    const repositories = await page.$$eval("article.Box-row", (rows) =>
      rows.map((row, index) => {
        const text = (selector) => row.querySelector(selector)?.textContent?.trim() ?? "";
        const link = row.querySelector("h2 a");
        const href = link?.getAttribute("href") ?? "";
        const fullName = link?.textContent?.replace(/\s+/g, "").trim() ?? "";
        const [owner = "", name = ""] = fullName.split("/");
        const mutedLinks = [...row.querySelectorAll("a.Link--muted")].map((item) =>
          item.textContent?.trim() ?? ""
        );
        const languageNode = row.querySelector("[itemprop='programmingLanguage']");
        const languageColor =
          row.querySelector(".repo-language-color")?.getAttribute("style")?.match(/#[0-9a-fA-F]{6}/)?.[0] ??
          "";
        const starsToday = [...row.querySelectorAll("span")].find((item) =>
          /stars?\stoday/i.test(item.textContent ?? "")
        );

        return {
          rank: index + 1,
          owner,
          name,
          fullName,
          url: href ? `https://github.com${href}` : "",
          description: text("p"),
          language: languageNode?.textContent?.trim() ?? "",
          languageColor,
          starsText: mutedLinks[0] ?? "",
          forksText: mutedLinks[1] ?? "",
          starsTodayText: starsToday?.textContent?.trim().replace(/\s+/g, " ") ?? ""
        };
      })
    );

    const snapshot = {
      source,
      since: trendingSince,
      language: trendingLanguage || "all",
      timezone,
      date: dateInTimezone(),
      fetchedAt: new Date().toISOString(),
      repositories: repositories.map((repo) => ({
        ...repo,
        stars: normalizeNumber(repo.starsText),
        forks: normalizeNumber(repo.forksText),
        starsToday: normalizeNumber(repo.starsTodayText)
      }))
    };

    validateSnapshot(snapshot);
    return snapshot;
  } finally {
    await browser.close();
  }
}

export async function scrapeTrending({ attempts = 3 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await scrapeTrendingOnce();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await wait(1500 * attempt);
      }
    }
  }

  throw lastError;
}

export async function scrapeAndCache() {
  const data = await scrapeTrending();
  await writeSnapshot(data);
  return data;
}

export function isCacheFreshToday(cache) {
  return cache?.date === dateInTimezone() && Array.isArray(cache.repositories) && cache.repositories.length > 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scrapeAndCache()
    .then((data) => {
      console.log(`Fetched ${data.repositories.length} repositories for ${data.date}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

export { readLatestSnapshot as readCache };
