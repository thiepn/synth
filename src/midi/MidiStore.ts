import { audioTransport } from "../audio/AudioTransport";
import { arrangementPlaybackStore } from "../arrange/ArrangementPlaybackStore";
import type { StepEvent } from "../domain/contracts";
import { generationHistoryStore } from "../history/GenerationHistoryStore";
import {
  inputActionRouter,
  type ExternalActionTarget,
} from "../input/InputActionRouter";
import {
  DRUM_PADS,
  FOUNDATION_STEP_TICKS,
  SEQUENCER_LANES,
  type DrumVoiceId,
} from "../music/foundationPattern";
import { modulationStore } from "../modulation/ModulationStore";
import { clampManualTimingOffsetUs } from "../sequencer/playbackRules";
import { sequencerStore } from "../sequencer/SequencerStore";

type Listener = () => void;

interface MidiMessageEventLike {
  data?: Uint8Array;
}

interface MidiInputLike {
  id: string;
  name?: string | null;
  manufacturer?: string | null;
  state?: string;
  connection?: string;
  onmidimessage:
    | ((event: MidiMessageEventLike) => void)
    | null;
  open?: () => Promise<void>;
  close?: () => Promise<void>;
}

interface MidiAccessLike {
  inputs: Map<string, MidiInputLike>;
  onstatechange:
    | ((event: { port?: MidiInputLike }) => void)
    | null;
}

interface NavigatorWithMidi extends Navigator {
  requestMIDIAccess?: (
    options?: { sysex?: boolean; software?: boolean },
  ) => Promise<MidiAccessLike>;
}

export type MidiStatus =
  | "unsupported"
  | "idle"
  | "requesting"
  | "ready"
  | "error";

export type MidiMessageKind = "note" | "cc";
export type MidiRecordQuantize = "off" | "1/16" | "1/8" | "1/4";

export type MidiBindingTarget =
  | ExternalActionTarget
  | {
      kind: "parameter";
      targetId: string;
      sourceId: string;
    };

export interface MidiBinding {
  id: string;
  inputName?: string;
  channel?: number;
  messageKind: MidiMessageKind;
  number: number;
  target: MidiBindingTarget;
}

export interface MidiLearnRequest {
  target:
    | ExternalActionTarget
    | {
        kind: "parameter";
        targetId: string;
      };
  label: string;
}

export interface MidiInputDescriptor {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
  connection: string;
}

export interface MidiControllerProfile {
  id: string;
  name: string;
  inputName?: string;
  channelFilter: number | null;
  bindings: MidiBinding[];
  createdAt: string;
}

interface RecordedMidiHit {
  voice: DrumVoiceId;
  absoluteTick: number;
  velocity: number;
}

export interface MidiSnapshot {
  supported: boolean;
  status: MidiStatus;
  inputs: MidiInputDescriptor[];
  selectedInputId?: string;
  selectedInputName?: string;
  channelFilter: number | null;
  bindings: MidiBinding[];
  learn?: MidiLearnRequest;
  profiles: MidiControllerProfile[];
  recording: boolean;
  recordingHitCount: number;
  recordQuantize: MidiRecordQuantize;
  overdub: boolean;
  lastMessage?: string;
  lastError?: string;
  revision: number;
}

const DEFAULT_NOTE_MAP: Readonly<Record<number, DrumVoiceId>> = Object.freeze({
  36: "kick",
  38: "snare",
  39: "clap",
  42: "closedHat",
  46: "openHat",
  45: "tom",
  37: "percussion",
  49: "crash",
});

const PROFILE_LIMIT = 12;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function cloneTarget(target: MidiBindingTarget): MidiBindingTarget {
  return { ...target } as MidiBindingTarget;
}

function cloneBinding(binding: MidiBinding): MidiBinding {
  return {
    ...binding,
    target: cloneTarget(binding.target),
  };
}

function cloneLearn(
  learn: MidiLearnRequest | undefined,
): MidiLearnRequest | undefined {
  return learn
    ? {
        label: learn.label,
        target: { ...learn.target } as MidiLearnRequest["target"],
      }
    : undefined;
}

