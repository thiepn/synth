import { drumEngine } from "./DrumEngine";
import { sampleAssetStore } from "./SampleAssetStore";
import { drumSoundStore } from "./drumSoundModel";
import type { DrumVoiceId } from "../music/foundationPattern";

export type BundledSampleId =
  | "tr808-kick"
  | "tr808-snare"
  | "tr808-clap"
  | "tr808-closed-hat"
  | "tr808-open-hat"
  | "tr808-tom"
  | "tr808-percussion"
  | "tr808-crash";

export interface BundledSample {
  id: BundledSampleId;
  voice: DrumVoiceId;
  label: string;
  file: string;
  license: "CC0-1.0";
  source: string;
}

export const BUNDLED_SAMPLES: readonly BundledSample[] = [
  { id: "tr808-kick", voice: "kick", label: "808 Classic", file: "generated/tr808/kick.wav", license: "CC0-1.0", source: "tidalcycles/sounds-tr808-fischer" },
  { id: "tr808-snare", voice: "snare", label: "808 Snare", file: "generated/tr808/snare.wav", license: "CC0-1.0", source: "tidalcycles/sounds-tr808-fischer" },
  { id: "tr808-clap", voice: "clap", label: "808 Clap", file: "generated/tr808/clap.wav", license: "CC0-1.0", source: "tidalcycles/sounds-tr808-fischer" },
  { id: "tr808-closed-hat", voice: "closedHat", label: "808 Hat", file: "generated/tr808/closed-hat.wav", license: "CC0-1.0", source: "tidalcycles/sounds-tr808-fischer" },
  { id: "tr808-open-hat", voice: "openHat", label: "808 Open", file: "generated/tr808/open-hat.wav", license: "CC0-1.0", source: "tidalcycles/sounds-tr808-fischer" },
  { id: "tr808-tom", voice: "tom", label: "808 Tom", file: "generated/tr808/tom.wav", license: "CC0-1.0", source: "tidalcycles/sounds-tr808-fischer" },
  { id: "tr808-percussion", voice: "percussion", label: "808 Rim", file: "generated/tr808/percussion.wav", license: "CC0-1.0", source: "tidalcycles/sounds-tr808-fischer" },
  { id: "tr808-crash", voice: "crash", label: "808 Cymbal", file: "generated/tr808/crash.wav", license: "CC0-1.0", source: "tidalcycles/sounds-tr808-fischer" },
] as const;

export function bundledSampleForVoice(
  voice: DrumVoiceId,
): BundledSample | undefined {
  return BUNDLED_SAMPLES.find(
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
