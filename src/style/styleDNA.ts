import type {
  GrooveProfile,
  SceneRole,
} from "../domain/contracts";

export const STYLE_DNA_VERSION = 1 as const;

export type StyleDNAId =
  | "rock"
  | "punk"
  | "metal"
  | "blues"
  | "jazz"
  | "shuffle"
  | "funk"
  | "gospel"
  | "worship"
  | "hipHop"
  | "lofi"
  | "trap"
  | "house"
  | "disco"
  | "techno"
  | "garage"
  | "dnb"
  | "breakbeat"
  | "electronic"
  | "reggae"
  | "afrobeat"
  | "latin"
  | "industrial"
  | "cinematic"
  | "experimental";

export type StyleDNAFamily =
  | "band"
  | "urban"
  | "club"
  | "roots"
  | "experimental";

export type RhythmArchetype =
  | "rock"
  | "funk"
  | "hipHop"
  | "house"
  | "trap"
  | "breakbeat"
  | "electronic";

export type StyleKitDirection =
  | "tight"
  | "huge"
  | "dark"
  | "bright"
  | "clean"
  | "dirty"
  | "electronic"
  | "hybrid"
  | "vintage"
  | "industrial"
  | "experimental";

export type SubdivisionVocabulary =
  | "quarter"
  | "eighth"
  | "sixteenth"
  | "shuffle"
  | "broken"
  | "rolling";

export interface StyleRhythmGrammar {
  fourOnFloor: number;
  kickSyncopation: number;
  backbeatStrength: number;
  halfTime: number;
  clapBlend: number;
  hatSixteenth: number;
  openHat: number;
  percussion: number;
  toms: number;
  crash: number;
  ghostNotes: number;
  ratchets: number;
  flams: number;
}

export interface StyleFillDNA {
  density: number;
  tomBias: number;
  snareBias: number;
  percussionBias: number;
  ratchetBias: number;
  flamBias: number;
}

export interface StyleSoundDNA {
  kitDirection: StyleKitDirection;
  weight: number;
  brightness: number;
  roughness: number;
  synthetic: number;
  tightness: number;
}

export type StyleArrangementEnergy = Record<SceneRole, number>;

export interface StyleDNAProfile {
  version: typeof STYLE_DNA_VERSION;
  id: StyleDNAId;
  label: string;
  code: string;
  family: StyleDNAFamily;
  archetype: RhythmArchetype;
  bpmRange: readonly [number, number];
  subdivision: SubdivisionVocabulary;
  baseSwing: number;
  groove: {
    personality: GrooveProfile["personality"];
    humanization: number;
    ghostNotes: number;
  };
  rhythm: StyleRhythmGrammar;
  fill: StyleFillDNA;
  sound: StyleSoundDNA;
  arrangement: StyleArrangementEnergy;
}

const DEFAULT_RHYTHM: StyleRhythmGrammar = {
  fourOnFloor: 0,
  kickSyncopation: 0.45,
  backbeatStrength: 0.82,
  halfTime: 0,
  clapBlend: 0.18,
  hatSixteenth: 0.28,
  openHat: 0.2,
  percussion: 0.2,
  toms: 0.18,
  crash: 0.32,
  ghostNotes: 0.25,
  ratchets: 0.08,
  flams: 0.08,
};

const DEFAULT_FILL: StyleFillDNA = {
  density: 0.5,
  tomBias: 0.45,
  snareBias: 0.35,
  percussionBias: 0.2,
  ratchetBias: 0.1,
  flamBias: 0.12,
};

const DEFAULT_SOUND: StyleSoundDNA = {
  kitDirection: "hybrid",
  weight: 0.58,
  brightness: 0.55,
  roughness: 0.28,
  synthetic: 0.42,
  tightness: 0.58,
};

const DEFAULT_ARRANGEMENT: StyleArrangementEnergy = {
  intro: 0.26,
  verse: 0.5,
  preChorus: 0.68,
  chorus: 0.86,
  breakdown: 0.28,
  build: 0.76,
  drop: 0.94,
  outro: 0.22,
};

