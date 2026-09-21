import type { RhythmGlyphGeometry } from "./rhythmGlyph";

export interface RhythmGlyphDistance {
  total: number;
  density: number;
  syncopation: number;
  velocity: number;
  swing: number;
  instrumentation: number;
  microtiming: number;
}

function difference(a: number, b: number): number {
  return Math.abs(a - b);
}

export function rhythmGlyphDistance(
  a: RhythmGlyphGeometry,
  b: RhythmGlyphGeometry,
): RhythmGlyphDistance {
  const density = difference(a.metrics.density, b.metrics.density);
  const syncopation = difference(
    a.metrics.syncopation,
    b.metrics.syncopation,
  );
  const velocity =
    difference(a.metrics.meanVelocity, b.metrics.meanVelocity) * 0.55 +
    difference(
      a.metrics.velocityContrast,
      b.metrics.velocityContrast,
    ) *
      0.45;
  const swing = difference(a.metrics.swing, b.metrics.swing);
  const instrumentation =
    difference(a.metrics.kickActivity, b.metrics.kickActivity) * 0.24 +
    difference(
      a.metrics.backbeatActivity,
      b.metrics.backbeatActivity,
    ) *
      0.24 +
    difference(a.metrics.hatActivity, b.metrics.hatActivity) * 0.28 +
    difference(
      a.metrics.percussionActivity,
      b.metrics.percussionActivity,
    ) *
      0.24;
  const microtiming = difference(
    a.metrics.microtiming,
    b.metrics.microtiming,
  );

  return {
    total:
      density * 0.2 +
      syncopation * 0.22 +
      velocity * 0.12 +
      swing * 0.12 +
      instrumentation * 0.26 +
      microtiming * 0.08,
    density,
    syncopation,
    velocity,
    swing,
    instrumentation,
    microtiming,
  };
}
