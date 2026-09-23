import { audioTransport } from "../audio/AudioTransport";
import { drumEngine } from "../audio/DrumEngine";
import { arrangementPlaybackStore } from "../arrange/ArrangementPlaybackStore";
import { chaosStore } from "../chaos/ChaosStore";
import type { DrumVoiceId } from "../music/foundationPattern";
import {
  performanceStore,
  type PerformanceMacroId,
  type PerformanceMomentaryId,
} from "../performance/PerformanceStore";

export type TransportActionId = "toggle" | "stop";

export type ExternalActionTarget =
  | { kind: "pad"; voice: DrumVoiceId }
  | { kind: "macro"; macro: PerformanceMacroId }
  | { kind: "chaos" }
  | { kind: "momentary"; action: PerformanceMomentaryId }
  | { kind: "fill" }
  | { kind: "scene"; sectionId: string }
  | { kind: "transport"; action: TransportActionId };

export class InputActionRouter {
  async trigger(
    target: ExternalActionTarget,
    value = 1,
  ): Promise<void> {
    const normalized = Math.max(0, Math.min(1, value));

    switch (target.kind) {
      case "pad":
        await drumEngine.triggerNow(
          target.voice,
          Math.max(0.05, normalized),
        );
        return;
      case "macro":
        performanceStore.setMacro(target.macro, normalized);
        return;
      case "chaos":
        chaosStore.setIntensity(normalized);
        return;
      case "momentary":
        if (normalized > 0.001) {
          performanceStore.pressMomentary(target.action);
        } else {
          performanceStore.releaseMomentary(target.action);
        }
        return;
      case "fill":
        if (normalized > 0.001) {
          performanceStore.triggerFill();
        }
        return;
      case "scene":
        if (normalized > 0.001) {
          const tick =
            arrangementPlaybackStore.queueSection(target.sectionId) ??
            audioTransport.getCurrentAbsoluteTick();
          performanceStore.recordSceneLaunch(target.sectionId, tick);
        }
        return;
      case "transport":
        if (normalized <= 0.001) return;
        if (target.action === "stop") {
          arrangementPlaybackStore.stop();
          audioTransport.stop();
        } else {
          const arrangement = arrangementPlaybackStore.getSnapshot();
          if (arrangement.engaged) {
            await arrangementPlaybackStore.toggle();
          } else {
            await audioTransport.toggle();
          }
        }
        return;
    }
  }

  release(target: ExternalActionTarget): void {
    if (target.kind === "momentary") {
      performanceStore.releaseMomentary(target.action);
    }
  }
}

export const inputActionRouter = new InputActionRouter();
