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

if (packageJson.version !== "1.0.0") {
  failures.push(
    "package version must be exactly 1.0.0 for the production release.",
  );
}

if (
  packageLock.lockfileVersion !== 3 ||
  packageLock.version !== packageJson.version ||
  packageLock.packages?.[""]?.version !== packageJson.version
) {
  failures.push(
    "package-lock.json must be lockfile v3 and match the RC package version.",
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
  ["package.json", '"qa:e2e"'],
  ["package.json", '"qa:soak"'],
  [".github/workflows/ci.yml", "Release-candidate soak"],
  ["docs/phase-38/PHASE_38.md", "14 passed"],
  ["docs/phase-39/PHASE_39.md", "28 passed"],
  ["docs/phase-39/PHASE_39.md", "6 passed"],
  ["docs/phase-40/PHASE_40.md", "v1.0.0"],
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
  "Release freeze contracts verified for Synth v1.0.0.",
);
