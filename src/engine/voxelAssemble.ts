/**
 * Reusable "assemble on load" animation for voxel-built scenes — voxel
 * dioramas today, but deliberately generic so any future scene (voxel
 * terrain, prop scatter, tile grids, standalone accent meshes like a bell or
 * lantern) can reuse it without change. Two entry points share the same
 * timing/easing model:
 *
 * - `createVoxelAssembleAnimation` — for a single `THREE.InstancedMesh` built
 *   from a flat array of per-instance target transforms (the common case:
 *   thousands of voxels in one draw call).
 * - `createObjectAssembleAnimation` — for a handful of standalone
 *   `THREE.Object3D`s that aren't instanced (e.g. a hand-placed bell, a prop
 *   that needs its own material/light).
 *
 * Each instance/object starts above its final position and settles into
 * place with a staggered delay + a bouncy ease-out, so the whole structure
 * reads as physically "falling/snapping into place" rather than simply
 * popping into existence.
 */
import * as THREE from 'three';

export type VoxelAssembleStagger = 'bottom-up' | 'radial' | 'random';

export interface VoxelAssembleOptions {
  /** How each instance's start delay is derived from its final position. */
  stagger?: VoxelAssembleStagger;
  /** Seconds each instance takes to fall + settle once its delay elapses. */
  fallDuration?: number;
  /** World-space height each instance starts above its final resting spot. */
  dropHeight?: number;
  /** Total spread of stagger delays across the whole set, in seconds. */
  staggerSpread?: number;
  /** Deterministic seed for jitter — keeps the animation reproducible. */
  seed?: number;
  /** Extra delay (seconds) added to every instance, e.g. so a capstone piece
   * (a bell, a banner) waits for the bulk of the structure to settle first. */
  startOffset?: number;
}

export interface VoxelAssembleAnimation {
  /**
   * Advance the animation to `elapsedSeconds` since it started and write the
   * resulting transforms. Returns true while any instance is still
   * animating, false once every instance has fully settled (after which
   * further calls are no-ops).
   */
  update(elapsedSeconds: number): boolean;
  readonly done: boolean;
  /** 0 (nothing settled yet) to 1 (fully settled) across the whole set —
   * handy for driving a dependent effect, e.g. fading in a light with the
   * object it illuminates. */
  readonly overallProgress: number;
}

interface AssembleTargetBase {
  position: THREE.Vector3;
}

/** Small deterministic hash (no Math.random) for reproducible per-instance jitter. */
function hash(i: number, seed: number): number {
  let h = (i * 2654435761 + seed * 40503) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return (h % 10000) / 10000;
}

/** Overshoot-then-settle ease, giving each piece a small physical "thunk". */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** Shared per-instance delay computation used by both entry points below. */
function computeDelays<T extends AssembleTargetBase>(
  targets: T[],
  stagger: VoxelAssembleStagger,
  staggerSpread: number,
  startOffset: number,
  seed: number,
): Float32Array {
  let minY = Infinity;
  let maxY = -Infinity;
  let maxR = 0;
  for (const t of targets) {
    minY = Math.min(minY, t.position.y);
    maxY = Math.max(maxY, t.position.y);
    maxR = Math.max(maxR, Math.hypot(t.position.x, t.position.z));
  }
  const ySpan = Math.max(1e-6, maxY - minY);

  const delays = new Float32Array(targets.length);
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    let base: number;
    if (stagger === 'bottom-up') base = (t.position.y - minY) / ySpan;
    else if (stagger === 'radial') base = maxR > 0 ? Math.hypot(t.position.x, t.position.z) / maxR : 0;
    else base = hash(i, seed);
    // Small jitter on top of the structured base so it doesn't read as
    // mechanically uniform (real debris/blocks never settle in lockstep).
    const jitter = (hash(i, seed + 7) - 0.5) * 0.3;
    delays[i] = startOffset + Math.max(0, (base + jitter) * staggerSpread);
  }
  return delays;
}

/** Per-instance progress at `elapsedSeconds`: height/scale progress (0-1, height may overshoot slightly) and whether it's still animating. */
function instanceProgress(
  elapsedSeconds: number,
  delay: number,
  fallDuration: number,
): { heightProgress: number; scaleProgress: number; animating: boolean } {
  const localT = (elapsedSeconds - delay) / fallDuration;
  if (localT <= 0) return { heightProgress: 0, scaleProgress: 0, animating: true };
  if (localT >= 1) return { heightProgress: 1, scaleProgress: 1, animating: false };
  return {
    heightProgress: easeOutBack(localT),
    scaleProgress: Math.min(1, localT * 1.4), // scale in a bit faster than the fall settles
    animating: true,
  };
}

