import { PPQ, type Meter } from "../domain/contracts";

export const MIN_BPM = 30;
export const MAX_BPM = 300;
export const MIN_LOOP_BARS = 1;
export const MAX_LOOP_BARS = 32;
export const DEFAULT_LOOP_BARS = 4;

export interface MusicalPosition {
  absoluteTick: number;
  loopTick: number;
  barIndex: number;
  beatIndex: number;
  tickInBeat: number;
  loopProgress: number;
  beatOrdinal: number;
}

export function clampBpm(value: number): number {
  if (!Number.isFinite(value)) return 128;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, value));
}

export function normalizeMeter(meter: Meter): Meter {
  const numerator = Math.min(16, Math.max(1, Math.round(meter.numerator)));
  const denominator = [1, 2, 4, 8, 16].includes(meter.denominator)
    ? meter.denominator
    : 4;

  return { numerator, denominator };
}

export function normalizeLoopBars(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LOOP_BARS;
  return Math.min(MAX_LOOP_BARS, Math.max(MIN_LOOP_BARS, Math.round(value)));
}

export function ticksPerQuarter(): number {
  return PPQ;
}

export function ticksPerBeat(meter: Meter): number {
  const safe = normalizeMeter(meter);
  return PPQ * (4 / safe.denominator);
}

export function ticksPerBar(meter: Meter): number {
  const safe = normalizeMeter(meter);
  return ticksPerBeat(safe) * safe.numerator;
}

export function ticksPerLoop(meter: Meter, loopBars: number): number {
  return ticksPerBar(meter) * normalizeLoopBars(loopBars);
}

export function ticksPerSecond(bpm: number): number {
  return (PPQ * clampBpm(bpm)) / 60;
}

export function secondsPerTick(bpm: number): number {
  return 1 / ticksPerSecond(bpm);
}

export function wrapTick(tick: number, lengthTicks: number): number {
  if (!Number.isFinite(tick) || !Number.isFinite(lengthTicks) || lengthTicks <= 0) {
    return 0;
  }

  const wrapped = tick % lengthTicks;
  return wrapped < 0 ? wrapped + lengthTicks : wrapped;
}

export function musicalPositionFromTick(
  absoluteTick: number,
  meter: Meter,
  loopBars: number,
): MusicalPosition {
  const safeMeter = normalizeMeter(meter);
  const beatTicks = ticksPerBeat(safeMeter);
  const barTicks = ticksPerBar(safeMeter);
  const loopTicks = ticksPerLoop(safeMeter, loopBars);
  const safeAbsoluteTick = Math.max(0, Number.isFinite(absoluteTick) ? absoluteTick : 0);
  const loopTick = wrapTick(safeAbsoluteTick, loopTicks);
  const tickInBar = loopTick % barTicks;
  const barIndex = Math.floor(loopTick / barTicks);
  const beatIndex = Math.min(
    safeMeter.numerator - 1,
    Math.floor(tickInBar / beatTicks),
  );
  const tickInBeat = tickInBar - beatIndex * beatTicks;

  return {
    absoluteTick: safeAbsoluteTick,
    loopTick,
    barIndex,
    beatIndex,
    tickInBeat,
    loopProgress: loopTicks > 0 ? loopTick / loopTicks : 0,
    beatOrdinal: Math.floor(safeAbsoluteTick / beatTicks),
  };
}

export function formatMusicalPosition(position: MusicalPosition): string {
  const bar = String(position.barIndex + 1).padStart(2, "0");
  const beat = String(position.beatIndex + 1).padStart(2, "0");
  const tick = String(Math.floor(position.tickInBeat)).padStart(3, "0");
  return `${bar}:${beat}:${tick}`;
}