function cloneProfile(
  profile: MidiControllerProfile,
): MidiControllerProfile {
  return {
    ...profile,
    bindings: profile.bindings.map(cloneBinding),
  };
}

function clonePattern() {
  const pattern = sequencerStore.getSnapshot().pattern;
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

function accentFromVelocity(
  velocity: number,
): StepEvent["accent"] {
  if (velocity >= 0.85) return "accent";
  if (velocity <= 0.3) return "ghost";
  return "normal";
}

function targetKey(target: MidiBindingTarget): string {
  switch (target.kind) {
    case "pad":
      return "pad:" + target.voice;
    case "macro":
      return "macro:" + target.macro;
    case "chaos":
      return "chaos";
    case "momentary":
      return "momentary:" + target.action;
    case "fill":
      return "fill";
    case "scene":
      return "scene:" + target.sectionId;
    case "transport":
      return "transport:" + target.action;
    case "parameter":
      return "parameter:" + target.targetId;
  }
}

export class MidiStore {
  private listeners = new Set<Listener>();
  private supported =
    typeof navigator !== "undefined" &&
    typeof (navigator as NavigatorWithMidi).requestMIDIAccess === "function";
  private status: MidiStatus = this.supported ? "idle" : "unsupported";
  private access: MidiAccessLike | undefined;
  private selectedInput: MidiInputLike | undefined;
  private selectedInputId: string | undefined;
  private desiredInputName: string | undefined;
  private inputs: MidiInputDescriptor[] = [];
  private channelFilter: number | null = null;
  private bindings: MidiBinding[] = [];
  private learn: MidiLearnRequest | undefined;
  private profiles: MidiControllerProfile[] = [];
  private bindingSerial = 1;
  private profileSerial = 1;
  private recording = false;
  private recordedHits: RecordedMidiHit[] = [];
  private recordQuantize: MidiRecordQuantize = "1/16";
  private overdub = true;
  private lastMessage: string | undefined;
  private lastError: string | undefined;
  private revision = 0;
  private snapshot = this.buildSnapshot();

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): MidiSnapshot => this.snapshot;

  async enable(): Promise<void> {
    if (!this.supported) {
      this.status = "unsupported";
      this.publish();
      return;
    }
    if (this.access) {
      this.status = "ready";
      this.refreshInputs();
      this.publish();
      return;
    }

    this.status = "requesting";
    this.lastError = undefined;
    this.publish();

    try {
      const request = (navigator as NavigatorWithMidi).requestMIDIAccess;
      if (!request) {
        throw new Error("Web MIDI is not available in this browser.");
      }

      this.access = await request.call(navigator, {
        sysex: false,
        software: false,
      });
      this.access.onstatechange = () => {
        this.refreshInputs();
        this.reconnectPreferredInput();
      };
      this.status = "ready";
      this.refreshInputs();
      this.reconnectPreferredInput();
      this.publish();
    } catch (error) {
      this.status = "error";
      this.lastError =
        error instanceof Error ? error.message : String(error);
      this.publish();
    }
  }

  async selectInput(inputId: string | undefined): Promise<void> {
    if (this.selectedInput?.onmidimessage) {
      this.selectedInput.onmidimessage = null;
    }

    if (!inputId || !this.access) {
      this.selectedInput = undefined;
      this.selectedInputId = undefined;
      this.desiredInputName = undefined;
      this.publish();
      return;
    }

    const input = this.access.inputs.get(inputId);
    if (!input) {
      this.lastError = "The selected MIDI input is no longer available.";
      this.refreshInputs();
      this.publish();
      return;
    }

    try {
      await input.open?.();
    } catch {
      // Some browsers open MIDI inputs automatically.
    }

    this.selectedInput = input;
    this.selectedInputId = input.id;
    this.desiredInputName = input.name ?? input.id;
    input.onmidimessage = (event) => {
      this.handleMessage(input, event.data);
    };
    this.lastError = undefined;
    this.publish();
  }

  setChannelFilter(channel: number | null): void {
    const next =
      channel === null
        ? null
        : Math.max(1, Math.min(16, Math.round(channel)));
    if (this.channelFilter === next) return;
    this.channelFilter = next;
    this.publish();
  }

  beginLearn(request: MidiLearnRequest): void {
    this.learn = cloneLearn(request);
    this.lastMessage = "LEARN / MOVE A MIDI CONTROL";
    this.publish();
  }

  cancelLearn(): void {
    if (!this.learn) return;
    this.learn = undefined;
    this.publish();
  }

  removeBinding(bindingId: string): void {
    const binding = this.bindings.find(
      (entry) => entry.id === bindingId,
    );
    if (!binding) return;

    this.bindings = this.bindings.filter(
      (entry) => entry.id !== bindingId,
    );

    if (binding.target.kind === "parameter") {
      const sourceId = binding.target.sourceId;
      const stillUsed = this.bindings.some(
        (entry) =>
          entry.target.kind === "parameter" &&
          entry.target.sourceId === sourceId,
      );
      if (!stillUsed) {
        modulationStore.removeSource(sourceId);
      }
    }

    this.publish();
  }

  clearBindings(): void {
    const externalSources = new Set(
      this.bindings.flatMap((binding) =>
        binding.target.kind === "parameter"
          ? [binding.target.sourceId]
          : [],
      ),
    );
    this.bindings = [];
    for (const sourceId of externalSources) {
      modulationStore.removeSource(sourceId);
    }
    this.publish();
  }

  setRecordQuantize(value: MidiRecordQuantize): void {
    if (this.recordQuantize === value) return;
    this.recordQuantize = value;
    this.publish();
  }

  setOverdub(overdub: boolean): void {
    if (this.overdub === overdub) return;
    this.overdub = overdub;
    this.publish();
  }

  async startRecording(): Promise<void> {
    if (this.recording) return;

    const arrangement = arrangementPlaybackStore.getSnapshot();
    if (arrangement.engaged) {
      arrangementPlaybackStore.stop();
    }

    if (audioTransport.getSnapshot().status === "idle") {
      await audioTransport.start();
    }

    this.recordedHits = [];
    this.recording = true;
    this.lastMessage = "MIDI RECORDING / PLAY PADS";
    this.publish();
  }

  stopRecording(): number {
    if (!this.recording) return 0;

    this.recording = false;
    const count = this.recordedHits.length;
    if (count > 0) {
      this.commitRecordedHits();
    }
    this.recordedHits = [];
    this.lastMessage =
      count > 0
        ? "MIDI TAKE COMMITTED / " + count + " HITS"
        : "EMPTY MIDI TAKE";
    this.publish();
    return count;
  }

  saveProfile(name: string): MidiControllerProfile | undefined {
    const safe = name.trim().slice(0, 48);
    if (!safe) return undefined;

    const profile: MidiControllerProfile = {
      id:
        "midi-profile-" +
        String(this.profileSerial++).padStart(3, "0"),
      name: safe,
      inputName: this.desiredInputName,
      channelFilter: this.channelFilter,
      bindings: this.bindings.map(cloneBinding),
      createdAt: new Date().toISOString(),
    };
    this.profiles = [...this.profiles, profile].slice(-PROFILE_LIMIT);
    this.publish();
    return cloneProfile(profile);
  }

  loadProfile(profileId: string): boolean {
    const profile = this.profiles.find(
      (entry) => entry.id === profileId,
    );
    if (!profile) return false;

    this.clearBindings();
    this.channelFilter = profile.channelFilter;
    this.desiredInputName = profile.inputName;
    this.bindings = profile.bindings.map((binding) => {
      const cloned = cloneBinding(binding);
      if (cloned.target.kind === "parameter") {
        modulationStore.ensureExternalSource(
          cloned.target.sourceId,
          "MIDI " + cloned.number,
        );
        const routeId = modulationStore.addRoute(
          cloned.target.sourceId,
          cloned.target.targetId,
          1,
          "replace",
        );
        if (routeId) {
          modulationStore.updateRoute(routeId, {
            depth: 1,
            mode: "replace",
          });
        }
      }
      return cloned;
    });
    this.reconnectPreferredInput();
    this.publish();
    return true;
  }

  deleteProfile(profileId: string): void {
    const next = this.profiles.filter(
      (entry) => entry.id !== profileId,
    );
    if (next.length === this.profiles.length) return;
    this.profiles = next;
    this.publish();
  }

  private refreshInputs(): void {
    const access = this.access;
    if (!access) {
      this.inputs = [];
      return;
    }

    this.inputs = [...access.inputs.values()]
      .map((input) => ({
        id: input.id,
        name: input.name ?? input.id,
        manufacturer: input.manufacturer ?? "",
        state: input.state ?? "unknown",
        connection: input.connection ?? "unknown",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (
      this.selectedInputId &&
      !access.inputs.has(this.selectedInputId)
    ) {
      if (this.selectedInput) {
        this.selectedInput.onmidimessage = null;
      }
      this.selectedInput = undefined;
      this.selectedInputId = undefined;
    }
  }

  private reconnectPreferredInput(): void {
    if (!this.access || this.selectedInputId) return;

    const candidate =
      [...this.access.inputs.values()].find(
        (input) =>
          this.desiredInputName &&
          (input.name ?? input.id) === this.desiredInputName,
      ) ??
      (this.inputs.length === 1
        ? this.access.inputs.get(this.inputs[0]!.id)
        : undefined);

    if (candidate) {
      void this.selectInput(candidate.id);
    }
  }

  private handleMessage(
    input: MidiInputLike,
    data: Uint8Array | undefined,
  ): void {
    if (!data || data.length === 0) return;

    const status = data[0] ?? 0;

    if (status >= 0xf8) {
      if (status === 0xfa || status === 0xfb) {
        void this.startExternalTransport();
        this.lastMessage =
          status === 0xfa ? "MIDI START" : "MIDI CONTINUE";
        this.publish();
      } else if (status === 0xfc) {
        arrangementPlaybackStore.stop();
        audioTransport.stop();
        this.lastMessage = "MIDI STOP";
        this.publish();
      }
      return;
    }

    const message = status & 0xf0;
    const channel = (status & 0x0f) + 1;
    if (
      this.channelFilter !== null &&
      channel !== this.channelFilter
    ) {
      return;
    }

    const number = data[1] ?? 0;
    const rawValue = data[2] ?? 0;
    const value = clamp01(rawValue / 127);
    const noteOn = message === 0x90 && rawValue > 0;
    const noteOff =
      message === 0x80 ||
      (message === 0x90 && rawValue === 0);
    const cc = message === 0xb0;

    if (!noteOn && !noteOff && !cc) return;

    const kind: MidiMessageKind = cc ? "cc" : "note";

    if (this.learn && (noteOn || cc)) {
      this.captureLearn(
        input,
        channel,
        kind,
        number,
      );
      return;
    }

    const matched = this.bindings.filter(
      (binding) =>
        binding.messageKind === kind &&
        binding.number === number &&
        (binding.channel === undefined ||
          binding.channel === channel) &&
        (!binding.inputName ||
          binding.inputName === (input.name ?? input.id)),
    );

    const triggeredPadVoices = new Set<DrumVoiceId>();

    if (matched.length > 0) {
      for (const binding of matched) {
        if (binding.target.kind === "parameter") {
          if (cc || noteOn) {
            modulationStore.setExternalSourceValue(
              binding.target.sourceId,
              value,
            );
          } else if (noteOff) {
            modulationStore.setExternalSourceValue(
              binding.target.sourceId,
              0,
            );
          }
          continue;
        }

        if (noteOff) {
          inputActionRouter.release(binding.target);
          continue;
        }

        void inputActionRouter.trigger(binding.target, value);
        if (binding.target.kind === "pad") {
          triggeredPadVoices.add(binding.target.voice);
        }
      }
    } else if (kind === "note") {
      const voice = DEFAULT_NOTE_MAP[number];
      if (voice) {
        if (noteOn) {
          void inputActionRouter.trigger(
            { kind: "pad", voice },
            value,
          );
          triggeredPadVoices.add(voice);
        }
      }
    }

    if (noteOn && this.recording) {
      for (const voice of triggeredPadVoices) {
        this.recordedHits.push({
          voice,
          absoluteTick: audioTransport.getCurrentAbsoluteTick(),
          velocity: Math.max(0.05, value),
        });
      }
    }

    this.lastMessage =
      (kind === "cc" ? "CC " : noteOn ? "NOTE " : "NOTE OFF ") +
      number +
      " · CH " +
      channel +
      " · " +
      Math.round(value * 127);
    this.publish();
  }

  private captureLearn(
    input: MidiInputLike,
    channel: number,
    messageKind: MidiMessageKind,
    number: number,
  ): void {
    const learn = this.learn;
    if (!learn) return;

    const inputName = input.name ?? input.id;
    let target: MidiBindingTarget;

    if (learn.target.kind === "parameter") {
      const sourceId =
        "midi-external-" +
        input.id.replace(/[^a-zA-Z0-9_-]+/g, "-") +
        "-" +
        channel +
        "-" +
        messageKind +
        "-" +
        number;
      modulationStore.ensureExternalSource(
        sourceId,
        "MIDI " +
          (messageKind === "cc" ? "CC " : "NOTE ") +
          number,
      );
      const routeId = modulationStore.addRoute(
        sourceId,
        learn.target.targetId,
        1,
        "replace",
      );
      if (routeId) {
        modulationStore.updateRoute(routeId, {
          depth: 1,
          mode: "replace",
        });
      }
      target = {
        kind: "parameter",
        targetId: learn.target.targetId,
        sourceId,
      };
    } else {
      target = { ...learn.target } as ExternalActionTarget;
    }

    const duplicate = this.bindings.find(
      (binding) =>
        binding.inputName === inputName &&
        binding.channel === channel &&
        binding.messageKind === messageKind &&
        binding.number === number &&
        targetKey(binding.target) === targetKey(target),
    );

    if (!duplicate) {
      this.bindings = [
        ...this.bindings,
        {
          id:
            "midi-binding-" +
            String(this.bindingSerial++).padStart(3, "0"),
          inputName,
          channel,
          messageKind,
          number,
          target,
        },
      ];
    }

    this.learn = undefined;
    this.lastMessage =
      "LEARNED / " +
      learn.label +
      " ← " +
      (messageKind === "cc" ? "CC " : "NOTE ") +
      number;
    this.publish();
  }

  private async startExternalTransport(): Promise<void> {
    const arrangement = arrangementPlaybackStore.getSnapshot();
    if (arrangement.engaged) {
      await arrangementPlaybackStore.resume();
    } else {
      await audioTransport.start();
    }
  }

  private commitRecordedHits(): void {
    const source = sequencerStore.getSnapshot().pattern;
    const pattern = clonePattern();
    const patternLength = Math.max(
      FOUNDATION_STEP_TICKS,
      pattern.lengthTicks,
    );
    const bpm = audioTransport.getSnapshot().bpm;
    const grid =
      this.recordQuantize === "1/4"
        ? 960
        : this.recordQuantize === "1/8"
          ? 480
          : FOUNDATION_STEP_TICKS;
    const affectedVoices = new Set(
      this.recordedHits.map((hit) => hit.voice),
    );

    if (!this.overdub) {
      for (const lane of pattern.lanes) {
        const definition = SEQUENCER_LANES.find(
          (entry) => entry.id === lane.id,
        );
        if (
          definition &&
          affectedVoices.has(definition.voice)
        ) {
          lane.events = [];
        }
      }
    }

    for (const hit of this.recordedHits) {
      const definition = SEQUENCER_LANES.find(
        (entry) => entry.voice === hit.voice,
      );
      const lane = definition
        ? pattern.lanes.find(
            (entry) => entry.id === definition.id,
          )
        : undefined;
      if (!lane) continue;

      const rawTick =
        ((Math.max(0, hit.absoluteTick) % patternLength) +
          patternLength) %
        patternLength;
      const baseGrid =
        this.recordQuantize === "off"
          ? FOUNDATION_STEP_TICKS
          : grid;
      let eventTick =
        Math.round(rawTick / baseGrid) * baseGrid;
      eventTick =
        ((eventTick % patternLength) + patternLength) %
        patternLength;

      let timingOffsetUs = 0;
      if (this.recordQuantize === "off") {
        let deltaTicks = rawTick - eventTick;
        if (deltaTicks > patternLength / 2) {
          deltaTicks -= patternLength;
        } else if (deltaTicks < -patternLength / 2) {
          deltaTicks += patternLength;
        }
        const seconds =
          (deltaTicks * 60) / Math.max(30, bpm) / 960;
        timingOffsetUs = clampManualTimingOffsetUs(
          seconds * 1_000_000,
        );
      }

      const existing = lane.events.find(
        (event) => event.tick === eventTick,
      );
      if (existing) {
        existing.velocity = Math.max(
          existing.velocity,
          hit.velocity,
        );
        existing.timingOffsetUs =
          this.recordQuantize === "off"
            ? timingOffsetUs
            : existing.timingOffsetUs;
        existing.accent = accentFromVelocity(existing.velocity);
        existing.generatorTags = [
          ...(existing.generatorTags ?? []),
          "midi-record",
        ];
        continue;
      }

      lane.events.push({
        id:
          "evt-midi-" +
          lane.id +
          "-" +
          eventTick +
          "-" +
          Math.round(hit.absoluteTick),
        tick: eventTick,
        velocity: hit.velocity,
        probability: 1,
        timingOffsetUs,
        accent: accentFromVelocity(hit.velocity),
        generatorTags: ["midi-record"],
      });
      lane.events.sort((a, b) => a.tick - b.tick);
    }

    pattern.id =
      "pattern-midi-" + Date.now().toString(36);
    pattern.name = "MIDI TAKE / " + source.name;
    if (pattern.provenance) {
      pattern.provenance = {
        ...pattern.provenance,
        generatorId: "midi-record",
        generatorVersion: 1,
        sourceEntityId: source.id,
        mutationId:
          "midi:" +
          this.recordQuantize +
          ":" +
          (this.overdub ? "overdub" : "replace"),
        style: { ...pattern.provenance.style },
        intent: { ...pattern.provenance.intent },
      };
    }

    const prepared =
      generationHistoryStore.prepareCreativePattern(
        source,
        pattern,
      );
    sequencerStore.restorePatternSnapshot(prepared.pattern);
    const applied = sequencerStore.getSnapshot().pattern;
    generationHistoryStore.commitPrepared(
      {
        parentNodeId: prepared.parentNodeId,
        pattern: applied,
      },
      "midiRecord",
      "MIDI RECORD",
      applied.name,
    );
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): MidiSnapshot {
    return {
      supported: this.supported,
      status: this.status,
      inputs: this.inputs.map((input) => ({ ...input })),
      selectedInputId: this.selectedInputId,
      selectedInputName: this.desiredInputName,
      channelFilter: this.channelFilter,
      bindings: this.bindings.map(cloneBinding),
      learn: cloneLearn(this.learn),
      profiles: this.profiles.map(cloneProfile),
      recording: this.recording,
      recordingHitCount: this.recordedHits.length,
      recordQuantize: this.recordQuantize,
      overdub: this.overdub,
      lastMessage: this.lastMessage,
      lastError: this.lastError,
      revision: this.revision,
    };
  }
}

export const midiStore = new MidiStore();

export const MIDI_DEFAULT_NOTE_MAP = DEFAULT_NOTE_MAP;
