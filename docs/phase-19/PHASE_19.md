# Phase 19 — Sample Import & Hybrid Voice Engine

## Status

Implemented.

## Objective

Phase 19 makes local audio samples first-class sound sources while preserving Synth's semantic Kit architecture.

~~~text
local audio file
      ↓
content-addressed asset
      ↓
decode / waveform cache
      ↓
SampleSoundSpec
      ↓
SYNTH / SAMPLE / HYBRID
      ↓
Kit Slot → Sound → Drum Engine
~~~

Pattern, Beat Family and ARRANGE continue targeting semantic Kit slots and remain independent of sample implementation details.

## Deterministic asset identity

Imported audio is identified from its bytes rather than its filename.

~~~text
File bytes
   ↓
SHA-256
   ↓
audio-<first 24 hex chars>
~~~

The complete digest is stored in AssetReference.contentHash. Re-importing identical bytes resolves to the same session asset even under another filename.

## Local asset store

Implemented:

~~~text
src/audio/SampleAssetStore.ts
src/audio/useSampleAssets.ts
~~~

The store owns original ArrayBuffer bytes, AssetReference metadata, decode state, decoded AudioBuffer caches, reverse-buffer caches and a normalized waveform summary.

Phase 19 limits one imported sample file to 64 MB.

## Browser decoding

Synth delegates codec decoding to Web Audio decodeAudioData. The picker accepts common audio types such as WAV, MP3, OGG, M4A, AAC, FLAC and WebM audio, but actual codec support remains browser/platform dependent.

A file that cannot be decoded stays in an explicit error state rather than becoming an invalid Sound.

## Asset metadata

After decoding, AssetReference can contain byte length, content hash, duration, sample rate, channel count, MIME type and original filename. AudioBuffer objects never enter serialized domain state.

## Waveform

Decoding creates a normalized 96-bin peak waveform. SOUND renders it together with Trim In and Trim Out markers without repeatedly scanning PCM data during React rendering.

## Source modes

Each semantic drum voice now has one runtime source mode:

~~~text
SYNTH
SAMPLE
HYBRID
~~~

A sample must be assigned before SAMPLE or HYBRID can be selected.

### SYNTH

Uses the existing V2 DrumMaterialSpec. An attached sample may remain in the background for later switching.

### SAMPLE

Uses only the assigned SampleSoundSpec. The V2 synth material remains intact underneath.

### HYBRID

Combines the V2 synthesized voice with the assigned sample layer.

HybridSoundSpec now stores an explicit synthGainDb so the synth layer level is serialized truthfully.

Default Hybrid synth level is -3 dB.

## Sample editing

SampleSoundSpec is active and stores asset ID, Trim In, Trim Out, gain, pitch and reverse state.

Trim is non-destructive; imported bytes and the decoded source buffer are never rewritten.

Sample gain range is -36 dB to +12 dB.

Pitch range is -24 to +24 semitones and uses AudioBufferSourceNode playback rate.

## Reverse semantics

Reverse applies to the selected trim region. A selected original region such as 0.100s–0.350s is the region heard backward; Synth does not accidentally substitute the mirrored region from the other end of the file.

Reverse buffers are cached per AudioContext.

## True Hybrid gain

Hybrid synth gain is applied as a real amplitude multiplier inside all seven V2 synthesis recipes. It is not approximated through velocity, so the dB control remains meaningful.

## Shared drum bus

Sample audio feeds the established shared drum path and therefore still receives current Grit/drive, Space convolution, compression, master gain and limiting.

## Sample envelope

Sample playback uses a short click-safe gain envelope and pitch-corrected audible duration.

## Voice lifecycle

Sample BufferSourceNodes use the same ActiveVoice infrastructure as synthesized voices.

They therefore participate in polyphony pruning, voice stealing, transport epoch cancellation, audition cancellation, transport stop and open-hat choke.

Hybrid playback registers its synth and sample layers separately while preserving the same semantic voice identity.

## Open-hat choke

Sample and Hybrid Open Hat layers register as openHat. Closed Hat therefore chokes synthesized, sampled and Hybrid Open Hat material through the existing choke system.

## Decode readiness

USE/PREP performs decoding from an explicit user action. If a scheduled sample reaches playback without a cached decode, that sample layer is skipped for that hit, asynchronous decoding begins, readiness invalidates future scheduled events, and following hits use the decoded sample. A Hybrid voice still retains its synth layer while decoding completes.

