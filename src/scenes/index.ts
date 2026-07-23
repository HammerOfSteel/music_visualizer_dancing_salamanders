/**
 * Registry mapping a track manifest's `scene` id (see
 * `public/music/tracks.json`) to its scene factory module. Add a new
 * track's scene module here so `main.ts` can look it up by id without
 * needing dynamic imports.
 */
import { createBellsOfLyonesseScene } from './bellsOfLyonesse';
import type { SceneFactory } from './types';

export const sceneFactories: Record<string, SceneFactory> = {
  bellsOfLyonesse: createBellsOfLyonesseScene,
};

export type { DioramaSceneHandle, SceneFactory } from './types';
