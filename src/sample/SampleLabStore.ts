import { audioTransport } from "../audio/AudioTransport";
import { drumSoundStore } from "../audio/drumSoundModel";
import { sampleAssetStore } from "../audio/SampleAssetStore";
import type { Pattern, SampleSoundSpec, StepEvent } from "../domain/contracts";
import { generationHistoryStore } from "../history/GenerationHistoryStore";
import {
  DRUM_PADS,
  FOUNDATION_STEP_TICKS,
  SEQUENCER_LANES,
} from "../music/foundationPattern";
import { sequencerStore } from "../sequencer/SequencerStore";
import {
  analyzeSampleBuffer,
  beatSliceRanges,
  equalSliceRanges,
  normalizeGainDb,
  transientSliceRanges,
  type SampleAnalysis,
  type SampleSliceRange,
} from "./sampleAnalysis";

export type SampleSliceMode =
  | "transient"
  | "equal"
  | "beat"
  | "manual";

export interface SampleLabRegion {
  assetId: string;
  startSeconds: number;
  endSeconds: number;
  gainDb: number;
  normalizeGainDb: number;
  normalize: boolean;
  pitchSemitones: number;
  playbackRate: number;
  reversed: boolean;
  fadeInSeconds: number;
  fadeOutSeconds: number;
}

export interface SampleSlice {
  id: string;
  index: number;
  label: string;
  startSeconds: number;
  endSeconds: number;
}

export interface ChopEvent {
  id: string;
  padIndex: number;
  sliceId: string;
  timeSeconds: number;
  velocity: number;
}

export interface ChopTake {
  id: string;
  createdAt: string;
  durationSeconds: number;
  events: ChopEvent[];
}

export interface SampleLabSnapshot {
  activeAssetId?: string;
  analysis?: SampleAnalysis;
  region?: SampleLabRegion;
  slices: SampleSlice[];
  selectedSliceId?: string;
  sliceMode: SampleSliceMode;
  equalCount: number;
  beatBpm: number;
  beatsPerSlice: number;
  transientMaxSlices: number;
  manualCuts: number[];
  bankIndex: number;
  loopPreview: boolean;
  recording: boolean;
  currentEventCount: number;
  takes: ChopTake[];
  revision: number;
}

type Listener = () => void;

const PAD_BANK_SIZE = 8;
const TAKE_LIMIT = 8;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function cloneAnalysis(
  analysis: SampleAnalysis | undefined,
): SampleAnalysis | undefined {
  if (!analysis) return undefined;
  return {
    ...analysis,
    waveform: [...analysis.waveform],
    transientsSeconds: [...analysis.transientsSeconds],
  };
}

function cloneRegion(
  region: SampleLabRegion | undefined,
): SampleLabRegion | undefined {
  return region ? { ...region } : undefined;
}

function cloneSlice(slice: SampleSlice): SampleSlice {
  return { ...slice };
}

function cloneTake(take: ChopTake): ChopTake {
  return {
    ...take,
    events: take.events.map((event) => ({ ...event })),
  };
}

function slicesFromRanges(
  ranges: readonly SampleSliceRange[],
): SampleSlice[] {
  return ranges.map((range, index) => ({
    id:
      "sample-slice-" +
      String(index + 1).padStart(2, "0") +
      "-" +
      Math.round(range.startSeconds * 1000),
    index,
    label: "SLICE " + String(index + 1).padStart(2, "0"),
    startSeconds: range.startSeconds,
    endSeconds: range.endSeconds,
  }));
}

