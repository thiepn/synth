function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Expressive drum amplitude curve.
 * Keeps ordinary hits close to the previous level while giving ghost notes
 * substantially more headroom below full accents.
 */
export function drumVelocityGain(
  velocity: number,
): number {
  const safe = clamp01(velocity);
  return 0.06 + Math.pow(safe, 0.9) * 0.94;
}

/**
 * Softer hits are slightly darker; hard accents open the tone modestly.
 * This is deliberately subtle so material/preset tone remains authoritative.
 */
export function drumVelocityTone(
  baseTone: number,
  velocity: number,
): number {
  const safe = clamp01(velocity);
  return clamp01(
    baseTone + (safe - 0.72) * 0.18,
  );
}

/**
 * Low-velocity hits soften the transient without erasing the authored
 * impact character of a preset.
 */
export function drumVelocityImpact(
  baseImpact: number,
  velocity: number,
): number {
  const safe = clamp01(velocity);
  return clamp01(
    baseImpact *
      (0.72 + Math.sqrt(safe) * 0.28),
  );
}
