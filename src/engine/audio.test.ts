import { describe, expect, it } from 'vitest';
import { overallAmplitude, bandEnergy, BeatDetector } from './audio';

describe('overallAmplitude', () => {
  it('returns 0 for an empty buffer', () => {
    expect(overallAmplitude(new Uint8Array([]))).toBe(0);
  });

  it('returns 0 for silence (all-zero buffer)', () => {
    expect(overallAmplitude(new Uint8Array([0, 0, 0, 0]))).toBe(0);
  });

  it('returns 1 for full-scale amplitude (all-255 buffer)', () => {
    expect(overallAmplitude(new Uint8Array([255, 255, 255]))).toBe(1);
  });

  it('averages mixed values into the 0-1 range', () => {
    expect(overallAmplitude(new Uint8Array([0, 255]))).toBeCloseTo(0.5, 5);
  });
});

describe('bandEnergy', () => {
  it('splits a buffer into the requested number of bands', () => {
    const bands = bandEnergy(new Uint8Array([0, 0, 255, 255]), 2);
    expect(bands).toHaveLength(2);
    expect(bands[0]).toBeCloseTo(0, 5);
    expect(bands[1]).toBeCloseTo(1, 5);
  });

  it('handles a bandCount that does not evenly divide the buffer length', () => {
    const bands = bandEnergy(new Uint8Array([255, 255, 255, 0, 0]), 3);
    expect(bands).toHaveLength(3);
    for (const b of bands) expect(b).toBeGreaterThanOrEqual(0);
  });

  it('returns all-zero bands for an empty buffer', () => {
    const bands = bandEnergy(new Uint8Array([]), 4);
    expect(bands).toEqual([0, 0, 0, 0]);
  });
});

describe('BeatDetector', () => {
  it('does not fire on the very first frames before a running average is established', () => {
    const detector = new BeatDetector();
    expect(detector.update(0.9, 1 / 60)).toBe(false);
  });

  it('fires when amplitude spikes well above the smoothed running average', () => {
    const detector = new BeatDetector(1.15, 0.92, 0.25);
    // Warm up the running average with a steady quiet signal.
    for (let i = 0; i < 60; i++) detector.update(0.1, 1 / 60);
    // A sudden loud spike should register as a peak.
    expect(detector.update(0.9, 1 / 60)).toBe(true);
  });

  it('respects the cooldown and does not fire again immediately after a peak', () => {
    const detector = new BeatDetector(1.15, 0.92, 0.25);
    for (let i = 0; i < 60; i++) detector.update(0.1, 1 / 60);
    expect(detector.update(0.9, 1 / 60)).toBe(true);
    // Immediately after firing, still within cooldown — should not re-fire.
    expect(detector.update(0.9, 1 / 60)).toBe(false);
  });
});
