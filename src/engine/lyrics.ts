/**
 * Pure lyrics-timing logic — no DOM/rendering dependencies, per the design
 * spec's `engine/lyrics.ts`. Kept easily unit-testable in isolation.
 */

export interface LyricLine {
  start: number;
  end: number;
  text: string;
}

/** The lyric line active at `currentTime`, or null if between/outside lines. */
export function activeLyricLine(lyrics: LyricLine[], currentTime: number): LyricLine | null {
  for (const line of lyrics) {
    if (currentTime >= line.start && currentTime <= line.end) return line;
  }
  return null;
}

/**
 * Soft fade in/out easing near a line's start/end boundaries.
 * Returns 0 (fully hidden) to 1 (fully shown). `fadeDuration` is the seconds
 * over which the line eases in from its start and out toward its end.
 */
export function fadeProgress(line: LyricLine, currentTime: number, fadeDuration = 0.6): number {
  const sinceStart = currentTime - line.start;
  const untilEnd = line.end - currentTime;
  const fadeIn = Math.min(1, Math.max(0, sinceStart / fadeDuration));
  const fadeOut = Math.min(1, Math.max(0, untilEnd / fadeDuration));
  return Math.min(fadeIn, fadeOut);
}
