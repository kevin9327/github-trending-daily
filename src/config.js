import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, "..");
export const publicDir = path.join(rootDir, "public");
export const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(rootDir, "data");

export const timezone = process.env.APP_TIMEZONE ?? "Asia/Seoul";
export const port = Number(process.env.PORT ?? 3000);
export const trendingSince = process.env.TRENDING_SINCE ?? "daily";
export const trendingLanguage = process.env.TRENDING_LANGUAGE ?? "";
export const manualRefreshCooldownMs =
  Number(process.env.MANUAL_REFRESH_COOLDOWN_MINUTES ?? 15) * 60 * 1000;
export const startupRefresh = process.env.STARTUP_REFRESH !== "false";
export const adminRefreshToken = process.env.ADMIN_REFRESH_TOKEN ?? "";
export const scheduledRefreshHour = Number(process.env.SCHEDULED_REFRESH_HOUR ?? 9);
export const scheduledRefreshMinute = Number(process.env.SCHEDULED_REFRESH_MINUTE ?? 10);
export const minimumRepositoryCount = Number(process.env.MIN_REPOSITORY_COUNT ?? 5);

export function dateInTimezone(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function partsInTimezone(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
}

function zonedTimeToUtcMs({ year, month, day, hour, minute }) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let index = 0; index < 4; index += 1) {
    const parts = partsInTimezone(new Date(guess));
    const actualAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    guess += targetAsUtc - actualAsUtc;
  }

  return guess;
}

function nextLocalDate({ year, month, day }) {
  const utcTomorrow = new Date(Date.UTC(year, month - 1, day) + 24 * 60 * 60 * 1000);
  return {
    year: utcTomorrow.getUTCFullYear(),
    month: utcTomorrow.getUTCMonth() + 1,
    day: utcTomorrow.getUTCDate()
  };
}

export function buildTrendingUrl() {
  const url = new URL("https://github.com/trending");
  if (trendingLanguage) {
    url.pathname = `/trending/${encodeURIComponent(trendingLanguage)}`;
  }
  url.searchParams.set("since", trendingSince);
  return url.toString();
}

export function msUntilNextScheduledRefresh(now = new Date()) {
  const localNow = partsInTimezone(now);
  let targetUtcMs = zonedTimeToUtcMs({
    year: localNow.year,
    month: localNow.month,
    day: localNow.day,
    hour: scheduledRefreshHour,
    minute: scheduledRefreshMinute
  });

  if (targetUtcMs <= now.getTime()) {
    targetUtcMs = zonedTimeToUtcMs({
      ...nextLocalDate(localNow),
      hour: scheduledRefreshHour,
      minute: scheduledRefreshMinute
    });
  }

  return targetUtcMs - now.getTime();
}