## Playback coverage

The configured source route is used by direct drum-pad audition, SAMPLE/HYBRID audition, Pattern/history audition, SEQUENCE playback and ARRANGE playback.

No sample-specific rhythm engine exists.

## Kit Generator compatibility

Sample assignment is independent from V2 material generation.

When Generate Kit or Kit Mutation changes V2 material, per-voice sample assignment and source mode survive. Active Kit Sound objects are rebuilt to the correct SynthSoundSpec, SampleSoundSpec or HybridSoundSpec.

This means a Hybrid voice receives newly generated/mutated synth material underneath its existing sample layer rather than losing the sample every time the Kit evolves.

A Sample-only voice also keeps its hidden V2 synth material ready for later switching back to Hybrid or Synth.

## Active Kit serialization

When a generated Kit exists, manual sample/source edits update its actual Sound object so serialized Kit/Sound state matches audible playback.

Sample path:

~~~text
Kit Slot → Sound → SampleSoundSpec
~~~

Hybrid path:

~~~text
Kit Slot → Sound → HybridSoundSpec
                     ├── SampleSoundSpec
                     └── SynthSoundSpec[]
~~~

## Sound locks

Existing sound locks continue protecting generative V2 material operations. Sample assignment and source-mode controls are explicit manual overrides, consistent with Synth's existing lock semantics.

## A/B sound morph boundary

Phase 13 A/B morphing still interpolates V2 synth material. The currently assigned sample source remains fixed during that morph. Phase 19 does not pretend two arbitrary audio files have a musically meaningful continuous sample morph.

Morph snapshots retain source-state information for later sample-aware lineage work.

## Asset removal

Removing an asset first detaches it from every currently assigned voice. Those voices return to SYNTH mode. Already-ringing sample voices can finish naturally; future scheduled hits use the new source state.

## SAMPLE / HYBRID UI

03 / SOUND now includes a dedicated SAMPLE / HYBRID machine with local import, asset library, decode status, content-hash identity, waveform, Trim In/Out, Gain, Pitch, Reverse, Synth/Sample/Hybrid source keys, Hybrid synth gain, audition, detach and asset removal.

The selected voice header shows the current source mode.

## Reset semantics

RESET ALL VOICES resets V2 material, source modes back to SYNTH, sample assignments, active generated Kit state and sound morph endpoints. It does not delete imported assets from the local sample library.

## Persistence boundary

Phase 19 is local-first but still session-local. Serializable AssetReference and SoundSpec data now describe sample/hybrid Sounds, but raw sample bytes, decoded buffers, waveform cache and source-assignment workspace do not survive reload yet.

A later persistence phase should place raw audio in IndexedDB/File System storage keyed by the deterministic asset ID.

## Phase boundary

Phase 19 does not yet add persistent sample bytes across reload, filesystem folder watching, sample slicing, transient detection, time-stretch independent of pitch, velocity multisamples, round-robin samples, cross-sample A/B morphing, sample tagging/search or cloud sample libraries.

## Acceptance

- [x] local sample import
- [x] 64 MB import guard
- [x] SHA-256 content identity
- [x] filename-independent duplicate identity
- [x] browser decode state
- [x] decoded AudioBuffer cache
- [x] reverse-buffer cache
- [x] waveform generation
- [x] AssetReference audio metadata
- [x] active SampleSoundSpec
- [x] Synth / Sample / Hybrid source modes
- [x] trim controls and waveform boundaries
- [x] gain -36/+12 dB
- [x] pitch ±24 semitones
- [x] reverse selected trim region
- [x] true Hybrid synth gain
- [x] sample direct audition
- [x] sample SEQUENCE playback
- [x] sample ARRANGE playback
- [x] sample family/history audition path
- [x] open-hat choke compatibility
- [x] transport epoch cancellation
- [x] active voice/polyphony integration
- [x] active-Kit SoundSpec synchronization
- [x] Kit generation preserves sample layers
- [x] Kit mutation preserves sample layers
- [x] asset removal detaches affected voices
- [x] no ambient randomness introduced
- [x] session persistence boundary explicit

## Next phase

**Phase 20 — Style DNA & Genre Expansion**

Phase 20 should replace broad style labels with deeper versioned Style DNA: instrumentation tendencies, subdivision vocabulary, backbeat behavior, kick grammar, ghost-note vocabulary, groove profile, fill vocabulary, sound-material tendencies and arrangement energy behavior across a much larger genre library.