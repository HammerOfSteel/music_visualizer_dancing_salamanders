import { describe, expect, it } from 'vitest';
import { activeLyricLine, fadeProgress, type LyricLine } from './lyrics';

const lyrics: LyricLine[] = [
  { start: 0, end: 2, text: 'first line' },
  { start: 3, end: 5, text: 'second line' },
];

describe('activeLyricLine', () => {
  it('returns the line active at a given time', () => {
    expect(activeLyricLine(lyrics, 1)).toEqual(lyrics[0]);
    expect(activeLyricLine(lyrics, 4)).toEqual(lyrics[1]);
  });

  it('returns null between lines (a gap)', () => {
    expect(activeLyricLine(lyrics, 2.5)).toBeNull();
  });

  it('returns null before the first line and after the last', () => {
    expect(activeLyricLine(lyrics, -1)).toBeNull();
    expect(activeLyricLine(lyrics, 10)).toBeNull();
  });

  it('treats line boundaries as inclusive', () => {
    expect(activeLyricLine(lyrics, 0)).toEqual(lyrics[0]);
    expect(activeLyricLine(lyrics, 2)).toEqual(lyrics[0]);
  });
});

describe('fadeProgress', () => {
  const line: LyricLine = { start: 10, end: 12, text: 'sample' };

  it('is 0 exactly at the line start and end', () => {
    expect(fadeProgress(line, 10, 0.6)).toBeCloseTo(0, 5);
    expect(fadeProgress(line, 12, 0.6)).toBeCloseTo(0, 5);
  });

  it('is fully faded in (1) in the middle of a long-enough line', () => {
    expect(fadeProgress(line, 11, 0.6)).toBeCloseTo(1, 5);
  });

  it('ramps linearly during the fade-in window', () => {
    expect(fadeProgress(line, 10.3, 0.6)).toBeCloseTo(0.5, 5);
  });

  it('ramps linearly during the fade-out window', () => {
    expect(fadeProgress(line, 11.7, 0.6)).toBeCloseTo(0.5, 5);
  });

  it('never exceeds 1 even with a very long fadeDuration relative to the line', () => {
    const short: LyricLine = { start: 0, end: 0.2, text: 'x' };
    expect(fadeProgress(short, 0.1, 0.6)).toBeLessThanOrEqual(1);
  });
});
