import express from "express";
import {
  adminRefreshToken,
  dateInTimezone,
  manualRefreshCooldownMs,
  msUntilNextScheduledRefresh,
  port,
  publicDir,
  scheduledRefreshHour,
  scheduledRefreshMinute,
  startupRefresh,
  timezone
} from "./config.js";
import { isCacheFreshToday, scrapeAndCache } from "./scraper.js";
import { listSnapshotDates, readLatestSnapshot, readSnapshotByDate } from "./storage.js";

const app = express();

let latestData = await readLatestSnapshot();
let refreshPromise = null;
let lastManualRefreshAt = 0;
let lastRefreshError = null;

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  next();
});
app.use(
  express.static(publicDir, {
    extensions: ["html"],
    maxAge: "5m"
  })
);

function publicState(status = "ready") {
  const today = dateInTimezone();
  return {
    status,
    today,
    stale: latestData ? latestData.date !== today : true,
    lastError: lastRefreshError,
    data: latestData
  };
}

async function refreshTrending(reason) {
  if (refreshPromise) return refreshPromise;

  refreshPromise = scrapeAndCache()
    .then((data) => {
      latestData = data;
      lastRefreshError = null;
      console.log(`[trending] refreshed ${data.repositories.length} repos (${reason})`);
      return data;
    })
    .catch((error) => {
      lastRefreshError = {
        message: error.message,
        at: new Date().toISOString(),
        reason
      };
      console.error(`[trending] refresh failed (${reason})`, error);
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

async function ensureFreshData() {
  if (startupRefresh && !isCacheFreshToday(latestData)) {
    await refreshTrending("startup");
  }
}

app.get("/api/health", (_req, res) => {
  const healthy = Boolean(latestData?.repositories?.length);
  res.status(healthy ? 200 : 503).json({
    ok: healthy,
    refreshing: Boolean(refreshPromise),
    today: dateInTimezone(),
    latestDate: latestData?.date ?? null,
    repositoryCount: latestData?.repositories?.length ?? 0,
    lastError: lastRefreshError
  });
});

app.get("/api/dates", async (_req, res) => {
  res.json({ dates: await listSnapshotDates() });
});

app.get("/api/trending", async (req, res) => {
  if (typeof req.query.date === "string") {
    const date = req.query.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ status: "error", message: "Invalid date format. Use YYYY-MM-DD." });
      return;
    }

    const snapshot = await readSnapshotByDate(date);
    if (!snapshot) {
      res.status(404).json({ status: "not_found", message: "No snapshot exists for that date." });
      return;
    }

    res.json({ status: "ready", today: dateInTimezone(), stale: snapshot.date !== dateInTimezone(), data: snapshot });
    return;
  }

  if (latestData) {
    res.json(publicState(refreshPromise ? "refreshing" : "ready"));
    return;
  }

  try {
    const data = await refreshTrending("initial-request");
    res.json({ ...publicState("ready"), data });
  } catch (error) {
    res.status(503).json({
      status: "error",
      message: "GitHub Trending data is not available yet.",
      detail: error.message
    });
  }
});

function isRefreshAuthorized(req) {
  if (!adminRefreshToken) return true;
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : req.get("x-refresh-token");
  return token === adminRefreshToken;
}

app.post("/api/refresh", async (req, res) => {
  if (!isRefreshAuthorized(req)) {
    res.status(401).json({
      status: "unauthorized",
      message: "Manual refresh is protected on this deployment."
    });
    return;
  }

  const now = Date.now();
  const remainingMs = manualRefreshCooldownMs - (now - lastManualRefreshAt);

  if (remainingMs > 0 && latestData) {
    res.status(429).json({
      status: "cooldown",
      retryAfterSeconds: Math.ceil(remainingMs / 1000),
      ...publicState("cooldown")
    });
    return;
  }

  lastManualRefreshAt = now;

  try {
    const data = await refreshTrending("manual");
    res.json({ ...publicState("ready"), data });
  } catch (error) {
    res.status(latestData ? 200 : 502).json({
      status: "error",
      message: "Could not refresh GitHub Trending right now.",
      detail: error.message,
      ...publicState(latestData ? "stale" : "error")
    });
  }
});

setInterval(() => {
  if (!isCacheFreshToday(latestData)) {
    refreshTrending("hourly-catchup").catch(() => {});
  }
}, 60 * 60 * 1000).unref();

function scheduleNextDailyRefresh() {
  const delay = msUntilNextScheduledRefresh();
  setTimeout(() => {
    refreshTrending("scheduled-daily")
      .catch(() => {})
      .finally(scheduleNextDailyRefresh);
  }, delay).unref();
}

app.listen(port, () => {
  console.log(`GitHub Trending Daily running at http://localhost:${port}`);
  console.log(
    `Daily refresh scheduled for ${String(scheduledRefreshHour).padStart(2, "0")}:${String(
      scheduledRefreshMinute
    ).padStart(2, "0")} (${timezone})`
  );
  scheduleNextDailyRefresh();
  ensureFreshData().catch(() => {});
});
