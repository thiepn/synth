# Phase 35 — Accessibility, Mobile Ergonomics & Interaction Hardening

Status: implemented.

## Purpose

By Phase 34, Synth had accumulated deep desktop, touch and performance workflows across seven modes.

Phase 35 does not add another music engine.

It hardens the ways users reach and operate the existing systems:

- keyboard
- touch
- coarse pointer
- assistive technology
- high contrast / forced colors
- reduced motion
- mobile safe areas
- narrow screens
- installed-PWA browser chrome differences

The central rule is:

> Pointer gestures can remain fast accelerators, but every essential musical edit must have a keyboard-accessible equivalent.

## Global accessibility bridge

Synth now observes:

- prefers-reduced-motion
- forced-colors
- prefers-contrast: more
- pointer: coarse
- current keyboard vs pointer input modality

Mode changes are announced through a visually hidden polite status region.

This bridge is informational only; musical timing remains outside React.

## Skip navigation

A keyboard-visible:

~~~text
Skip to workspace
~~~

link now jumps directly to the current main Synth surface.

The workspace receives a stable target ID and programmatic focus target.

## Focus visibility

Focus rings are strengthened to 2 px for:

- buttons
- inputs
- selects
- textareas
- custom tabbable controls

Pointer interaction suppresses incidental non-focus-visible outlines while keyboard focus remains explicit.

## Seven-mode navigation fix

The bottom mode rail previously still had layout assumptions from the six-mode era.

Synth now consistently treats the rail as seven modes:

1. CREATE
2. SEQUENCE
3. SOUND
4. ARRANGE
5. LIVE
6. MIX
7. EXPORT

Desktop/tablet/mobile grid definitions are aligned.

On narrow screens the rail remains bounded and horizontally safe rather than collapsing or clipping one mode.

## Roving keyboard mode navigation

The mode rail now behaves as one keyboard navigation set.

Only the active mode is in the normal Tab order.

Supported keys:

- Arrow Left / Up → previous mode
- Arrow Right / Down → next mode
- Home → first mode
- End → last mode

Changing mode also announces the new mode through the accessibility live region.

## Mobile header repair

The accumulated project/PWA/transport features had outgrown the original mobile two-column header.

The mobile utility rail now uses three bounded columns:

- Synth / PWA
- current project
- transport

Project names truncate instead of forcing a second row.

Play and Stop remain visible on mobile.

Large desktop transport controls are hidden rather than removing transport interaction entirely.

## Safe areas

Installed/mobile layouts now respect:

- env(safe-area-inset-top)
- env(safe-area-inset-right)
- env(safe-area-inset-bottom)
- env(safe-area-inset-left)

Safe areas are applied to the sticky utility rail, bottom mode rail and workspace horizontal padding.

## User zoom restored

Phase 34's native-feel viewport temporarily disabled browser zoom.

Phase 35 removes:

- maximum-scale=1
- user-scalable=no

The viewport is now:

~~~text
width=device-width, initial-scale=1.0, viewport-fit=cover
~~~

Pinch zoom remains available.

Mobile inputs use a 16 px font floor to avoid unwanted iOS form-focus zoom while preserving user-controlled page zoom.

## Coarse-pointer targets

For pointer: coarse environments:

- primary buttons receive at least 44 px hit height
- form controls receive at least 44 px interaction height
- mode buttons stay at least 56 px tall
- lane/reactor lock controls receive larger hit areas
- range controls receive larger vertical touch regions

This is an interaction target change, not a visual-size requirement.

## Reduced motion

The existing reduced-motion contract remains global:

- animations collapse to near-zero duration
- animation iteration becomes one
- transitions collapse
- smooth scrolling is disabled

Sequencer hit transitions are also explicitly disabled under reduced motion.

## Increased contrast

prefers-contrast: more increases:

- secondary text contrast
- hairline contrast
- control border contrast

Glow-only state distinctions are reduced so status does not depend on subtle luminous effects.

## Forced colors

When the OS/browser forces colors:

- status lamps use system Highlight
- active controls keep explicit outlines
- Rhythm Glyph/waveform strokes use system-visible colors
- state remains understandable without the normal phosphor/heat/ice palette

## LIVE momentary actions

DROP / BREAK / BUILD / REPEAT / STUTTER previously optimized for pointer hold.

They now support:

### Pointer
Pointer down presses; pointer up/cancel releases.

### Keyboard
Space/Enter keydown presses; keyup releases.

Blur releases any held action.

Synthetic assistive-technology click activation receives a short bounded pulse.

Pointer/keyboard interaction guards prevent duplicate click activation.

## LIVE XY control

The Chaos × Energy performance surface no longer falsely presents itself as one scalar slider.

