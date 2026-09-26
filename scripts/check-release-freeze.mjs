import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(
  readFileSync(
    resolve(root, "package.json"),
    "utf8",
  ),
);

const packageLock = JSON.parse(
  readFileSync(
    resolve(root, "package-lock.json"),
    "utf8",
  ),
);

const failures = [];

if (packageJson.version !== "1.1.0") {
  failures.push(
    "package version must be exactly 1.1.0 for the Playground v1.1 production release.",
  );
}

if (
  packageLock.lockfileVersion !== 3 ||
  packageLock.version !== packageJson.version ||
  packageLock.packages?.[""]?.version !== packageJson.version
) {
  failures.push(
    "package-lock.json must be lockfile v3 and match the production package version.",
  );
}

for (const [group, dependencies] of Object.entries({
  dependencies: packageJson.dependencies ?? {},
  devDependencies: packageJson.devDependencies ?? {},
})) {
  for (const [name, version] of Object.entries(dependencies)) {
    if (
      typeof version !== "string" ||
      /^[~^*]|latest|next|workspace:/i.test(version)
    ) {
      failures.push(
        group + " dependency " + name +
          " is not exactly pinned: " + String(version),
      );
    }
  }
}

const contracts = [
  ["src/domain/contracts.ts", "PROJECT_SCHEMA_VERSION = 1"],
  ["src/project/projectTypes.ts", "SYNTH_PROJECT_DOCUMENT_VERSION"],
  ["package.json", '"check:playground"'],
  ["package.json", '"qa:playground"'],
  ["package.json", '"qa:e2e"'],
  ["package.json", '"qa:soak"'],
  ["scripts/check-playground-release.mjs", "Playground Q1-Q8 release contracts verified."],
  ["e2e/playground.spec.ts", "Playground desktop discovery and step context are release-safe"],
  ["docs/THIRD_PARTY_AUDIO.md", "License: CC0 1.0 Universal"],
  ["public/sw.js", "SAMPLE_MANIFEST_URL"],
  ["public/sw.js", 'url.pathname.includes("/samples/")'],
  ["src/domain/contracts.ts", 'origin?: "user" | "bundled"'],
  ["e2e/production.spec.ts", "explicit user import survives bundled-sample identity collision"],
  ["e2e/production.spec.ts", "named versions protect bundled audio from autosave garbage collection"],
  ["e2e/production.spec.ts", "missingSamples"],
  [".github/workflows/ci.yml", "Playground release QA"],
  [".github/workflows/ci.yml", "Release-candidate soak"],
  ["docs/phase-40/PHASE_40.md", "v1.0.0"],
  ["docs/phase-40/RELEASE_NOTES.md", "# Synth v1.0.0"],
  ["docs/playground-v1.1/RELEASE_NOTES.md", "# Synth v1.1.0"],
  ["docs/playground-v1.1/RELEASE_CHECKLIST.md", "Q1–Q8"],
  ["README.md", "**Release:** Synth v1.1.0"],
  ["src/App.tsx", "<span>v1.1.0</span>"],
  [".github/workflows/release.yml", "Publish v1.1.0"],
  [".github/workflows/release.yml", "gh release create"],
  [".github/workflows/release.yml", "github.event.workflow_run.conclusion == 'success'"],
];

for (const [path, text] of contracts) {
  const content = readFileSync(
    resolve(root, path),
    "utf8",
  );
  if (!content.includes(text)) {
    failures.push(
      "Release freeze contract missing: " +
        text + " [" + path + "]",
    );
  }
}

if (failures.length > 0) {
  throw new Error(
    "Release freeze check failed:\n- " +
      failures.join("\n- "),
  );
}

console.log(
  "Release freeze contracts verified for Synth v1.1.0.",
);
