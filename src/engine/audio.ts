/**
 * Pure live-audio analysis logic — no Web Audio/DOM dependencies, per the
 * design spec's `engine/` module for bucketing `AnalyserNode` frequency data.
 * Kept easily unit-testable in isolation from the AnalyserNode itself.
 */

/** Overall amplitude envelope (0-1) from a frequency-domain byte buffer. */
export function overallAmplitude(freqData: Uint8Array): number {
  if (freqData.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < freqData.length; i++) sum += freqData[i];
  return sum / freqData.length / 255;
}

/** Buckets frequency-domain byte data into `bandCount` averaged bands (0-1 each). */
export function bandEnergy(freqData: Uint8Array, bandCount: number): number[] {
  const bands = new Array<number>(bandCount).fill(0);
  const bucketSize = Math.floor(freqData.length / bandCount) || 1;
  for (let b = 0; b < bandCount; b++) {
    let sum = 0;
    const start = b * bucketSize;
    const end = Math.min(freqData.length, start + bucketSize);
    for (let i = start; i < end; i++) sum += freqData[i];
    bands[b] = (end > start ? sum / (end - start) : 0) / 255;
  }
  return bands;
}

/**
 * Simple rising-edge beat/energy-peak detector: fires when amplitude rises
 * above a smoothed running average by `sensitivity`, with a cooldown so a
 * single swell doesn't fire repeatedly on every frame.
 */
export class BeatDetector {
  private runningAvg = 0;
  private cooldownRemaining = 0;

  constructor(
    private readonly sensitivity = 1.15,
    private readonly smoothing = 0.92,
    private readonly cooldownSeconds = 0.25,
  ) {}

  /** Call once per frame with the current amplitude (0-1) and delta time. */
  update(amplitude: number, dt: number): boolean {
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
    const isPeak =
      this.cooldownRemaining <= 0 &&
      this.runningAvg > 0.02 &&
      amplitude > this.runningAvg * this.sensitivity;
    this.runningAvg = this.runningAvg * this.smoothing + amplitude * (1 - this.smoothing);
    if (isPeak) this.cooldownRemaining = this.cooldownSeconds;
    return isPeak;
  }
}