function clonePattern(pattern: Pattern): Pattern {
  return {
    ...pattern,
    meter: { ...pattern.meter },
    lanes: pattern.lanes.map((lane) => ({
      ...lane,
      events: lane.events.map((event) => ({
        ...event,
        generatorTags: event.generatorTags
          ? [...event.generatorTags]
          : undefined,
        grooveBase: event.grooveBase
          ? { ...event.grooveBase }
          : undefined,
      })),
      lock: { ...lane.lock },
      regionLocks: lane.regionLocks?.map((lock) => ({ ...lock })),
    })),
    groove: pattern.groove
      ? {
          ...pattern.groove,
          roleTimingOffsetUs: pattern.groove.roleTimingOffsetUs
            ? { ...pattern.groove.roleTimingOffsetUs }
            : undefined,
        }
      : undefined,
    provenance: pattern.provenance
      ? {
          ...pattern.provenance,
          style: { ...pattern.provenance.style },
          intent: { ...pattern.provenance.intent },
        }
      : undefined,
  };
}

export class SampleLabStore {
  private listeners = new Set<Listener>();
  private activeAssetId: string | undefined;
  private analysis: SampleAnalysis | undefined;
  private region: SampleLabRegion | undefined;
  private slices: SampleSlice[] = [];
  private selectedSliceId: string | undefined;
  private sliceMode: SampleSliceMode = "transient";
  private equalCount = 8;
  private beatBpm = 120;
  private beatsPerSlice = 1;
  private transientMaxSlices = 16;
  private manualCuts: number[] = [];
  private bankIndex = 0;
  private loopPreview = false;
  private recording = false;
  private recordingStartedAt = 0;
  private recordingEvents: ChopEvent[] = [];
  private takes: ChopTake[] = [];
  private eventSerial = 1;
  private takeSerial = 1;
  private revision = 0;
  private snapshot = this.buildSnapshot();

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): SampleLabSnapshot => this.snapshot;

  async loadAsset(assetId: string): Promise<void> {
    const context = await audioTransport.unlockAudio();
    const buffer = await sampleAssetStore.ensureDecoded(context, assetId);
    const analysis = analyzeSampleBuffer(buffer, 768);

    this.activeAssetId = assetId;
    this.analysis = analysis;
    this.region = {
      assetId,
      startSeconds: 0,
      endSeconds: analysis.durationSeconds,
      gainDb: 0,
      normalizeGainDb: 0,
      normalize: false,
      pitchSemitones: 0,
      playbackRate: 1,
      reversed: false,
      fadeInSeconds: 0.003,
      fadeOutSeconds: 0.006,
    };
    this.manualCuts = [];
    this.bankIndex = 0;
    this.generateSlicesInternal();
    this.publish();
  }

  resetProjectTransientState(): void {
    this.activeAssetId = undefined;
    this.analysis = undefined;
    this.region = undefined;
    this.slices = [];
    this.selectedSliceId = undefined;
    this.sliceMode = "transient";
    this.equalCount = 8;
    this.beatBpm = 120;
    this.beatsPerSlice = 1;
    this.transientMaxSlices = 16;
    this.manualCuts = [];
    this.bankIndex = 0;
    this.loopPreview = false;
    this.recording = false;
    this.recordingStartedAt = 0;
    this.recordingEvents = [];
    this.takes = [];
    this.eventSerial = 1;
    this.takeSerial = 1;
    this.publish();
  }

  clear(): void {
    this.activeAssetId = undefined;
    this.analysis = undefined;
    this.region = undefined;
    this.slices = [];
    this.selectedSliceId = undefined;
    this.manualCuts = [];
    this.bankIndex = 0;
    this.recording = false;
    this.recordingEvents = [];
    this.publish();
  }

  setRegion(
    startSeconds: number,
    endSeconds: number,
  ): void {
    if (!this.region || !this.analysis) return;
    const duration = this.analysis.durationSeconds;
    const start = clamp(startSeconds, 0, Math.max(0, duration - 0.001));
    const end = clamp(endSeconds, start + 0.001, duration);

    this.region = {
      ...this.region,
      startSeconds: start,
      endSeconds: end,
      fadeInSeconds: Math.min(
        this.region.fadeInSeconds,
        (end - start) * 0.45,
      ),
      fadeOutSeconds: Math.min(
        this.region.fadeOutSeconds,
        (end - start) * 0.45,
      ),
    };
    this.manualCuts = this.manualCuts.filter(
      (cut) => cut > start && cut < end,
    );
    this.generateSlicesInternal();
    this.publish();
  }

  setGainDb(value: number): void {
    if (!this.region) return;
    this.region = {
      ...this.region,
      gainDb: clamp(value, -36, 18),
    };
    this.publish();
  }

  async setNormalize(enabled: boolean): Promise<void> {
    if (!this.region || !this.activeAssetId) return;

    const assetId = this.activeAssetId;
    const startSeconds = this.region.startSeconds;
    const endSeconds = this.region.endSeconds;
    let normalizeDb = 0;

    if (enabled) {
      const context = await audioTransport.unlockAudio();
      const buffer = await sampleAssetStore.ensureDecoded(
        context,
        assetId,
      );

      if (
        this.activeAssetId !== assetId ||
        !this.region ||
        Math.abs(this.region.startSeconds - startSeconds) > 0.0001 ||
        Math.abs(this.region.endSeconds - endSeconds) > 0.0001
      ) {
        return;
      }

      normalizeDb = normalizeGainDb(
        buffer,
        startSeconds,
        endSeconds,
        -1,
      );
    }

    if (!this.region || this.activeAssetId !== assetId) return;

    this.region = {
      ...this.region,
      normalize: enabled,
      normalizeGainDb: normalizeDb,
    };
    this.publish();
  }

  setPitchSemitones(value: number): void {
    if (!this.region) return;
    this.region = {
      ...this.region,
      pitchSemitones: clamp(Math.round(value), -24, 24),
    };
    this.publish();
  }

  setPlaybackRate(value: number): void {
    if (!this.region) return;
    this.region = {
      ...this.region,
      playbackRate: clamp(value, 0.25, 4),
    };
    this.publish();
  }

  setReversed(reversed: boolean): void {
    if (!this.region) return;
    this.region = {
      ...this.region,
      reversed,
    };
    this.publish();
  }

  setFades(fadeInSeconds: number, fadeOutSeconds: number): void {
    if (!this.region) return;
    const length = this.region.endSeconds - this.region.startSeconds;
    this.region = {
      ...this.region,
      fadeInSeconds: clamp(fadeInSeconds, 0, length * 0.45),
      fadeOutSeconds: clamp(fadeOutSeconds, 0, length * 0.45),
    };
    this.publish();
  }

  setSliceMode(mode: SampleSliceMode): void {
    if (this.sliceMode === mode) return;
    this.sliceMode = mode;
    this.generateSlicesInternal();
    this.publish();
  }

  setEqualCount(count: number): void {
    const next = Math.max(1, Math.min(32, Math.round(count)));
    if (this.equalCount === next) return;
    this.equalCount = next;
    if (this.sliceMode === "equal") this.generateSlicesInternal();
    this.publish();
  }

  setBeatSlicing(bpm: number, beatsPerSlice: number): void {
    this.beatBpm = clamp(bpm, 30, 300);
    this.beatsPerSlice = clamp(beatsPerSlice, 0.25, 16);
    if (this.sliceMode === "beat") this.generateSlicesInternal();
    this.publish();
  }

  setTransientMaxSlices(value: number): void {
    const next = Math.max(1, Math.min(32, Math.round(value)));
    if (this.transientMaxSlices === next) return;
    this.transientMaxSlices = next;
    if (this.sliceMode === "transient") this.generateSlicesInternal();
    this.publish();
  }

  toggleManualCut(seconds: number): void {
    if (!this.region) return;
    const cut = clamp(
      seconds,
      this.region.startSeconds + 0.01,
      this.region.endSeconds - 0.01,
    );
    const tolerance = Math.max(
      0.01,
      (this.region.endSeconds - this.region.startSeconds) / 200,
    );
    const existing = this.manualCuts.findIndex(
      (value) => Math.abs(value - cut) <= tolerance,
    );

    if (existing >= 0) {
      this.manualCuts = this.manualCuts.filter(
        (_, index) => index !== existing,
      );
    } else {
      this.manualCuts = [...this.manualCuts, cut]
        .sort((a, b) => a - b)
        .slice(0, 31);
    }

    this.sliceMode = "manual";
    this.generateSlicesInternal();
    this.publish();
  }

  clearManualCuts(): void {
    if (this.manualCuts.length === 0) return;
    this.manualCuts = [];
    if (this.sliceMode === "manual") this.generateSlicesInternal();
    this.publish();
  }

  selectSlice(sliceId: string): void {
    if (!this.slices.some((slice) => slice.id === sliceId)) return;
    if (this.selectedSliceId === sliceId) return;
    this.selectedSliceId = sliceId;
    this.publish();
  }

  setBankIndex(index: number): void {
    const maximum = Math.max(
      0,
      Math.ceil(this.slices.length / PAD_BANK_SIZE) - 1,
    );
    const next = Math.max(0, Math.min(maximum, Math.round(index)));
    if (this.bankIndex === next) return;
    this.bankIndex = next;
    this.publish();
  }

  setLoopPreview(loop: boolean): void {
    if (this.loopPreview === loop) return;
    this.loopPreview = loop;
    this.publish();
  }

  currentBank(): SampleSlice[] {
    const start = this.bankIndex * PAD_BANK_SIZE;
    return this.slices
      .slice(start, start + PAD_BANK_SIZE)
      .map(cloneSlice);
  }

  selectedSlice(): SampleSlice | undefined {
    const slice = this.slices.find(
      (entry) => entry.id === this.selectedSliceId,
    );
    return slice ? cloneSlice(slice) : undefined;
  }

  regionSpec(): SampleSoundSpec | undefined {
    if (!this.region) return undefined;
    return this.specForRange(
      this.region.startSeconds,
      this.region.endSeconds,
    );
  }

  sliceSpec(slice: SampleSlice): SampleSoundSpec | undefined {
    if (!this.region) return undefined;
    return this.specForRange(
      slice.startSeconds,
      slice.endSeconds,
    );
  }

  startRecording(): void {
    if (this.recording) return;
    this.recording = true;
    this.recordingStartedAt = performance.now() / 1000;
    this.recordingEvents = [];
    this.publish();
  }

  recordPad(padIndex: number, velocity = 0.9): void {
    if (!this.recording) return;
    const bank = this.currentBank();
    const slice = bank[padIndex];
    if (!slice) return;

    const timeSeconds =
      Math.max(0, performance.now() / 1000 - this.recordingStartedAt);
    this.recordingEvents.push({
      id: "chop-event-" + this.eventSerial++,
      padIndex,
      sliceId: slice.id,
      timeSeconds,
      velocity: clamp(velocity, 0.05, 1),
    });
    this.publish();
  }

  stopRecording(): ChopTake | undefined {
    if (!this.recording) return undefined;

    this.recording = false;
    const durationSeconds =
      Math.max(0, performance.now() / 1000 - this.recordingStartedAt);
    const take =
      this.recordingEvents.length > 0
        ? {
            id:
              "chop-take-" +
              String(this.takeSerial++).padStart(3, "0"),
            createdAt: new Date().toISOString(),
            durationSeconds,
            events: this.recordingEvents.map((event) => ({ ...event })),
          }
        : undefined;

    if (take) {
      this.takes = [...this.takes, take].slice(-TAKE_LIMIT);
    }

    this.recordingEvents = [];
    this.publish();
    return take ? cloneTake(take) : undefined;
  }

  deleteTake(takeId: string): void {
    const next = this.takes.filter((take) => take.id !== takeId);
    if (next.length === this.takes.length) return;
    this.takes = next;
    this.publish();
  }

  applyCurrentBankToVoices(): number {
    const bank = this.currentBank();
    let applied = 0;

    bank.forEach((slice, index) => {
      const pad = DRUM_PADS[index];
      const spec = this.sliceSpec(slice);
      if (!pad || !spec) return;
      drumSoundStore.assignSampleSpec(pad.voice, spec, "sample");
      applied += 1;
    });

    return applied;
  }

  commitTakeToPattern(
    takeId: string,
    bpm: number,
  ): Pattern | undefined {
    const take = this.takes.find((entry) => entry.id === takeId);
    if (!take || take.events.length === 0) return undefined;

    const mapped = new Map<number, { slice: SampleSlice; laneId: string }>();

    for (const event of take.events) {
      if (mapped.has(event.padIndex)) continue;
      const slice = this.slices.find(
        (entry) => entry.id === event.sliceId,
      );
      const pad = DRUM_PADS[event.padIndex];
      const lane = pad
        ? SEQUENCER_LANES.find(
            (entry) => entry.voice === pad.voice,
          )
        : undefined;
      const spec = slice ? this.sliceSpec(slice) : undefined;
      if (!slice || !pad || !lane || !spec) continue;

      drumSoundStore.assignSampleSpec(pad.voice, spec, "sample");
      mapped.set(event.padIndex, { slice, laneId: lane.id });
    }

    const current = sequencerStore.getSnapshot().pattern;
    const pattern = clonePattern(current);
    const patternSteps = Math.max(
      1,
      Math.round(pattern.lengthTicks / FOUNDATION_STEP_TICKS),
    );
    const stepSeconds = 60 / clamp(bpm, 30, 300) / 4;

    for (const lane of pattern.lanes) {
      if (
        [...mapped.values()].some((entry) => entry.laneId === lane.id)
      ) {
        lane.events = [];
      }
    }

    for (const event of take.events) {
      const mapping = mapped.get(event.padIndex);
      if (!mapping) continue;
      const lane = pattern.lanes.find(
        (entry) => entry.id === mapping.laneId,
      );
      if (!lane) continue;

      const step =
        Math.round(event.timeSeconds / stepSeconds) % patternSteps;
      const tick = step * FOUNDATION_STEP_TICKS;
      const existing = lane.events.find((entry) => entry.tick === tick);

      if (existing) {
        existing.velocity = Math.max(existing.velocity, event.velocity);
        existing.accent =
          existing.velocity >= 0.85
            ? "accent"
            : existing.velocity <= 0.3
              ? "ghost"
              : "normal";
        continue;
      }

      const stepEvent: StepEvent = {
        id:
          "evt-samplelab-" +
          lane.id +
          "-" +
          step +
          "-" +
          take.id,
        tick,
        velocity: event.velocity,
        probability: 1,
        timingOffsetUs: 0,
        accent:
          event.velocity >= 0.85
            ? "accent"
            : event.velocity <= 0.3
              ? "ghost"
              : "normal",
        generatorTags: ["sample-lab", take.id],
      };
      lane.events.push(stepEvent);
    }

    for (const lane of pattern.lanes) {
      lane.events.sort((a, b) => a.tick - b.tick);
    }

    pattern.id = "pattern-samplelab-" + take.id;
    pattern.name = "SAMPLE LAB / " + take.id.toUpperCase();
    if (pattern.provenance) {
      pattern.provenance = {
        ...pattern.provenance,
        generatorId: "sample-lab",
        generatorVersion: 1,
        sourceEntityId: current.id,
        mutationId: take.id,
        style: { ...pattern.provenance.style },
        intent: {
          ...pattern.provenance.intent,
          mutationDistance: 0.45,
        },
      };
    }

    const prepared =
      generationHistoryStore.prepareCreativePattern(current, pattern);
    sequencerStore.restorePatternSnapshot(prepared.pattern);
    const applied = sequencerStore.getSnapshot().pattern;
    generationHistoryStore.commitPrepared(
      {
        parentNodeId: prepared.parentNodeId,
        pattern: applied,
      },
      "sampleLab",
      "SAMPLE LAB TAKE",
      applied.name,
    );

    return clonePattern(applied);
  }

  private specForRange(
    startSeconds: number,
    endSeconds: number,
  ): SampleSoundSpec {
    const region = this.region!;
    return {
      kind: "sample",
      assetId: region.assetId,
      trimStartSeconds: startSeconds,
      trimEndSeconds: endSeconds,
      gainDb: clamp(
        region.gainDb +
          (region.normalize ? region.normalizeGainDb : 0),
        -36,
        12,
      ),
      pitchSemitones: region.pitchSemitones,
      playbackRate: region.playbackRate,
      fadeInSeconds: Math.min(
        region.fadeInSeconds,
        (endSeconds - startSeconds) * 0.45,
      ),
      fadeOutSeconds: Math.min(
        region.fadeOutSeconds,
        (endSeconds - startSeconds) * 0.45,
      ),
      reversed: region.reversed,
    };
  }

  private generateSlicesInternal(): void {
    if (!this.region || !this.analysis) {
      this.slices = [];
      this.selectedSliceId = undefined;
      return;
    }

    const start = this.region.startSeconds;
    const end = this.region.endSeconds;
    let ranges: SampleSliceRange[];

    switch (this.sliceMode) {
      case "equal":
        ranges = equalSliceRanges(start, end, this.equalCount);
        break;
      case "beat":
        ranges = beatSliceRanges(
          start,
          end,
          this.beatBpm,
          this.beatsPerSlice,
        );
        break;
      case "manual": {
        const cuts = [
          start,
          ...this.manualCuts.filter(
            (cut) => cut > start && cut < end,
          ),
          end,
        ].sort((a, b) => a - b);
        ranges = [];
        for (
          let index = 0;
          index < cuts.length - 1 && ranges.length < 32;
          index += 1
        ) {
          const from = cuts[index] ?? start;
          const to = cuts[index + 1] ?? end;
          if (to - from >= 0.01) {
            ranges.push({
              startSeconds: from,
              endSeconds: to,
            });
          }
        }
        break;
      }
      case "transient":
      default:
        ranges = transientSliceRanges(
          start,
          end,
          this.analysis.transientsSeconds,
          this.transientMaxSlices,
        );
        break;
    }

    this.slices = slicesFromRanges(ranges);
    this.selectedSliceId =
      this.slices.find(
        (slice) => slice.id === this.selectedSliceId,
      )?.id ??
      this.slices[0]?.id;
    const maxBank = Math.max(
      0,
      Math.ceil(this.slices.length / PAD_BANK_SIZE) - 1,
    );
    this.bankIndex = Math.min(this.bankIndex, maxBank);
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): SampleLabSnapshot {
    return {
      activeAssetId: this.activeAssetId,
      analysis: cloneAnalysis(this.analysis),
      region: cloneRegion(this.region),
      slices: this.slices.map(cloneSlice),
      selectedSliceId: this.selectedSliceId,
      sliceMode: this.sliceMode,
      equalCount: this.equalCount,
      beatBpm: this.beatBpm,
      beatsPerSlice: this.beatsPerSlice,
      transientMaxSlices: this.transientMaxSlices,
      manualCuts: [...this.manualCuts],
      bankIndex: this.bankIndex,
      loopPreview: this.loopPreview,
      recording: this.recording,
      currentEventCount: this.recordingEvents.length,
      takes: this.takes.map(cloneTake),
      revision: this.revision,
    };
  }
}

export const sampleLabStore = new SampleLabStore();
export const SAMPLE_LAB_PAD_BANK_SIZE = PAD_BANK_SIZE;