function p(input: {
  id: StyleDNAId;
  label: string;
  code: string;
  family: StyleDNAFamily;
  archetype: RhythmArchetype;
  bpmRange: readonly [number, number];
  subdivision: SubdivisionVocabulary;
  baseSwing?: number;
  personality?: GrooveProfile["personality"];
  humanization?: number;
  ghostNotes?: number;
  rhythm?: Partial<StyleRhythmGrammar>;
  fill?: Partial<StyleFillDNA>;
  sound?: Partial<StyleSoundDNA>;
  arrangement?: Partial<StyleArrangementEnergy>;
}): StyleDNAProfile {
  return {
    version: STYLE_DNA_VERSION,
    id: input.id,
    label: input.label,
    code: input.code,
    family: input.family,
    archetype: input.archetype,
    bpmRange: input.bpmRange,
    subdivision: input.subdivision,
    baseSwing: input.baseSwing ?? 0,
    groove: {
      personality: input.personality ?? "human",
      humanization: input.humanization ?? 0.34,
      ghostNotes: input.ghostNotes ?? 0.22,
    },
    rhythm: {
      ...DEFAULT_RHYTHM,
      ...input.rhythm,
    },
    fill: {
      ...DEFAULT_FILL,
      ...input.fill,
    },
    sound: {
      ...DEFAULT_SOUND,
      ...input.sound,
    },
    arrangement: {
      ...DEFAULT_ARRANGEMENT,
      ...input.arrangement,
    },
  };
}

