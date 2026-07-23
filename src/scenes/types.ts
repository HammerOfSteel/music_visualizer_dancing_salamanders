/**
 * Shared contract every per-track diorama scene module implements (Phase
 * 3.2). Keeps each track's hand-authored scene in its own file, swappable
 * without touching shared systems (turntable base, pulse rings, transport,
 * bloom, audio analysis, lyrics overlay), which all stay in main.ts.
 */
import * as THREE from 'three';

export interface DioramaSceneHandle {
  /**
   * Called once per frame from the shared animation loop.
   * @param assembleClock shared "time since this track's build-in sequence
   *   started" clock — resets to 0 on every track load (including the
   *   first) so a scene's internal `startOffset`s always count from the
   *   same t=0 as the turntable base's own drop-in animation.
   * @param dt seconds elapsed since the previous frame.
   * @param audioLevel smoothed 0-1 music amplitude from the shared beat
   *   detector, for any audio-reactive elements (e.g. a swelling sea).
   */
  update(assembleClock: number, dt: number, audioLevel: number): void;
  /**
   * Removes/disposes anything this scene added directly to `scene` (fixed
   * world-space elements like a moon or ambient lights). The caller
   * generically clears + disposes everything added to `dioramaGroup`, so
   * this only needs to handle the `scene`-level additions.
   */
  dispose(): void;
}

/** Factory every scene module exports: builds itself into the shared
 * `dioramaGroup` (rotates with the turntable) and, for anything that must
 * stay fixed in world space while the turntable spins, directly into
 * `scene`. */
export type SceneFactory = (scene: THREE.Scene, dioramaGroup: THREE.Group) => DioramaSceneHandle;
