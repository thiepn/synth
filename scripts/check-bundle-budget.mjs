import {
  readFileSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");

function bytes(path) {
  return statSync(resolve(dist, path)).size;
}

function kb(value) {
  return (value / 1024).toFixed(1) + " KB";
}

const manifest = JSON.parse(
  readFileSync(
    resolve(dist, "asset-manifest.json"),
    "utf8",
  ),
);
const assets = Array.isArray(manifest.assets)
  ? manifest.assets
  : [];
const js = assets.filter((asset) => asset.endsWith(".js"));
const css = assets.filter((asset) => asset.endsWith(".css"));
const html = readFileSync(
  resolve(dist, "index.html"),
  "utf8",
);
const entryMatch = html.match(
  /<script[^>]+type=["']module["'][^>]+src=["']([^"']+\.js)["']/,
);
if (!entryMatch) {
  throw new Error("Could not identify the production entry JavaScript chunk.");
}
const entry = entryMatch[1]
  .replace(/^\.\//, "")
  .replace(/^\//, "");
const entryBytes = bytes(entry);
const largestJs = js
  .map((asset) => ({
    asset,
    size: bytes(asset),
  }))
  .sort((a, b) => b.size - a.size)[0];
const totalJs = js.reduce(
  (sum, asset) => sum + bytes(asset),
  0,
);
const totalCss = css.reduce(
  (sum, asset) => sum + bytes(asset),
  0,
);

const budgets = {
  entryJs: 700 * 1024,
  anyJs: 750 * 1024,
  totalJs: 2500 * 1024,
  totalCss: 240 * 1024,
  minimumJsChunks: 5,
};

console.log(
  [
    "Synth production bundle:",
    "  entry JS: " + entry + " · " + kb(entryBytes),
    "  largest JS: " +
      (largestJs?.asset ?? "none") +
      " · " +
      kb(largestJs?.size ?? 0),
    "  total JS: " + kb(totalJs) + " · " + js.length + " chunks",
    "  total CSS: " + kb(totalCss) + " · " + css.length + " chunks",
  ].join("\n"),
);

const failures = [];

if (entryBytes > budgets.entryJs) {
  failures.push(
    "Entry JS exceeds " + kb(budgets.entryJs) + ".",
  );
}
if ((largestJs?.size ?? 0) > budgets.anyJs) {
  failures.push(
    "A JS chunk exceeds " + kb(budgets.anyJs) + ".",
  );
}
if (totalJs > budgets.totalJs) {
  failures.push(
    "Total JS exceeds " + kb(budgets.totalJs) + ".",
  );
}
if (totalCss > budgets.totalCss) {
  failures.push(
    "Total CSS exceeds " + kb(budgets.totalCss) + ".",
  );
}
if (js.length < budgets.minimumJsChunks) {
  failures.push(
    "Mode code splitting regressed: expected at least " +
      budgets.minimumJsChunks +
      " JS chunks.",
  );
}

if (failures.length > 0) {
  throw new Error(
    "Bundle performance budget failed:\n- " +
      failures.join("\n- "),
  );
}

console.log("Bundle performance budgets passed.");
