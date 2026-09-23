# Phase 30 — Resampling, Bounce, Freeze & Internal Audio Workflow

Status: implemented.

## What shipped

### One render foundation
Phase 30 reuses Phase 28's immutable render snapshots and OfflineAudioContext renderer.

It does not create a second bounce engine.

The renderer now also supports an internal pre-master mode that can bypass the final safety limiter when the resulting audio will re-enter Synth internally.

### Render Copy
Render Copy creates a new content-addressed audio asset while leaving all editable source state unchanged.

Supported sources include:
- current Pattern
- full ARRANGE timeline
- one Section
- custom ARRANGE bar selection
- one drum track/stem
- pre-master mix
- final master
- FX/tail render

A Render Copy can automatically open in Sample Lab.

### Internal audio artifacts
Recent bounces are tracked as lightweight session artifacts with:
- asset ID
- kind
- label
- duration
- peak/RMS analysis
- optional source voice
- master/pre-master status

Artifacts are normal SampleAssetStore assets and can therefore be reused by Sample Lab and drum sample voices.

### Freeze
Freeze is a reversible CPU optimization.

Flow:

~~~text
canonical Pattern + sound + mix + modulation
        ↓
pre-master offline render
        ↓
in-memory frozen AudioBuffer
        ↓
DrumEngine schedules one clip per Pattern cycle
        ↓
current mastering remains live
~~~

Freeze does not mutate:
- Pattern
- DrumSoundStore
- mixer
- modulation
- SampleAssetStore

Normal hit/synth scheduling is suppressed while a valid freeze is active.

The frozen buffer enters at the pre-master boundary, so current committed mastering still applies once.

### Freeze invalidation
A Pattern freeze is invalidated when source truth changes:
- Pattern edit/runtime preview
- drum sound/source edit
- mixer edit/preview
- modulation or automation edit
- engine master/macro edit
- BPM change
- meter change

This prevents stale frozen audio from silently disagreeing with visible state.

### Unfreeze
UNFREEZE simply removes the cache and immediately returns playback to the canonical editable source.

No source reconstruction is necessary because Freeze never replaced source truth.

### Flatten
Flatten intentionally simplifies the Pattern to rendered audio.

Flow:

~~~text
editable Pattern
      ↓
pre-master exact-length render
      ↓
new 24-bit local audio asset
      ↓
canonical Pattern becomes one rendered-clip event
      ↓
rendered clip bypasses already-baked per-track/mix/engine processing
      ↓
current mastering remains live
~~~

The original Pattern and the replaced percussion source state are retained as a recovery point.

### Replace With Audio
Replace uses the same safe atomic audio-clip architecture as Flatten but is labeled explicitly as an intentional audio replacement.

A recovery point is still retained rather than immediately destroying source data.

### Rendered clip contract
SampleSoundSpec now optionally supports:

renderedClip: true

A rendered clip:
- bypasses per-voice mixer processing
- bypasses already-baked engine/mix stages
- enters at the pre-master boundary
- receives current mastering exactly once
- behaves the same in live DrumEngine and offline Phase 28 rendering

This prevents double processing after Flatten/Replace.

### Revert to editable source
Flatten/Replace stores:
- original Pattern snapshot
- original percussion source state
- rendered asset ID
- operation mode
- creation time

REVERT TO EDITABLE SOURCE atomically restores the editable Pattern and source state.

The rendered asset remains available as an internal audio artifact.

### Track bounce
Any of Synth's eight canonical drum voices can be rendered as processed audio and opened in Sample Lab.

### Section / Scene bounce
ARRANGE Sections can be rendered directly as new audio assets.

### Selection consolidation
A custom ARRANGE bar range can be rendered with no tail as a consolidated audio asset.

### Master bounce
The selected range can be rendered through committed mastering and returned into Synth as an audio asset.

### FX + tail bounce
Auto/fixed tail rendering captures room/sample decay for creative resampling.

## Architecture

~~~text
Phase 28 RenderSnapshot
       ↓
renderSnapshot()
       ↓
floating-point PCM
       ├── Render Copy → WAV bytes → SampleAssetStore
       ├── Freeze → in-memory pre-master AudioBuffer
       └── Flatten/Replace → local asset + renderedClip Pattern
~~~

The critical distinction is:

~~~text
RENDER COPY
source remains authoritative
new asset is additional material

FREEZE
source remains authoritative
rendered buffer is disposable cache

FLATTEN
rendered audio becomes authoritative Pattern playback
editable source retained as recovery

REPLACE
explicit rendered-audio replacement
recovery retained for safety
~~~

## Atomicity and recovery

Freeze activation occurs only after the complete render succeeds.

Flatten/Replace do not modify source state until:
1. offline render succeeds,
2. WAV encoding succeeds,
3. asset import succeeds,
4. asset decode succeeds.

Only then are DrumSoundStore + SequencerStore changed under one guarded mutation window.

A failure before that leaves the source untouched.

## Safety invariants

- no external WAV download/re-import is required for internal resampling
- Freeze never mutates canonical source
- stale Freeze caches invalidate automatically
- Freeze uses exact Pattern length with no tail
- mastering is not baked into Freeze/Flatten unless explicitly requested by Render Copy
- rendered clips bypass already-baked mixer/engine stages
- Flatten/Replace retain an explicit recovery snapshot
- source edits cannot silently keep a stale Freeze active
- internal assets remain content-addressed/deduplicated
- all rendered-audio operations reuse Phase 28 rather than duplicating render logic
