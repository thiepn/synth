import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) =>
  readFileSync(resolve(root, path), "utf8");

const packageJson = JSON.parse(read("package.json"));
const packageLock = JSON.parse(read("package-lock.json"));
const failures = [];

if (packageJson.version !== "1.2.0") {
  failures.push(
    "package version must be exactly 1.2.0 for the v1.2 production release.",
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
        group +
          " dependency " +
          name +
          " is not exactly pinned: " +
          String(version),
      );
    }
  }
}

const contracts = [
  ["src/domain/contracts.ts", "PROJECT_SCHEMA_VERSION = 1"],
  ["src/project/projectTypes.ts", "SYNTH_PROJECT_DOCUMENT_VERSION"],
  ["src/project/projectTypes.ts", "version: 1;"],
  ["src/persistence/LocalProjectDatabase.ts", "const DATABASE_VERSION = 2;"],

  ["package.json", '"check:playground"'],
  ["package.json", '"check:sound"'],
  ["package.json", '"check:mix"'],
  ["package.json", '"check:finish"'],
  ["package.json", '"check:feel"'],
  ["package.json", '"check:variation"'],
  ["package.json", '"check:jam"'],
  ["package.json", '"check:recovery"'],
  ["package.json", '"check:starter"'],
  ["package.json", '"check:song-drafts"'],
  ["package.json", '"check:motion"'],
  ["package.json", '"check:workflow"'],
  ["package.json", '"check:arrange-polish"'],
  ["package.json", '"check:musical-quality"'],
  ["package.json", '"check:mobile-tablet"'],
  ["package.json", '"check:adversarial"'],
  ["package.json", '"qa:playground"'],
  ["package.json", '"qa:adversarial"'],
  ["package.json", '"qa:e2e"'],
  ["package.json", '"qa:soak"'],

  ["scripts/check-playground-workflow.mjs", "P16 workflow contracts verified"],
  ["scripts/check-arrangement-polish.mjs", "P17 arrangement contracts verified"],
  ["scripts/check-musical-quality.mjs", "P18 musical-quality contracts verified"],
  ["scripts/check-mobile-tablet-polish.mjs", "P19 mobile/tablet contracts verified"],
  ["scripts/check-adversarial-audit.mjs", "P20 adversarial audit contracts verified"],

  ["e2e/playground.spec.ts", "Playground P16 consolidates creative controls and targets advanced Studio workspaces"],
  ["e2e/playground.spec.ts", "P17 preserves Playground songs and polishes canonical Arrange editing"],
  ["e2e/playground.spec.ts", "P18 generation develops phrases and starters keep a deterministic mix baseline"],
  ["e2e/playground.spec.ts", "P19 mobile and tablet layouts keep touch controls compact and reachable"],
  ["e2e/adversarial.spec.ts", "P20 project switching clears transient edit and export state and restores the correct mixer lane"],
  ["e2e/adversarial.spec.ts", "P20 recording boundaries prevent partial project actions and commit safely before Studio"],
  ["e2e/adversarial.spec.ts", "P20 complete beat-to-song workflow survives reload and exports from restored state"],

  ["docs/phase-40/RELEASE_NOTES.md", "# Synth v1.0.0"],
  ["docs/playground-v1.1/RELEASE_NOTES.md", "# Synth v1.1.0"],
  ["docs/playground-v1.2/RELEASE_NOTES.md", "# Synth v1.2.0"],
  ["docs/playground-v1.2/RELEASE_NOTES.md", "## P21 — v1.2 release cut"],
  ["docs/playground-v1.2/RELEASE_CHECKLIST.md", "# Synth v1.2.0 — Release Checklist"],
  ["docs/playground-v1.2/RELEASE_CHECKLIST.md", "P20 adversarial product QA"],
  ["docs/playground-v1.2/P21_RELEASE_CUT.md", "# P21 — v1.2 Release Cut & Final Certification"],
  ["docs/playground-v1.2/P21_RELEASE_CUT.md", "planned feature development stops"],

  ["README.md", "**Release:** Synth v1.2.0"],
  ["README.md", "### Playground v1.2"],
  ["src/App.tsx", "<span>v1.2.0</span>"],

  [".github/workflows/ci.yml", "P20 adversarial product QA"],
  [".github/workflows/ci.yml", "Release-candidate soak"],

  [".github/workflows/release.yml", "Publish v1.2.0"],
  [".github/workflows/release.yml", 'if [ "$version" != "1.2.0" ]; then'],
  [".github/workflows/release.yml", "Verify certified SHA is still main HEAD"],
  [".github/workflows/release.yml", 'git rev-parse "$tag^{commit}"'],
  [".github/workflows/release.yml", "Release tag mismatch"],
  [".github/workflows/release.yml", "docs/playground-v1.2/RELEASE_NOTES.md"],
  [".github/workflows/release.yml", "gh release create"],
  [".github/workflows/release.yml", "github.event.workflow_run.conclusion == 'success'"],

  [".github/workflows/pages.yml", "workflow_run:"],
  [".github/workflows/pages.yml", "- CI"],
  [".github/workflows/pages.yml", "Verify certified SHA is current main HEAD"],
  [".github/workflows/pages.yml", "Deploy certified build to GitHub Pages"],

  ["docs/THIRD_PARTY_AUDIO.md", "License: CC0 1.0 Universal"],
  ["public/sw.js", "SAMPLE_MANIFEST_URL"],
  ["public/sw.js", 'url.pathname.includes("/samples/")'],
  ["src/domain/contracts.ts", 'origin?: "user" | "bundled"'],
];

for (const [path, token] of contracts) {
  const file = read(path);
  if (!file.includes(token)) {
    failures.push(
      "Release freeze contract missing: " +
        token +
        " [" +
        path +
        "]",
    );
  }
}

const releaseWorkflow = read(".github/workflows/release.yml");
if (
  releaseWorkflow.includes(
    "docs/playground-v1.1/RELEASE_NOTES.md",
  )
) {
  failures.push(
    "v1.2 publisher still references the historical v1.1 release notes.",
  );
}

const pagesWorkflow = read(".github/workflows/pages.yml");
if (
  pagesWorkflow.includes("push:") &&
  pagesWorkflow.includes("branches:")
) {
  failures.push(
    "Automatic Pages deployment must be gated by successful main CI rather than raw push.",
  );
}

const releaseNotes = read(
  "docs/playground-v1.2/RELEASE_NOTES.md",
);
if (
  !releaseNotes.includes("ProjectDocument schema: v1") ||
  !releaseNotes.includes("IndexedDB database version: v2")
) {
  failures.push(
    "v1.2 release notes must state storage compatibility explicitly.",
  );
}

if (failures.length > 0) {
  throw new Error(
    "Release freeze check failed:\n- " +
      failures.join("\n- "),
  );
}

console.log(
  "P21 release freeze contracts verified for Synth v1.2.0.",
);
