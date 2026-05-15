import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const dataDir = path.join(rootDir, "data");
const distDir = path.join(rootDir, "dist");

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function listDates() {
  const historyDir = path.join(dataDir, "history");
  if (!(await pathExists(historyDir))) return [];

  const entries = await fs.readdir(historyDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^\d{4}-\d{2}-\d{2}\.json$/.test(entry.name))
    .map((entry) => entry.name.replace(/\.json$/, ""))
    .sort()
    .reverse();
}

async function main() {
  if (!(await pathExists(path.join(dataDir, "latest.json")))) {
    throw new Error("data/latest.json is missing. Run npm run scrape first.");
  }

  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });
  await fs.cp(publicDir, distDir, { recursive: true });
  await fs.cp(dataDir, path.join(distDir, "data"), { recursive: true });
  await fs.writeFile(path.join(distDir, ".nojekyll"), "", "utf8");
  await fs.writeFile(
    path.join(distDir, "data", "manifest.json"),
    `${JSON.stringify({ dates: await listDates(), builtAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );

  console.log(`Built static site at ${distDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
