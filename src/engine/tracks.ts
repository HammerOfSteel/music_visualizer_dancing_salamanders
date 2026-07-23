/**
 * Track manifest loading — fetches `public/music/tracks.json` plus each
 * track's own `meta.json`, and resolves the URLs for a track's audio and
 * lyrics files. Pure fetch/data logic, no DOM/rendering dependencies.
 */

export interface TrackManifestEntry {
  /** Stable id, e.g. "bells-of-lyonesse". */
  id: string;
  /** Folder under `public/music/` holding this track's meta.json,
   * lyrics.json, and audio file. */
  folder: string;
  /** Audio filename within `folder`. */
  audioFile: string;
  /** Key into `src/scenes/index.ts`'s `sceneFactories` registry. */
  scene: string;
}

export interface TrackMeta {
  title: string;
  artist: string;
  album: string;
}

export interface LoadedTrack extends TrackManifestEntry {
  meta: TrackMeta;
}

/** Fetches `tracks.json` and each track's `meta.json` up front, so a track
 * menu can show real titles before the user picks anything. */
export async function loadTracks(): Promise<LoadedTrack[]> {
  const manifest = (await fetch('/music/tracks.json').then((r) => r.json())) as TrackManifestEntry[];
  return Promise.all(
    manifest.map(async (entry) => {
      const meta = (await fetch(`/music/${entry.folder}/meta.json`).then((r) => r.json())) as TrackMeta;
      return { ...entry, meta };
    }),
  );
}

export function trackAudioUrl(track: TrackManifestEntry): string {
  return `/music/${track.folder}/${track.audioFile}`;
}

export function trackLyricsUrl(track: TrackManifestEntry): string {
  return `/music/${track.folder}/lyrics.json`;
}