export interface VoxelAssembleTarget extends AssembleTargetBase {
  /** Final uniform scale multiplier. Defaults to 1. */
  scale?: number;
  /** Final Y-axis rotation in radians. Defaults to 0. */
  rotationY?: number;
}

export function createVoxelAssembleAnimation(
  mesh: THREE.InstancedMesh,
  targets: VoxelAssembleTarget[],
  options: VoxelAssembleOptions = {},
): VoxelAssembleAnimation {
  const {
    stagger = 'bottom-up',
    fallDuration = 0.45,
    dropHeight = 2.5,
    staggerSpread = 1.1,
    seed = 1,
    startOffset = 0,
  } = options;

  // Matrices change every frame while animating; switch back to static once done.
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const delays = computeDelays(targets, stagger, staggerSpread, startOffset, seed);
  const maxDelay = delays.length ? Math.max(...delays) : 0;
  const totalDuration = maxDelay + fallDuration;

  const dummy = new THREE.Object3D();
  let done = false;
  let overallProgress = 0;

  function update(elapsedSeconds: number): boolean {
    if (done) return false;
    let allSettled = true;
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const { heightProgress, scaleProgress, animating } = instanceProgress(elapsedSeconds, delays[i], fallDuration);
      if (animating) allSettled = false;

      const y = target.position.y + (1 - heightProgress) * dropHeight;
      const scale = (target.scale ?? 1) * Math.max(0, scaleProgress);
      dummy.position.set(target.position.x, y, target.position.z);
      dummy.rotation.y = target.rotationY ?? 0;
      dummy.scale.setScalar(Math.max(0.0001, scale));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    overallProgress = totalDuration > 0 ? Math.min(1, Math.max(0, elapsedSeconds / totalDuration)) : 1;
    if (allSettled) {
      done = true;
      overallProgress = 1;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    }
    return !allSettled;
  }

  return {
    update,
    get done() {
      return done;
    },
    get overallProgress() {
      return overallProgress;
    },
  };
}

export interface ObjectAssembleTarget extends AssembleTargetBase {
  object: THREE.Object3D;
}

/**
 * Same falling/settling behaviour as {@link createVoxelAssembleAnimation},
 * but for a handful of standalone (non-instanced) objects — e.g. one-off
 * accent meshes like a bell, a lantern, or a hero prop that needs its own
 * material. Each object's CURRENT position/scale is captured as its final
 * resting transform when this is called, so build objects at their intended
 * final position first, then hand them to this function.
 */
export function createObjectAssembleAnimation(
  targets: ObjectAssembleTarget[],
  options: VoxelAssembleOptions = {},
): VoxelAssembleAnimation {
  const {
    stagger = 'bottom-up',
    fallDuration = 0.45,
    dropHeight = 2.5,
    staggerSpread = 1.1,
    seed = 1,
    startOffset = 0,
  } = options;

  const finalPositions = targets.map((t) => t.position.clone());
  const finalScales = targets.map((t) => t.object.scale.clone());
  const delays = computeDelays(targets, stagger, staggerSpread, startOffset, seed);
  const maxDelay = delays.length ? Math.max(...delays) : 0;
  const totalDuration = maxDelay + fallDuration;

  let done = false;
  let overallProgress = 0;

  function update(elapsedSeconds: number): boolean {
    if (done) return false;
    let allSettled = true;
    for (let i = 0; i < targets.length; i++) {
      const { object } = targets[i];
      const finalPos = finalPositions[i];
      const finalScale = finalScales[i];
      const { heightProgress, scaleProgress, animating } = instanceProgress(elapsedSeconds, delays[i], fallDuration);
      if (animating) allSettled = false;

      object.position.set(finalPos.x, finalPos.y + (1 - heightProgress) * dropHeight, finalPos.z);
      object.scale.set(
        Math.max(0.0001, finalScale.x * scaleProgress),
        Math.max(0.0001, finalScale.y * scaleProgress),
        Math.max(0.0001, finalScale.z * scaleProgress),
      );
    }
    overallProgress = totalDuration > 0 ? Math.min(1, Math.max(0, elapsedSeconds / totalDuration)) : 1;
    if (allSettled) {
      done = true;
      overallProgress = 1;
    }
    return !allSettled;
  }

  return {
    update,
    get done() {
      return done;
    },
    get overallProgress() {
      return overallProgress;
    },
  };
}
