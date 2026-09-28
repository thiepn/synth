import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) =>
  readFileSync(resolve(root, path), "utf8");

const failures = [];
const playground = read(
  "src/ui/playground/PlaygroundSurface.tsx",
);
const adapter = read(
  "src/arrange/playgroundArrangement.ts",
);
const store = read(
  "src/arrange/ArrangementStore.ts",
);
const playback = read(
  "src/arrange/ArrangementPlaybackStore.ts",
);
const css = read("src/playground.css");
const e2e = read("e2e/playground.spec.ts");

const required = [
  [adapter, "export type PlaygroundSongDraftId", "P14 draft identity contract is missing."],
  [adapter, "export const PLAYGROUND_SONG_DRAFTS", "P14 draft catalog is missing."],
  [adapter, "createPlaygroundSongDraft(", "P14 canonical draft builder is missing."],
  [adapter, "const base = createPlaygroundSong(seed);", "P14 must extend the canonical P5 A/B adapter."],
  [playground, 'aria-label="Song draft options"', "P14 song draft chooser is missing."],
  [playground, '"Build " +\n                      draft.label +\n                      " song draft"', "P14 accessible draft actions are missing."],
  [playground, '"Before song draft · " +', "P14 recovery-before-draft behavior is missing."],
  [playground, "installPlaygroundSong(created);", "P14 draft installation must use the canonical Playground song state."],
  [playground, "await arrangementPlaybackStore.start();", "P14 one-tap drafts must audition immediately."],
  [playground, "await audioTransport.unlockAudio();", "P14 must claim Web Audio activation before async recovery work."],
  [playground, "buildPlaygroundSong", "P14 must preserve the original P5 basic A/B builder."],
  [store, "restoreProjectState(", "P14 must remain backed by ArrangementStore."],
  [playback, "async start(", "P14 must remain backed by ArrangementPlaybackStore."],
  [css, ".playground-song__draft-actions", "P14 draft chooser styling is missing."],
  [e2e, "Playground P14 drafts a structured editable song from A B in one tap", "P14 browser certification is missing."],
];

for (const [source, token, message] of required) {
  if (!source.includes(token)) {
    failures.push(message);
  }
}

for (const id of ["short", "standard", "extended"]) {
  if (!adapter.includes('id: "' + id + '"')) {
    failures.push(
      "P14 draft catalog is missing " + id + ".",
    );
  }
}

const draftBuilderStart = adapter.indexOf(
  "export function createPlaygroundSongDraft(",
);
const draftBuilderEnd = adapter.indexOf(
  "\n\nexport function createPlaygroundSong(",
  draftBuilderStart,
);
const draftBuilder =
  draftBuilderStart >= 0 &&
  draftBuilderEnd > draftBuilderStart
    ? adapter.slice(
        draftBuilderStart,
        draftBuilderEnd,
      )
    : "";

for (const forbidden of [
  "Math.random(",
  "new ArrangementStore",
  "new ArrangementPlaybackStore",
]) {
  if (draftBuilder.includes(forbidden)) {
    failures.push(
      "P14 must remain deterministic and canonical; forbidden implementation: " +
        forbidden,
    );
  }
}

const handlerStart = playground.indexOf(
  "const buildPlaygroundSongDraft = async",
);
const handlerEnd = playground.indexOf(
  "\n\n  const addSongSection =",
  handlerStart,
);
const handler =
  handlerStart >= 0 &&
  handlerEnd > handlerStart
    ? playground.slice(handlerStart, handlerEnd)
    : "";

const unlockIndex = handler.indexOf(
  "await audioTransport.unlockAudio();",
);
const checkpointIndex = handler.indexOf(
  "projectStore.createVersion(",
);
const installIndex = handler.indexOf(
  "installPlaygroundSong(created);",
);
const playIndex = handler.indexOf(
  "await arrangementPlaybackStore.start();",
);
if (
  unlockIndex < 0 ||
  checkpointIndex < 0 ||
  unlockIndex > checkpointIndex
) {
  failures.push(
    "P14 must request audio activation before awaiting the recovery checkpoint.",
  );
}
if (
  checkpointIndex < 0 ||
  installIndex < 0 ||
  checkpointIndex > installIndex
) {
  failures.push(
    "P14 must create the recovery checkpoint before replacing arrangement state.",
  );
}
if (
  installIndex < 0 ||
  playIndex < 0 ||
  installIndex > playIndex
) {
  failures.push(
    "P14 must install the canonical arrangement before starting audition playback.",
  );
}

const catalogStart = adapter.indexOf(
  "export const PLAYGROUND_SONG_DRAFTS",
);
const catalogEnd = adapter.indexOf(
  "\n\nexport function cloneForPlaygroundSong",
  catalogStart,
);
const catalog =
  catalogStart >= 0 &&
  catalogEnd > catalogStart
    ? adapter.slice(catalogStart, catalogEnd)
    : "";

const expectedSections = {
  short: 4,
  standard: 6,
  extended: 8,
};
for (const [id, expected] of Object.entries(expectedSections)) {
  const blockStart = catalog.indexOf('id: "' + id + '"');
  const nextStart = [
    "short",
    "standard",
    "extended",
  ]
    .map((candidate) =>
      candidate === id
        ? -1
        : catalog.indexOf(
            'id: "' + candidate + '"',
            blockStart + 1,
          ),
    )
    .filter((value) => value > blockStart)
    .sort((a, b) => a - b)[0];
  const block = catalog.slice(
    blockStart,
    nextStart ?? catalog.length,
  );
  const sectionCount =
    (block.match(/\{ bank: "[AB]", role:/g) ?? [])
      .length;
  if (sectionCount !== expected) {
    failures.push(
      "P14 " +
        id +
        " draft must keep " +
        expected +
        " semantic sections.",
    );
  }
}

for (const forbidden of [
  "playground-song-draft-editor",
  'type="number"',
  "customDraft",
]) {
  if (playground.includes(forbidden)) {
    failures.push(
      "P14 Playground must stay one-tap and simple; leaked advanced draft control: " +
        forbidden,
    );
  }
}

if (failures.length > 0) {
  throw new Error(
    "P14 song draft contract failed:\n- " +
      failures.join("\n- "),
  );
}

console.log(
  "P14 song draft contracts verified: deterministic Short/Standard/Extended A/B structures, recovery-before-replace, canonical P5 ArrangementStore reuse, immediate audition, editable sections, responsive chooser, and no second arrangement engine.",
);
