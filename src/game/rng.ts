export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let value = (this.state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  between(minimum: number, maximum: number): number {
    return minimum + this.next() * (maximum - minimum);
  }

  integer(minimum: number, maximum: number): number {
    return Math.floor(this.between(minimum, maximum + 1));
  }
}

export function createRunSeed(): number {
  try {
    const values = new Uint32Array(1);
    globalThis.crypto?.getRandomValues(values);
    if (values[0] !== undefined) return values[0];
  } catch {
    // A seeded fallback keeps gameplay available in restricted browser contexts.
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffff_ffff)) >>> 0;
}
