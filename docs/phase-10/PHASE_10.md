# Phase 10 — Generation History & Evolution Tree

## Status

Implemented.

## Objective

Phase 10 turns Synth's accumulated lineage metadata into a visible, navigable branching creative history.

This is deliberately separate from ordinary editor Undo/Redo.

```text
editor history
= reverse/reapply recent edits

Evolution Tree
= preserve creative alternatives and branch from them
```

## Creative lineage model

The Evolution Tree stores immutable Pattern snapshots.

Each node contains:

- stable session node ID
- parent node ID
- operation type
- operation label
- editable title
- favorite state
- chronological ordinal
- complete Pattern snapshot
- Rhythm Glyph signature

Node Pattern snapshots are deep-cloned when stored and when exposed to consumers so later sequencer edits cannot mutate historical nodes.

## Root

Every session begins with:

```text
#00 / ROOT / Foundation
```

The root cannot be deleted.

It is the initial source for the first generated branch.

## Automatically recorded operations

Accepted creative operations create nodes:

- Generate
- Reroll
- lane reroll
- semantic Mutation
- Groove Field mutation

Rejected generations/mutations never enter the tree.

## Manual edit checkpoints

The tree intentionally does not create a node for every small editor action.

Instead, when a manually edited Pattern becomes the source of a new Generate/Reroll/Mutation operation:

```text
active history node
      ↓
manual sequencer / feel edits
      ↓
next creative operation requested
      ↓
EDIT checkpoint created once
      ↓
new creative child
```

This preserves true branch ancestry without flooding the tree with every velocity drag or lock toggle.

Monitoring-only state such as mute/solo is ignored when determining whether a new musical checkpoint is required.

## Branching

There are two branching workflows.

### Restore then create

```text
A
└── B
    └── C

Restore B
Generate / Reroll / Mutate

A
└── B
    ├── C
    └── D
```

Restoring an old node makes it the active lineage source.

The next creative operation becomes a child of that node.

### Explicit BRANCH

BRANCH immediately creates a visible branch-marker node containing the selected Pattern snapshot.

The branch marker becomes active and is restored into the editor.

Subsequent creative operations descend from that marker.

## History-node provenance

Before a child Pattern enters the sequencer, the history store stamps:

```ts
pattern.provenance.sourceHistoryNodeId
```

with the actual parent Evolution node.

Existing source Pattern provenance such as `sourceEntityId` and mutation IDs remains intact.

This produces both:

- Pattern-level generation lineage
- UI-level branching lineage

## Active vs selected node

The tree distinguishes:

- **active node** — current source for future creative operations
- **selected node** — node currently inspected in the tree

Selecting a node does not restore it.

RESTORE or BRANCH changes the active lineage source.

## Rhythm Glyphs

Every node displays the deterministic Rhythm Glyph for its stored Pattern.

The inspector also renders a larger Glyph and RG signature.

This allows visual branch comparison without opening every Pattern in SEQUENCE.

## Audition

AUDITION plays one historical Pattern loop without restoring it.

The audition path:

- uses the current BPM
- uses the same Drum Engine voices
- honors stored velocity
- honors stored Swing
- honors stored event microtiming
- does not replace the current sequencer Pattern

Only one history audition is active at a time.

History audition is disabled while the main transport is running so two beats cannot overlap.

If the user starts the main transport while an audition tail is still active, the Drum Engine cancels the history-audition voices.

Direct drum-pad audition remains independent.

## Restore

RESTORE loads the selected historical Pattern into the sequencer.

Creative state restored includes:

- events
- groove
- provenance
- generation locks

Current monitoring state is preserved:

- mute
- solo

This keeps Restore musically faithful without unexpectedly changing what the user is monitoring.

Restore itself remains undoable through normal Sequencer Undo.

It does not create another Evolution node.

## Favorites

Any node can be favorited.

Favorites are visually marked in the tree and counted in the Evolution panel header.

The root starts favorited as the canonical baseline.

## Rename

Node titles can be renamed inline.

Renaming changes only tree metadata.

It does not mutate the stored Pattern or its musical identity.

## Delete branch

CUT deletes:

- the selected node
- every descendant of that node

The root cannot be cut.

If the active node is inside the deleted branch:

1. the history store falls back to the deleted branch's surviving parent
2. the fallback Pattern is restored into the sequencer
3. selected node follows the new active node

Deleting an inactive branch does not change the current Pattern.

## Tree UI

The Evolution Tree uses nested signal strips rather than generic history cards.

Each node exposes:

- ordinal
- compact Rhythm Glyph
- operation
- RG signature
- title
- style
- mutation/reroll descriptor
- AUDITION
- RESTORE
- BRANCH
- FAVORITE
- RENAME
- CUT

Branch connectors are spatially visible.

A side inspector shows:

- selected node
- style
- Glyph
- direct child count
- mutation
- source-history node

## Editor Undo remains separate

Phase 10 does not replace Sequencer Undo/Redo.

Examples:

```text
velocity change
→ Undo

Generate
→ Evolution node

Restore old branch
→ Undo can return editor Pattern
→ Evolution source remains explicit until another history action changes it
```

For intentional creative branching, use RESTORE/BRANCH rather than relying on Undo navigation.

## Session persistence boundary

The Evolution Tree currently lives in the same session-local architecture as Synth's current Pattern state.

Reload persistence has not yet been implemented for the project generally.

Therefore Phase 10 does not pretend lineage survives browser reloads yet.

The snapshot model is plain serializable data and is designed to plug into the later project persistence / Archive system.

## Milestone A

Phases 0–10 now provide the complete Synth Core loop structurally:

```text
Generate
→ Lock
→ Reroll
→ Groove
→ Mutate
→ Branch
→ Restore
→ Keep exploring
```

The roadmap gate still applies:

Before relying on later feature breadth to carry the product, the actual beat quality and interaction loop should be human-listened and judged compelling.

That musical-quality gate is not replaced by the existence of the Evolution Tree.

## Phase boundary

Phase 10 does not yet add:

- persistent history across reloads
- Archive implementation
- A/B audio crossfade comparison
- merge-two-branches
- cloud history
- history search
- automatic beat-family generation
- history export/import

Those belong to later phases.

## Acceptance

- [x] creative history is separate from Undo/Redo
- [x] immutable Pattern snapshots are stored
- [x] Generate creates a history node
- [x] Reroll creates a history node
- [x] semantic Mutation creates a history node
- [x] Groove Field mutation creates a history node
- [x] manual edits become checkpoints only when they become branch sources
- [x] child Pattern provenance stores sourceHistoryNodeId
- [x] active and selected nodes are distinct
- [x] restore creates real branching ancestry
- [x] explicit BRANCH markers are supported
- [x] every node renders its Rhythm Glyph
- [x] history Patterns can be auditioned without restoration
- [x] audition cannot overlap the running main transport
- [x] Restore preserves current mute/solo monitoring
- [x] favorites are supported
- [x] inline rename is supported
- [x] branch deletion removes descendants
- [x] deleting an active branch falls back safely
- [x] root cannot be deleted
- [x] tree is responsive and locally scrollable
- [x] persistence limitations are explicit

## Next phase

**Phase 11 — Drum Synthesis Engine V2**

Phase 11 should deepen the sound engine itself: richer kick/snare/hat/percussion synthesis, more expressive material controls, better voice character, and a stronger foundation for generated kits.
