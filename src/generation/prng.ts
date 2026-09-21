export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0 || 0x9e3779b9;
}

export class SeededRandom {
  private state: number;

  constructor(seed: string | number) {
    this.state =
      typeof seed === "number"
        ? seed >>> 0 || 0x9e3779b9
        : hashSeed(seed);
  }

  next(): number {
    let state = this.state;
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    this.state = state >>> 0;
    return this.state / 4294967296;
  }

  chance(probability: number): boolean {
    const safe = Math.min(1, Math.max(0, probability));
    return this.next() < safe;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    const low = Math.ceil(min);
    const high = Math.floor(maxInclusive);
    if (high <= low) return low;
    return low + Math.floor(this.next() * (high - low + 1));
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) {
      throw new Error("Cannot pick from an empty deterministic collection.");
    }

    return values[this.int(0, values.length - 1)];
  }
}

export function deriveSeed(seed: string, label: string): string {
  return seed + "::" + label;
}

export function shortSeed(seed: string): string {
  const value = hashSeed(seed).toString(16).toUpperCase().padStart(8, "0");
  return value.slice(0, 6);
}
