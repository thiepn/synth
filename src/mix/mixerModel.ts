import {
  DRUM_PADS,
  type DrumVoiceId,
} from "../music/foundationPattern";

export interface MixerChannelState {
  voice: DrumVoiceId;
  gainDb: number;
  pan: number;
  lowDb: number;
  midDb: number;
  highDb: number;
  compression: number;
  saturation: number;
  reverbSend: number;
  sidechain: number;
  muted: boolean;
  solo: boolean;
}

export interface MixerState {
  channels: Record<DrumVoiceId, MixerChannelState>;
  masterGainDb: number;
}

export const MIXER_GAIN_MIN_DB = -24;
export const MIXER_GAIN_MAX_DB = 6;
export const MIXER_EQ_MIN_DB = -12;
export const MIXER_EQ_MAX_DB = 12;

function channel(
  voice: DrumVoiceId,
): MixerChannelState {
  return {
    voice,
    gainDb: 0,
    pan: 0,
    lowDb: 0,
    midDb: 0,
    highDb: 0,
    compression: 0,
    saturation: 0,
    reverbSend: 1,
    sidechain: 0,
    muted: false,
    solo: false,
  };
}

export function createDefaultMixerState(): MixerState {
  const entries = DRUM_PADS.map((pad) => [
    pad.voice,
    channel(pad.voice),
  ]) as Array<[DrumVoiceId, MixerChannelState]>;

  return {
    channels: Object.fromEntries(entries) as Record<
      DrumVoiceId,
      MixerChannelState
    >,
    masterGainDb: 0,
  };
}

export function cloneMixerChannel(
  value: MixerChannelState,
): MixerChannelState {
  return { ...value };
}

export function cloneMixerState(
  state: MixerState,
): MixerState {
  const entries = DRUM_PADS.map((pad) => [
    pad.voice,
    cloneMixerChannel(state.channels[pad.voice]),
  ]) as Array<[DrumVoiceId, MixerChannelState]>;

  return {
    channels: Object.fromEntries(entries) as Record<
      DrumVoiceId,
      MixerChannelState
    >,
    masterGainDb: state.masterGainDb,
  };
}

export function clampMixerChannel(
  channelState: MixerChannelState,
): MixerChannelState {
  return {
    ...channelState,
    gainDb: Math.max(
      MIXER_GAIN_MIN_DB,
      Math.min(MIXER_GAIN_MAX_DB, channelState.gainDb),
    ),
    pan: Math.max(-1, Math.min(1, channelState.pan)),
    lowDb: Math.max(
      MIXER_EQ_MIN_DB,
      Math.min(MIXER_EQ_MAX_DB, channelState.lowDb),
    ),
    midDb: Math.max(
      MIXER_EQ_MIN_DB,
      Math.min(MIXER_EQ_MAX_DB, channelState.midDb),
    ),
    highDb: Math.max(
      MIXER_EQ_MIN_DB,
      Math.min(MIXER_EQ_MAX_DB, channelState.highDb),
    ),
    compression: Math.max(
      0,
      Math.min(1, channelState.compression),
    ),
    saturation: Math.max(
      0,
      Math.min(1, channelState.saturation),
    ),
    reverbSend: Math.max(
      0,
      Math.min(1, channelState.reverbSend),
    ),
    sidechain: Math.max(
      0,
      Math.min(1, channelState.sidechain),
    ),
  };
}

export function dbToMixerGain(db: number): number {
  if (!Number.isFinite(db)) return 1;
  return Math.pow(10, db / 20);
}
