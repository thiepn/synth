# P20 — Full Adversarial Product Audit

## Purpose

P20 audits Synth as a complete product rather than as isolated features. The release target is the real user path:

**Open Synth → make a beat → edit it → turn it into a song → perform/tweak it → save/recover it → export it.**

No new creative subsystem is introduced in this phase.

## Adversarial findings

### 1. Project-switch UI state could leak across projects

Before P20, project changes cleared some transient performance state but did not synchronously clear melodic-lane focus, selected melodic note, step context, open Finish/render state, or song drag state.

**Risk:** a user could enter a new/opened project while UI state still referred to the previous project.

**P20 fix:** prepareProjectSwitch now clears these transient states and cancels stale rendering before the project changes.

### 2. Restored drum selection and mixer focus could diverge

Per-project Playground session state remembers the selected drum voice. The mixer target was normally synchronized by a selectedVoice effect. If consecutive projects restored the same drum voice while mixer focus had moved to a melodic lane, the unchanged voice state could leave the mixer on the wrong lane.

**P20 fix:** project hydration now restores both selected drum voice and its canonical mixer lane explicitly.

### 3. Recording boundaries were inconsistent

P20 hardens the cross-feature boundary:

- New / Duplicate are visibly disabled during recording.
- Recovery Snapshot is disabled during recording and guarded in its action.
- Leaving Playground for Studio settles the current recording first.
- Opening Finish settles recording before export controls become active.
- Armed count-in is cancelled cleanly when navigation interrupts it.

## Permanent adversarial browser coverage

e2e/adversarial.spec.ts covers three release-critical workflows.

### Project boundary abuse

Rename/save a source project, create conflicting drum/melodic focus, leave transient UI open, create a new project, then reopen the source and verify stale UI is gone and selected voice/mixer focus are synchronized.

### Recording boundary abuse

Record into an empty second bar, verify project-destructive controls are locked during the take, navigate directly to Studio, return to Playground, and verify the take is committed and recording is idle.

### Complete restored production workflow

Apply a starter, expand to multiple bars, add melodic bass, build a six-section song, add Motion, save/reload, verify all musical state survived, then export the restored full song as WAV and verify the render is unclipped.

## Release gates

P20 adds:

- npm run check:adversarial
- npm run qa:adversarial
- P20 adversarial product QA in CI

The static contract is part of npm run build. The browser suite runs after Playground release QA and before the existing full production browser matrix and soak.

## Exit criteria

P20 is complete only when the unchanged candidate passes production build/static contracts, bundle budgets, Playground browser QA, P20 adversarial QA, production browser QA, and release-candidate soak.

Any failure discovered by P20 is fixed at the owning product boundary rather than hidden by weakening the test.