export const STYLE_DNA_PROFILES: readonly StyleDNAProfile[] = [
  p({
    id: "rock", label: "ROCK", code: "RCK", family: "band",
    archetype: "rock", bpmRange: [82, 160], subdivision: "eighth",
    personality: "human", humanization: 0.28, ghostNotes: 0.18,
    rhythm: { kickSyncopation: 0.38, backbeatStrength: 0.96, crash: 0.72, toms: 0.42, hatSixteenth: 0.1 },
    fill: { density: 0.58, tomBias: 0.7, snareBias: 0.24, flamBias: 0.2 },
    sound: { kitDirection: "hybrid", weight: 0.76, brightness: 0.58, roughness: 0.34, synthetic: 0.14, tightness: 0.62 },
  }),
  p({
    id: "punk", label: "PUNK", code: "PNK", family: "band",
    archetype: "rock", bpmRange: [145, 220], subdivision: "eighth",
    personality: "pushing", humanization: 0.2, ghostNotes: 0.08,
    rhythm: { kickSyncopation: 0.28, backbeatStrength: 1, crash: 0.8, toms: 0.3, hatSixteenth: 0.06 },
    fill: { density: 0.42, tomBias: 0.5, snareBias: 0.42, flamBias: 0.12 },
    sound: { kitDirection: "tight", weight: 0.7, brightness: 0.7, roughness: 0.56, synthetic: 0.08, tightness: 0.84 },
    arrangement: { verse: 0.66, chorus: 0.9, build: 0.82, drop: 0.94 },
  }),
  p({
    id: "metal", label: "METAL", code: "MTL", family: "band",
    archetype: "rock", bpmRange: [95, 210], subdivision: "sixteenth",
    personality: "tight", humanization: 0.16, ghostNotes: 0.12,
    rhythm: { kickSyncopation: 0.72, backbeatStrength: 0.96, hatSixteenth: 0.56, crash: 0.9, toms: 0.62, ratchets: 0.2 },
    fill: { density: 0.76, tomBias: 0.72, snareBias: 0.36, ratchetBias: 0.28 },
    sound: { kitDirection: "huge", weight: 0.94, brightness: 0.64, roughness: 0.52, synthetic: 0.12, tightness: 0.78 },
    arrangement: { intro: 0.42, verse: 0.68, chorus: 0.92, breakdown: 0.42, drop: 1 },
  }),
  p({
    id: "blues", label: "BLUES", code: "BLS", family: "band",
    archetype: "rock", bpmRange: [58, 145], subdivision: "shuffle",
    baseSwing: 0.16, personality: "laidBack", humanization: 0.52, ghostNotes: 0.38,
    rhythm: { kickSyncopation: 0.42, backbeatStrength: 0.88, ghostNotes: 0.54, hatSixteenth: 0.08, crash: 0.28 },
    fill: { density: 0.42, tomBias: 0.42, snareBias: 0.48, flamBias: 0.28 },
    sound: { kitDirection: "vintage", weight: 0.62, brightness: 0.36, roughness: 0.36, synthetic: 0.04, tightness: 0.38 },
  }),
  p({
    id: "jazz", label: "JAZZ", code: "JAZ", family: "band",
    archetype: "funk", bpmRange: [70, 220], subdivision: "shuffle",
    baseSwing: 0.2, personality: "loose", humanization: 0.72, ghostNotes: 0.58,
    rhythm: { kickSyncopation: 0.62, backbeatStrength: 0.42, clapBlend: 0, hatSixteenth: 0.22, openHat: 0.48, percussion: 0.16, ghostNotes: 0.72, crash: 0.22 },
    fill: { density: 0.62, tomBias: 0.45, snareBias: 0.48, percussionBias: 0.32, flamBias: 0.3 },
    sound: { kitDirection: "vintage", weight: 0.48, brightness: 0.52, roughness: 0.22, synthetic: 0.02, tightness: 0.28 },
    arrangement: { verse: 0.48, chorus: 0.72, breakdown: 0.3, build: 0.64, drop: 0.78 },
  }),
  p({
    id: "shuffle", label: "SHUFFLE", code: "SHF", family: "band",
    archetype: "funk", bpmRange: [70, 155], subdivision: "shuffle",
    baseSwing: 0.18, personality: "deep", humanization: 0.56, ghostNotes: 0.46,
    rhythm: { kickSyncopation: 0.58, backbeatStrength: 0.88, ghostNotes: 0.58, openHat: 0.34, percussion: 0.28 },
    fill: { density: 0.54, tomBias: 0.5, snareBias: 0.42, flamBias: 0.26 },
    sound: { kitDirection: "vintage", weight: 0.64, brightness: 0.45, roughness: 0.34, synthetic: 0.06, tightness: 0.38 },
  }),
  p({
    id: "funk", label: "FUNK", code: "FNK", family: "band",
    archetype: "funk", bpmRange: [82, 128], subdivision: "sixteenth",
    baseSwing: 0.08, personality: "deep", humanization: 0.58, ghostNotes: 0.62,
    rhythm: { kickSyncopation: 0.86, backbeatStrength: 0.9, ghostNotes: 0.8, hatSixteenth: 0.72, openHat: 0.36, percussion: 0.42, crash: 0.16 },
    fill: { density: 0.62, tomBias: 0.28, snareBias: 0.44, percussionBias: 0.52, flamBias: 0.22 },
    sound: { kitDirection: "tight", weight: 0.62, brightness: 0.58, roughness: 0.24, synthetic: 0.12, tightness: 0.72 },
  }),
  p({
    id: "gospel", label: "GOSPEL", code: "GSP", family: "band",
    archetype: "funk", bpmRange: [68, 145], subdivision: "sixteenth",
    baseSwing: 0.06, personality: "human", humanization: 0.64, ghostNotes: 0.66,
    rhythm: { kickSyncopation: 0.72, backbeatStrength: 0.94, ghostNotes: 0.78, hatSixteenth: 0.62, openHat: 0.4, toms: 0.58, crash: 0.58, flams: 0.24 },
    fill: { density: 0.82, tomBias: 0.58, snareBias: 0.52, percussionBias: 0.24, ratchetBias: 0.22, flamBias: 0.4 },
    sound: { kitDirection: "huge", weight: 0.78, brightness: 0.62, roughness: 0.26, synthetic: 0.06, tightness: 0.5 },
    arrangement: { verse: 0.5, chorus: 0.9, build: 0.88, drop: 0.98 },
  }),
  p({
    id: "worship", label: "WORSHIP", code: "WSP", family: "band",
    archetype: "rock", bpmRange: [58, 138], subdivision: "eighth",
    personality: "human", humanization: 0.4, ghostNotes: 0.22,
    rhythm: { kickSyncopation: 0.26, backbeatStrength: 0.92, openHat: 0.34, crash: 0.66, toms: 0.38, hatSixteenth: 0.08 },
    fill: { density: 0.46, tomBias: 0.64, snareBias: 0.26, flamBias: 0.16 },
    sound: { kitDirection: "huge", weight: 0.72, brightness: 0.6, roughness: 0.14, synthetic: 0.08, tightness: 0.48 },
    arrangement: { intro: 0.18, verse: 0.38, preChorus: 0.62, chorus: 0.86, breakdown: 0.2, build: 0.82, drop: 0.94, outro: 0.16 },
  }),
  p({
    id: "hipHop", label: "HIP-HOP", code: "HHP", family: "urban",
    archetype: "hipHop", bpmRange: [68, 108], subdivision: "eighth",
    baseSwing: 0.06, personality: "deep", humanization: 0.52, ghostNotes: 0.38,
    rhythm: { kickSyncopation: 0.7, backbeatStrength: 0.94, clapBlend: 0.42, hatSixteenth: 0.32, ghostNotes: 0.42, crash: 0.08 },
    fill: { density: 0.36, tomBias: 0.14, snareBias: 0.44, percussionBias: 0.3, ratchetBias: 0.08 },
    sound: { kitDirection: "dirty", weight: 0.78, brightness: 0.42, roughness: 0.48, synthetic: 0.34, tightness: 0.5 },
  }),
  p({
    id: "lofi", label: "LO-FI", code: "LOF", family: "urban",
    archetype: "hipHop", bpmRange: [62, 92], subdivision: "eighth",
    baseSwing: 0.1, personality: "laidBack", humanization: 0.72, ghostNotes: 0.48,
    rhythm: { kickSyncopation: 0.52, backbeatStrength: 0.78, clapBlend: 0.22, hatSixteenth: 0.2, ghostNotes: 0.52, crash: 0.02 },
    fill: { density: 0.28, tomBias: 0.1, snareBias: 0.48, percussionBias: 0.26, flamBias: 0.12 },
    sound: { kitDirection: "vintage", weight: 0.64, brightness: 0.26, roughness: 0.56, synthetic: 0.24, tightness: 0.28 },
    arrangement: { intro: 0.18, verse: 0.42, chorus: 0.58, breakdown: 0.24, build: 0.5, drop: 0.62, outro: 0.16 },
  }),
  p({
    id: "trap", label: "TRAP", code: "TRP", family: "urban",
    archetype: "trap", bpmRange: [120, 170], subdivision: "rolling",
    baseSwing: 0.02, personality: "tight", humanization: 0.18, ghostNotes: 0.12,
    rhythm: { kickSyncopation: 0.88, backbeatStrength: 0.9, halfTime: 0.72, clapBlend: 0.78, hatSixteenth: 0.96, openHat: 0.42, ratchets: 0.9, crash: 0.08 },
    fill: { density: 0.56, tomBias: 0.08, snareBias: 0.34, percussionBias: 0.3, ratchetBias: 0.9, flamBias: 0.06 },
    sound: { kitDirection: "electronic", weight: 0.9, brightness: 0.64, roughness: 0.32, synthetic: 0.9, tightness: 0.82 },
  }),
  p({
    id: "house", label: "HOUSE", code: "HSE", family: "club",
    archetype: "house", bpmRange: [116, 132], subdivision: "eighth",
    personality: "tight", humanization: 0.16, ghostNotes: 0.08,
    rhythm: { fourOnFloor: 1, kickSyncopation: 0.06, backbeatStrength: 0.92, clapBlend: 0.82, openHat: 0.92, percussion: 0.34, crash: 0.36 },
    fill: { density: 0.34, tomBias: 0.16, snareBias: 0.28, percussionBias: 0.5, ratchetBias: 0.12 },
    sound: { kitDirection: "clean", weight: 0.72, brightness: 0.7, roughness: 0.12, synthetic: 0.76, tightness: 0.88 },
  }),
  p({
    id: "disco", label: "DISCO", code: "DSC", family: "club",
    archetype: "house", bpmRange: [108, 128], subdivision: "eighth",
    personality: "human", humanization: 0.28, ghostNotes: 0.14,
    rhythm: { fourOnFloor: 0.96, kickSyncopation: 0.08, backbeatStrength: 0.96, clapBlend: 0.5, openHat: 0.82, percussion: 0.48, crash: 0.42 },
    fill: { density: 0.46, tomBias: 0.24, snareBias: 0.3, percussionBias: 0.56, flamBias: 0.16 },
    sound: { kitDirection: "bright", weight: 0.62, brightness: 0.84, roughness: 0.14, synthetic: 0.38, tightness: 0.7 },
  }),
  p({
    id: "techno", label: "TECHNO", code: "TCH", family: "club",
    archetype: "house", bpmRange: [124, 145], subdivision: "sixteenth",
    personality: "mechanical", humanization: 0.04, ghostNotes: 0.02,
    rhythm: { fourOnFloor: 1, kickSyncopation: 0.04, backbeatStrength: 0.62, clapBlend: 0.38, hatSixteenth: 0.5, openHat: 0.74, percussion: 0.62, crash: 0.18, ratchets: 0.3 },
    fill: { density: 0.42, tomBias: 0.12, snareBias: 0.12, percussionBias: 0.72, ratchetBias: 0.38 },
    sound: { kitDirection: "electronic", weight: 0.9, brightness: 0.66, roughness: 0.34, synthetic: 0.98, tightness: 0.92 },
    arrangement: { intro: 0.34, verse: 0.58, preChorus: 0.72, chorus: 0.82, breakdown: 0.22, build: 0.86, drop: 0.99, outro: 0.28 },
  }),
  p({
    id: "garage", label: "GARAGE", code: "UKG", family: "club",
    archetype: "breakbeat", bpmRange: [126, 138], subdivision: "shuffle",
    baseSwing: 0.12, personality: "deep", humanization: 0.36, ghostNotes: 0.3,
    rhythm: { fourOnFloor: 0.24, kickSyncopation: 0.82, backbeatStrength: 0.9, clapBlend: 0.7, hatSixteenth: 0.5, openHat: 0.5, percussion: 0.54, ghostNotes: 0.38 },
    fill: { density: 0.5, tomBias: 0.12, snareBias: 0.38, percussionBias: 0.62, ratchetBias: 0.18 },
    sound: { kitDirection: "hybrid", weight: 0.72, brightness: 0.66, roughness: 0.28, synthetic: 0.68, tightness: 0.72 },
  }),
  p({
    id: "dnb", label: "DRUM & BASS", code: "DNB", family: "club",
    archetype: "breakbeat", bpmRange: [160, 180], subdivision: "sixteenth",
    personality: "tight", humanization: 0.18, ghostNotes: 0.34,
    rhythm: { kickSyncopation: 0.76, backbeatStrength: 0.96, hatSixteenth: 0.78, openHat: 0.44, percussion: 0.44, ghostNotes: 0.48, ratchets: 0.34, crash: 0.24 },
    fill: { density: 0.72, tomBias: 0.12, snareBias: 0.62, percussionBias: 0.46, ratchetBias: 0.5, flamBias: 0.12 },
    sound: { kitDirection: "electronic", weight: 0.84, brightness: 0.7, roughness: 0.42, synthetic: 0.84, tightness: 0.88 },
    arrangement: { verse: 0.62, chorus: 0.9, breakdown: 0.2, build: 0.86, drop: 0.99 },
  }),
  p({
    id: "breakbeat", label: "BREAKS", code: "BRK", family: "club",
    archetype: "breakbeat", bpmRange: [105, 145], subdivision: "broken",
    baseSwing: 0.04, personality: "human", humanization: 0.36, ghostNotes: 0.36,
    rhythm: { kickSyncopation: 0.74, backbeatStrength: 0.9, hatSixteenth: 0.42, openHat: 0.34, percussion: 0.42, ghostNotes: 0.42 },
    fill: { density: 0.58, tomBias: 0.18, snareBias: 0.52, percussionBias: 0.46, ratchetBias: 0.2 },
    sound: { kitDirection: "dirty", weight: 0.72, brightness: 0.56, roughness: 0.48, synthetic: 0.48, tightness: 0.58 },
  }),
  p({
    id: "electronic", label: "ELECTRO", code: "ELC", family: "club",
    archetype: "electronic", bpmRange: [95, 145], subdivision: "sixteenth",
    personality: "tight", humanization: 0.14, ghostNotes: 0.1,
    rhythm: { fourOnFloor: 0.42, kickSyncopation: 0.54, backbeatStrength: 0.78, clapBlend: 0.62, hatSixteenth: 0.58, openHat: 0.42, percussion: 0.6, ratchets: 0.34 },
    fill: { density: 0.62, tomBias: 0.08, snareBias: 0.22, percussionBias: 0.7, ratchetBias: 0.44 },
    sound: { kitDirection: "electronic", weight: 0.7, brightness: 0.72, roughness: 0.28, synthetic: 0.94, tightness: 0.8 },
  }),
  p({
    id: "reggae", label: "REGGAE", code: "REG", family: "roots",
    archetype: "funk", bpmRange: [62, 105], subdivision: "eighth",
    baseSwing: 0.04, personality: "laidBack", humanization: 0.58, ghostNotes: 0.28,
    rhythm: { kickSyncopation: 0.38, backbeatStrength: 0.7, halfTime: 0.5, clapBlend: 0.08, hatSixteenth: 0.16, openHat: 0.4, percussion: 0.44, crash: 0.08 },
    fill: { density: 0.42, tomBias: 0.44, snareBias: 0.3, percussionBias: 0.46, flamBias: 0.16 },
    sound: { kitDirection: "vintage", weight: 0.68, brightness: 0.38, roughness: 0.28, synthetic: 0.08, tightness: 0.36 },
    arrangement: { verse: 0.44, chorus: 0.66, breakdown: 0.24, build: 0.58, drop: 0.72 },
  }),
  p({
    id: "afrobeat", label: "AFROBEAT", code: "AFR", family: "roots",
    archetype: "funk", bpmRange: [90, 125], subdivision: "sixteenth",
    baseSwing: 0.05, personality: "human", humanization: 0.54, ghostNotes: 0.36,
    rhythm: { kickSyncopation: 0.7, backbeatStrength: 0.66, clapBlend: 0.18, hatSixteenth: 0.58, openHat: 0.34, percussion: 0.92, toms: 0.38, ghostNotes: 0.38 },
    fill: { density: 0.58, tomBias: 0.24, snareBias: 0.18, percussionBias: 0.82, flamBias: 0.16 },
    sound: { kitDirection: "hybrid", weight: 0.6, brightness: 0.62, roughness: 0.22, synthetic: 0.12, tightness: 0.54 },
  }),
  p({
    id: "latin", label: "LATIN", code: "LAT", family: "roots",
    archetype: "funk", bpmRange: [90, 145], subdivision: "sixteenth",
    personality: "human", humanization: 0.42, ghostNotes: 0.26,
    rhythm: { kickSyncopation: 0.58, backbeatStrength: 0.6, clapBlend: 0.12, hatSixteenth: 0.44, openHat: 0.3, percussion: 0.96, toms: 0.54, ghostNotes: 0.26 },
    fill: { density: 0.66, tomBias: 0.34, snareBias: 0.14, percussionBias: 0.88, flamBias: 0.2 },
    sound: { kitDirection: "bright", weight: 0.58, brightness: 0.72, roughness: 0.18, synthetic: 0.08, tightness: 0.62 },
  }),
  p({
    id: "industrial", label: "INDUSTRIAL", code: "IND", family: "experimental",
    archetype: "electronic", bpmRange: [90, 155], subdivision: "broken",
    personality: "mechanical", humanization: 0.08, ghostNotes: 0.04,
    rhythm: { fourOnFloor: 0.36, kickSyncopation: 0.62, backbeatStrength: 0.66, clapBlend: 0.18, hatSixteenth: 0.38, percussion: 0.82, toms: 0.52, crash: 0.46, ratchets: 0.48, flams: 0.16 },
    fill: { density: 0.76, tomBias: 0.34, snareBias: 0.2, percussionBias: 0.74, ratchetBias: 0.58 },
    sound: { kitDirection: "industrial", weight: 0.9, brightness: 0.64, roughness: 0.94, synthetic: 0.92, tightness: 0.74 },
  }),
  p({
    id: "cinematic", label: "CINEMATIC", code: "CIN", family: "experimental",
    archetype: "electronic", bpmRange: [55, 130], subdivision: "broken",
    personality: "human", humanization: 0.32, ghostNotes: 0.1,
    rhythm: { fourOnFloor: 0.08, kickSyncopation: 0.38, backbeatStrength: 0.4, hatSixteenth: 0.12, openHat: 0.24, percussion: 0.62, toms: 0.76, crash: 0.74, flams: 0.3 },
    fill: { density: 0.68, tomBias: 0.78, snareBias: 0.2, percussionBias: 0.42, flamBias: 0.4 },
    sound: { kitDirection: "huge", weight: 0.9, brightness: 0.44, roughness: 0.26, synthetic: 0.54, tightness: 0.3 },
    arrangement: { intro: 0.16, verse: 0.4, preChorus: 0.64, chorus: 0.82, breakdown: 0.12, build: 0.86, drop: 1, outro: 0.12 },
  }),
  p({
    id: "experimental", label: "EXPERIMENTAL", code: "EXP", family: "experimental",
    archetype: "electronic", bpmRange: [60, 180], subdivision: "broken",
    baseSwing: 0.03, personality: "loose", humanization: 0.66, ghostNotes: 0.42,
    rhythm: { fourOnFloor: 0.2, kickSyncopation: 0.88, backbeatStrength: 0.42, clapBlend: 0.34, hatSixteenth: 0.58, openHat: 0.52, percussion: 0.9, toms: 0.74, crash: 0.44, ghostNotes: 0.56, ratchets: 0.76, flams: 0.42 },
    fill: { density: 0.9, tomBias: 0.54, snareBias: 0.42, percussionBias: 0.72, ratchetBias: 0.82, flamBias: 0.54 },
    sound: { kitDirection: "experimental", weight: 0.64, brightness: 0.62, roughness: 0.72, synthetic: 0.96, tightness: 0.28 },
    arrangement: { intro: 0.28, verse: 0.52, preChorus: 0.46, chorus: 0.76, breakdown: 0.18, build: 0.9, drop: 0.96, outro: 0.22 },
  }),
];

const BY_ID = new Map(
  STYLE_DNA_PROFILES.map((profile) => [profile.id, profile]),
);

export function getStyleDNA(id: StyleDNAId): StyleDNAProfile {
  return BY_ID.get(id) ?? STYLE_DNA_PROFILES[0]!;
}

export function isStyleDNAId(value: string): value is StyleDNAId {
  return BY_ID.has(value as StyleDNAId);
}

export function styleIdFromVector(
  vector: Record<string, number> | undefined,
): StyleDNAId | undefined {
  if (!vector) return undefined;

  const strongest = Object.entries(vector)
    .filter(([id]) => isStyleDNAId(id))
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  return strongest && isStyleDNAId(strongest)
    ? strongest
    : undefined;
}

export function styleFamilyLabel(family: StyleDNAFamily): string {
  switch (family) {
    case "band": return "BAND / HUMAN";
    case "urban": return "HIP-HOP / URBAN";
    case "club": return "CLUB / ELECTRONIC";
    case "roots": return "ROOTS / GLOBAL";
    case "experimental": return "CINEMATIC / EXPERIMENTAL";
  }
}
