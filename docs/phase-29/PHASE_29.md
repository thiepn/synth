# Phase 29 — Sample Lab, Chopping & Creative Sampling

Status: implemented.

## What shipped

### Immutable source audio
Sample Lab never rewrites imported source bytes.

Edits are represented as metadata over a source asset until the user explicitly chooses:

RENDER NEW SAMPLE

Only that action creates a new content-addressed local audio asset.

### High-resolution analysis
When a sample is loaded, Sample Lab derives:
- high-resolution waveform data
- peak
- RMS
- duration
- transient candidates

Transient analysis uses deterministic windowed energy-flux detection with local-max and minimum-spacing filtering.

### Region editing
The active Sample Lab region supports:
- Trim In
- Trim Out
- Fade In
- Fade Out
- Gain
- Normalize to approximately -1 dB peak
- Reverse
- Pitch ±24 semitones
- independent Playback Rate 0.25×–4×
- loop audition
- zoom / pan waveform inspection

Normalize is non-destructive and stores only a calculated gain offset.

Async normalize results are rejected if the user changes the asset or region while analysis is in progress.

### Canonical sample playback contract
SampleSoundSpec now optionally supports:
- playbackRate
- fadeInSeconds
- fadeOutSeconds

The same sample spec is honored by:
- live DrumEngine playback
- Sample Lab audition
- Phase 28 OfflineAudioContext rendering

This prevents preview/export mismatch.

### Slicing
Four slicing modes are available.

#### Transient
Uses detected transient positions. The user controls maximum slice count.

#### Equal
Splits the active region into 1–32 equal slices.

#### Beat
Splits from BPM + beats-per-slice.

Supported values include:
- quarter beat
- half beat
- 1 beat
- 2 beats
- 4 beats

#### Manual
Clicking the waveform toggles cut points.

Manual cuts remain editable and bounded inside the active region.

### Slice workflow
Every slice is:
- selectable
- individually auditionable
- represented as a normal SampleSoundSpec
- compatible with the current region's gain/pitch/rate/reverse/fades
- assignable to the selected drum voice

### Pad banks
Slices are exposed through eight-pad banks.

Controls:
- Previous Bank
- Next Bank
- Keys 1–8
- pointer/touch triggering
- selected-slice tracking

### Bank → Kit
BANK → KIT maps the current eight slices onto Synth's eight canonical drum voices.

It does not create a second sampler/kit format.

The assigned sounds become ordinary sample-backed drum voices and continue working with:
- Sequencer
- ARRANGE
- LIVE
- mixer
- mastering
- offline render/export

### Chop take recording
Sample Lab can capture live pad performance.

A chop event stores:
- stable slice ID
- pad index
- relative time
- velocity

Stable slice identity prevents a take from silently changing if the user changes pad bank before committing.

Session take history is bounded.

### Take → Pattern
A captured chop take can be quantized to the current 16th-note sequencer grid and committed as an ordinary Pattern.

The commit:
- assigns the used slice specs to canonical drum voices
- replaces the corresponding mapped lane events with the recorded chop performance
- preserves untouched lanes
- writes one Sequencer Undo step
- creates one Generation History node using the sampleLab operation
- remains editable using every normal Pattern tool afterward

### Explicit render to new sample
The selected slice—or the region when no slice is selected—can be rendered to a new local WAV-backed sample.

Rendering applies:
- trim
- reverse
- pitch
- rate
- gain
- normalize offset
- fade in/out

The rendered derivative receives a new content hash and re-enters the normal SampleAssetStore lifecycle.

The original asset remains available and unchanged.

### Asset ingestion
Imported files and rendered derivatives now share one SampleAssetStore.importBytes() path.

That means both use the same:
- SHA-256 content identity
- deduplication
- decode lifecycle
- waveform metadata
- local asset references

## Architecture

~~~text
SampleAssetStore
  immutable source bytes
        ↓
SampleLabStore
  region metadata
  slice metadata
  chop takes
        ↓
SampleSoundSpec
  trim / gain / pitch / rate / fades / reverse
        ├── SampleLabPlayer
        ├── DrumSoundStore
        ├── DrumEngine
        └── Offline Renderer
~~~

Explicit rendering is separate:

~~~text
SampleSoundSpec
      ↓
OfflineAudioContext
      ↓
24-bit WAV
      ↓
SampleAssetStore.importBytes()
      ↓
new immutable asset
~~~

## Safety invariants
- source bytes are never edited in place
- all range values are clamped to source duration
- fade lengths are bounded to the selected region/slice
- playable gain is bounded
- normalization cannot apply stale async results
- slice count is bounded to 32
- pad banks are bounded to eight simultaneous canonical voices
- recorded chop events reference stable slice IDs
- explicit render is required to create derived audio
- loop preview is audition-only and never creates an infinite drum voice
- Sample Lab Pattern commits are ordinary Pattern state
- no second sequencer or second kit model is introduced
