import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const manifestPath = resolve(
  root,
  "public/samples/cc0-manifest.json",
);
const manifest = JSON.parse(
  readFileSync(manifestPath, "utf8"),
);

function gitBlobSha(buffer) {
  return createHash("sha1")
    .update("blob " + buffer.length + "\0")
    .update(buffer)
    .digest("hex");
}

function validExisting(path, sample) {
  if (!existsSync(path)) return false;
  const bytes = readFileSync(path);
  return (
    bytes.length === sample.byteLength &&
    gitBlobSha(bytes) === sample.blobSha
  );
}

async function downloadSample(sample) {
  const target = resolve(
    root,
    "public/samples",
    sample.file,
  );

  if (validExisting(target, sample)) {
    return "cached";
  }

  const url =
    "https://raw.githubusercontent.com/" +
    manifest.source.repository +
    "/" +
    manifest.source.commit +
    "/" +
    sample.sourcePath;

  const response = await fetch(url, {
    headers: {
      "user-agent": "synth-build/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      "CC0 sample download failed (" +
        response.status +
        "): " +
        sample.id,
    );
  }

  const bytes = Buffer.from(
    await response.arrayBuffer(),
  );
  const sha = gitBlobSha(bytes);

  if (
    bytes.length !== sample.byteLength ||
    sha !== sample.blobSha
  ) {
    throw new Error(
      "CC0 sample integrity mismatch: " +
        sample.id +
        " expected " +
        sample.blobSha +
        " / " +
        sample.byteLength +
        " bytes, got " +
        sha +
        " / " +
        bytes.length,
    );
  }

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return "downloaded";
}

let downloaded = 0;
let cached = 0;

for (const sample of manifest.samples) {
  const result = await downloadSample(sample);
  if (result === "downloaded") {
    downloaded += 1;
  } else {
    cached += 1;
  }
}

console.log(
  "CC0 sample bank ready: " +
    downloaded +
    " downloaded, " +
    cached +
    " cached. Source " +
    manifest.source.repository +
    " @ " +
    manifest.source.commit.slice(0, 12) +
    ".",
);
