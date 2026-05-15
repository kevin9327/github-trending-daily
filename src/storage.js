import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./config.js";

const latestPath = path.join(dataDir, "latest.json");
const legacyLatestPath = path.join(dataDir, "trending.json");
const historyDir = path.join(dataDir, "history");

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

export async function readLatestSnapshot() {
  return (await readJson(latestPath)) ?? (await readJson(legacyLatestPath));
}

export async function readSnapshotByDate(date) {
  return readJson(path.join(historyDir, `${date}.json`));
}

export async function writeSnapshot(snapshot) {
  await writeJsonAtomic(path.join(historyDir, `${snapshot.date}.json`), snapshot);
  await writeJsonAtomic(latestPath, snapshot);
  await writeJsonAtomic(legacyLatestPath, snapshot);
}

export async function listSnapshotDates() {
  try {
    const entries = await fs.readdir(historyDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /^\d{4}-\d{2}-\d{2}\.json$/.test(entry.name))
      .map((entry) => entry.name.replace(/\.json$/, ""))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}
