/**
 * Shared contract every swappable "backdrop" preset implements (Phase
 * 3.11). A backdrop owns everything about the environment that isn't the
 * per-song diorama itself: sky/background colour, ambient/hemisphere/key
 * fill lighting, and any fixed-in-world-space set dressing (drifting
 * clouds, ember particles, a moon, etc.) — everything a per-track scene
 * module (`src/scenes/`) used to own directly on `scene` before this phase
 * pulled it out into its own reusable, mixable layer.
 *
 * A backdrop and a diorama scene are composed together per track (see
 * `sceneDefaultBackdrops` + `main.ts`'s `loadTrack()`): the diorama still
 * owns its own voxel content (added to `dioramaGroup`, rotates with the
 * turntable) while the backdrop owns the surrounding "world" (added
 * directly to `scene`, stays fixed while the turntable spins).
 */
import * as THREE from 'three';

export interface BackdropHandle {
  /**
   * Called once per frame from the shared animation loop, same clock as
   * `DioramaSceneHandle.update` (see `src/scenes/types.ts`) so a backdrop's
   * own "arrives on load" build-in timing (e.g. the moon rising, clouds
   * fading in) can share `assembleClock` with the diorama's build-in
   * sequence.
   */
  update(assembleClock: number, dt: number, audioLevel: number): void;
  /** Removes/disposes everything this backdrop added to `scene`, and
   * restores whatever `scene.background`/`scene.fog` were before this
   * backdrop was installed. */
  dispose(): void;
}

/** Factory every backdrop module exports: builds itself directly into the
 * shared `scene` (fixed in world space, doesn't rotate with the
 * turntable). */
export type BackdropFactory = (scene: THREE.Scene) => BackdropHandle;

export interface BackdropPreset {
  id: string;
  label: string;
  /** Short description used by the future settings menu (3.13) and by
   * this registry's own documentation for not-yet-built presets. */
  description: string;
  /** Present only for presets that are actually implemented; stubbed
   * presets (documented in 3.7 but not yet built) omit this so callers
   * can fall back to a default backdrop. */
  factory?: BackdropFactory;
}