It is exposed as a keyboard-operable group.

Controls:

- Arrow Left / Right → Chaos
- Arrow Down / Up → Energy
- Shift + Arrow → larger movement

Pointer/touch XY behavior remains unchanged.

## Automation editing

The Phase 24 automation canvas remains available for pointer drawing.

A keyboard-equivalent authoring path now provides:

- Position range
- Value range
- current curve selection
- Write Point button

Existing automation points are native buttons and remain individually removable.

The canvas no longer uses role=application; it is described as a pointer canvas with the keyboard alternative named explicitly.

## Sample Lab pad activation

Sample Lab pads preserve pointer-down low-latency audition.

They now also support normal keyboard/assistive-tech button activation without double-triggering pointer clicks.

Each pad exposes:

- pad number
- slice label
- selected state
- audition action

through accessible button semantics.

## Sample Lab manual cuts

Manual waveform cuts remain pointer-clickable.

Keyboard users now receive:

- Cut Position range
- Toggle Cut button
- Clear Cuts button

The waveform description explicitly points to the keyboard alternative.

## Sequencer matrix

A 64-step × 8-lane Pattern previously produced up to 512 Tab stops.

The Rhythm Matrix now uses roving focus:

- one selected matrix cell is tabbable
- Arrow Left / Right moves between steps
- Arrow Up / Down moves between lanes
- Home / End moves to first/last step in the lane
- Space/Enter uses native button activation

Selection follows keyboard focus.

### Pattern Paint

Keyboard activation also works in Paint mode.

A keyboard-painted cell creates the same deterministic one-gesture/one-Undo transaction as pointer painting.

Pointer drag painting remains unchanged.

## ARRANGE reordering

Drag-and-drop remains a fast desktop accelerator.

It is not the only reorder path.

The timeline now tells assistive technology that selected sections can be reordered from Section Edit using:

- Move Left
- Move Right

Section blocks expose:

- label
- ordinal
- selected state
- availability of edit/reorder controls

## Header popovers

Project Library and PWA install-help popovers now close with Escape.

Escape returns focus to the opening trigger instead of leaving focus inside removed DOM.

Outside pointer-click dismissal remains available.

## Mobile input layout

Additional global rules prevent common narrow-screen regressions:

- horizontal body overflow is suppressed
- intentional sequencer horizontal scrolling stays contained
- Pattern Paint reserves touch movement only while Paint mode is active
- mobile mode rail hides scrollbars without removing scrollability
- project name truncates
- tiny landscape workspaces reduce vertical padding
- safe-area padding prevents launcher/home-indicator overlap

## Pages workflow resilience

Phase 34 correctly produced an installable PWA build, but GitHub Pages deployment failed when the repository had not yet enabled Pages.

Phase 35 changes the deployment workflow:

1. production build always runs
2. workflow checks the repository Pages endpoint
3. if Pages is enabled, configure/upload/deploy proceeds
4. if Pages is not enabled, deployment steps are skipped
5. the workflow emits a notice with the one-time setup step

One-time repository setup remains:

~~~text
Settings → Pages → Source → GitHub Actions
~~~

A missing Pages setting no longer turns an otherwise valid production build red.

## Interaction regression contract

Production builds now run:

~~~text
npm run check:interaction
~~~

The contract prevents accidental regression of key accessibility/mobile guarantees, including:

- no user-scalable=no
- no maximum-scale=1 zoom lock
- skip link present
- accessibility bridge present
- roving mode navigation present
- seven-mode mobile layout present
- forced-colors support present
- coarse-pointer support present
- sequencer keyboard matrix navigation present
- automation keyboard authoring present
- Sample Lab keyboard manual cuts present
- LIVE XY keyboard operation present

This is a targeted regression guard, not a substitute for later end-to-end accessibility testing.

## Phase boundary

Phase 35 hardens interaction semantics and mobile ergonomics.

It deliberately does not yet implement:

- Web Worker offloading
- render/analysis performance budgets
- long-session memory soak
- battery/visibility throttling beyond existing transport behavior
- giant-project stress certification
- exhaustive screen-reader/browser device matrix certification
- final release-candidate fault injection

Those belong to the next performance/release-hardening layers.

## Safety invariants

- user zoom remains available
- every essential pointer-only musical authoring workflow addressed in this phase has a keyboard alternative
- mobile transport never disappears completely
- all seven modes remain reachable on narrow screens
- reduced-motion users do not receive decorative motion loops
- high-contrast/forced-color users are not dependent on glow/color alone
- drag-and-drop is not the sole ARRANGE reorder path
- popover Escape dismissal returns focus
- paint mode preserves one-gesture/one-Undo semantics
- PWA deploy misconfiguration no longer causes a false build failure
