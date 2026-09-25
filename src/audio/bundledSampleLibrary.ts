import { drumEngine } from "./DrumEngine";
import { sampleAssetStore } from "./SampleAssetStore";
import { drumSoundStore } from "./drumSoundModel";
import type { DrumVoiceId } from "../music/foundationPattern";

export type BundledSampleId =
  "tr808-kick-short"
  | "tr808-kick"
  | "tr808-kick-long"
  | "tr808-snare-dry"
  | "tr808-snare"
  | "tr808-snare-snap"
  | "tr808-clap"
  | "tr808-closed-hat"
  | "tr808-open-hat-short"
  | "tr808-open-hat"
  | "tr808-open-hat-long"
  | "tr808-tom-low"
  | "tr808-tom"
  | "tr808-tom-high"
  | "tr808-percussion"
  | "tr808-percussion-claves"
  | "tr808-percussion-cowbell"
  | "tr808-percussion-maracas"
  | "tr808-crash-short"
  | "tr808-crash"
  | "tr808-crash-long";

export interface BundledSample {
  id: BundledSampleId;
  voice: DrumVoiceId;
  label: string;
  file: string;
  license: "CC0-1.0";
  source: string;
}

const SAMPLE_SOURCE = "tidalcycles/sounds-tr808-fischer";

export const BUNDLED_SAMPLES: readonly BundledSample[] = [
  { id: "tr808-kick-short", voice: "kick", label: "808 Short", file: "generated/tr808/kick-short.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
  { id: "tr808-kick", voice: "kick", label: "808 Classic", file: "generated/tr808/kick.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
  { id: "tr808-kick-long", voice: "kick", label: "808 Long", file: "generated/tr808/kick-long.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
  { id: "tr808-snare-dry", voice: "snare", label: "808 Dry", file: "generated/tr808/snare-dry.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
  { id: "tr808-snare", voice: "snare", label: "808 Snare", file: "generated/tr808/snare.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
  { id: "tr808-snare-snap", voice: "snare", label: "808 Snap", file: "generated/tr808/snare-snap.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
  { id: "tr808-clap", voice: "clap", label: "808 Clap", file: "generated/tr808/clap.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
  { id: "tr808-closed-hat", voice: "closedHat", label: "808 Hat", file: "generated/tr808/closed-hat.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
  { id: "tr808-open-hat-short", voice: "openHat", label: "808 Open Short", file: "generated/tr808/open-hat-short.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
  { id: "tr808-open-hat", voice: "openHat", label: "808 Open", file: "generated/tr808/open-hat.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
  { id: "tr808-open-hat-long", voice: "openHat", label: "808 Open Long", file: "generated/tr808/open-hat-long.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
  { id: "tr808-tom-low", voice: "tom", label: "808 Tom Low", file: "generated/tr808/tom-low.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
  { id: "tr808-tom", voice: "tom", label: "808 Tom", file: "generated/tr808/tom.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
  { id: "tr808-tom-high", voice: "tom", label: "808 Tom High", file: "generated/tr808/tom-high.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
  { id: "tr808-percussion", voice: "percussion", label: "808 Rim", file: "generated/tr808/percussion.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
  { id: "tr808-percussion-claves", voice: "percussion", label: "808 Claves", file: "generated/tr808/claves.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
  { id: "tr808-percussion-cowbell", voice: "percussion", label: "808 Cowbell", file: "generated/tr808/cowbell.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
  { id: "tr808-percussion-maracas", voice: "percussion", label: "808 Maracas", file: "generated/tr808/maracas.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
  { id: "tr808-crash-short", voice: "crash", label: "808 Cymbal Short", file: "generated/tr808/crash-short.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
  { id: "tr808-crash", voice: "crash", label: "808 Cymbal", file: "generated/tr808/crash.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
  { id: "tr808-crash-long", voice: "crash", label: "808 Cymbal Long", file: "generated/tr808/crash-long.wav", license: "CC0-1.0", source: SAMPLE_SOURCE },
] as const;

export function bundledSampleById(
  id: BundledSampleId,
): BundledSample | undefined {
  return BUNDLED_SAMPLES.find(
    (sample) => sample.id === id,
  );
}

export function bundledSamplesForVoice(
  voice: DrumVoiceId,
): BundledSample[] {
  return BUNDLED_SAMPLES.filter(
    (sample) => sample.voice === voice,
  );
}

export async function applyBundledSample(
  sample: BundledSample,
): Promise<void> {
  const url = new URL(
    "./samples/" + sample.file,
    document.baseURI,
  );
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      "Built-in sound could not be loaded.",
    );
  }

  const state = await sampleAssetStore.importBytes(
    await response.arrayBuffer(),
    sample.label + ".wav",
    "audio/wav",
    {
      origin: "bundled",
      bundledSampleId: sample.id,
    },
  );

  await drumEngine.prepareSampleAsset(
    state.reference.id,
  );
  const prepared =
    sampleAssetStore.getAsset(state.reference.id);

  drumSoundStore.assignSample(
    sample.voice,
    state.reference.id,
    prepared?.reference.durationSeconds,
  );
}
