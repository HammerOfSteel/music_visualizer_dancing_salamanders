/**
 * "The Bells of Lyonesse" diorama scene module (Phase 3.2's first
 * per-track scene). Builds the whole hand-authored voxel scene — a rocky,
 * ruin-fringed island rising from dark water with a small oak-framed bell
 * tower on its peak, lit warm by the bell's glow and cool by a fixed moon
 * — built directly from this song's lyrics (see the original Phase 0/1
 * notes in git history / TODO.md for the lyric-to-detail mapping).
 *
 * Everything here is added into the shared `dioramaGroup` (rotates with
 * the turntable) except elements that must stay fixed in world space
 * while the turntable spins (the moon + its light, and the generic
 * ambient/hemisphere/key fill lights) — those go directly onto `scene`.
 * Shared systems this scene does NOT own: turntable base, pulse rings,
 * transport, bloom, audio analysis, lyrics overlay — all in main.ts.
 *
 * This is the first of what should become many per-track scene modules
 * (see `./types.ts` for the shared interface). Phase 3.11 pulled the
 * ambient/hemisphere/key/moon lighting out into the swappable
 * `moonlitIsle` backdrop preset (`src/backdrops/moonlitIsle.ts`), which is
 * composed alongside this scene in `main.ts`'s `loadTrack()` — this module
 * now only owns this song's own voxel content (terrain, sea, bell +
 * hearth glow).
 */
import * as THREE from 'three';
import {
  createVoxelAssembleAnimation,
  createObjectAssembleAnimation,
  type VoxelAssembleTarget,
  type ObjectAssembleTarget,
} from '../engine/voxelAssemble';
import type { DioramaSceneHandle } from './types';

export function createBellsOfLyonesseScene(
  scene: THREE.Scene,
  dioramaGroup: THREE.Group,
): DioramaSceneHandle {
  const BU = 0.05; // base voxel unit
  const GRID_XZ = 25; // half-width: grid spans -25..25 on x/z
  const GRID_Y = 46; // grid spans 0..45 on y
  const GRID_W = GRID_XZ * 2 + 1;
  const GRID_D = GRID_XZ * 2 + 1;
  const GRID_H = GRID_Y;
  const voxelGrid = new Uint32Array(GRID_W * GRID_H * GRID_D);

  function gridIndex(x: number, y: number, z: number): number {
    return x + GRID_XZ + y * GRID_W + (z + GRID_XZ) * GRID_W * GRID_H;
  }
  function setVoxel(x: number, y: number, z: number, color: number): void {
    if (x < -GRID_XZ || x > GRID_XZ || y < 0 || y >= GRID_H || z < -GRID_XZ || z > GRID_XZ) return;
    voxelGrid[gridIndex(x, y, z)] = color;
  }
  function getVoxel(x: number, y: number, z: number): number {
    if (x < -GRID_XZ || x > GRID_XZ || y < 0 || y >= GRID_H || z < -GRID_XZ || z > GRID_XZ) return 0;
    return voxelGrid[gridIndex(x, y, z)];
  }

  // Deterministic pseudo-random noise (no external RNG, so the scene is
  // reproducible run to run) used to break up otherwise-uniform surfaces.
  function hash3(x: number, y: number, z: number): number {
    const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
    return s - Math.floor(s);
  }

  // Base: a rocky island rising from dark water — open on all sides so it
  // reads correctly as the diorama rotates a full 360°, no enclosing walls.
  // "The salt Cornish tide doth ebb and flow" — the open sea is a real
  // animated shader plane (see below). Here we just lay down the island
  // silhouette; a thin wet-rock transition ring blends the voxel shoreline
  // into the animated water.
  const ISLAND_R = 24;
  const WATER_R = 17;
  for (let x = -ISLAND_R; x <= ISLAND_R; x++) {
    for (let z = -ISLAND_R; z <= ISLAND_R; z++) {
      const r = Math.sqrt(x * x + z * z);
      if (r > WATER_R + 1.5) continue; // beyond here: shader water plane only
      if (r > WATER_R) {
        const c = new THREE.Color(0x1c2630).lerp(new THREE.Color(0x2a3644), hash3(x, 2, z));
        setVoxel(x, 0, z, c.getHex());
      } else {
        const jitter = hash3(x, 1, z);
        const c = new THREE.Color(0x232b34).lerp(new THREE.Color(0x303a44), jitter);
        setVoxel(x, 0, z, c.getHex());
      }
    }
  }

  // Rocky outcrop rising toward the centre — a jittered, natural silhouette
  // rather than a smooth cone, built from layered noise at two frequencies
  // (broad boulder-scale bumps + fine surface roughness) so it reads as
  // weathered rock, not a stepped pyramid. Colour-graded darker near the
  // waterline and lighter/mossier toward the peak, with per-voxel speckle.
  const ROCK_R = 13;
  for (let x = -ROCK_R; x <= ROCK_R; x++) {
    for (let z = -ROCK_R; z <= ROCK_R; z++) {
      const r = Math.sqrt(x * x + z * z);
      if (r > ROCK_R) continue;
      const base = (ROCK_R - r) * 0.85;
      const coarse = (hash3(Math.floor(x / 3), 7, Math.floor(z / 3)) - 0.5) * 5; // broad boulder bumps
      const fine = (hash3(x, 7, z) - 0.5) * 2.5; // fine surface roughness
      const h = Math.max(2, Math.round(base + coarse + fine));
      for (let y = 1; y <= h; y++) {
        const t = y / h; // 0 near waterline, 1 near peak
        const rockColor = new THREE.Color(0x33291f).lerp(new THREE.Color(0x574a3a), t);
        rockColor.offsetHSL(0, 0, hash3(x, y, z) * 0.12 - 0.06);
        // Mossy green speckle on upper, sun-facing faces.
        if (t > 0.6 && hash3(x, y, z + 11) > 0.75) rockColor.lerp(new THREE.Color(0x3a4a2c), 0.5);
        setVoxel(x, y, z, rockColor.getHex());
      }
    }
  }

  // A small oak-framed bell tower rising from the outcrop's peak — nods to
  // "the bells of Lyonesse" ringing up through the water, and "low beams of
  // oak by a hearth fire's glow". Corner posts are 2 voxels thick (a real
  // timber cross-section, not a toothpick), joined by cross-braces, with
  // plaster infill panels left open as window gaps.
  const POST_OFFSET = 4;
  const TOWER_BASE_Y = 16;
  const TOWER_TOP_Y = 32;
  const postCorners: Array<[number, number]> = [
    [POST_OFFSET, POST_OFFSET],
    [POST_OFFSET, -POST_OFFSET],
    [-POST_OFFSET, POST_OFFSET],
    [-POST_OFFSET, -POST_OFFSET],
  ];
  for (const [cx, cz] of postCorners) {
    const dx = cx > 0 ? [cx - 1, cx] : [cx, cx + 1];
    const dz = cz > 0 ? [cz - 1, cz] : [cz, cz + 1];
    for (let y = TOWER_BASE_Y; y <= TOWER_TOP_Y; y++) {
      const woodColor = new THREE.Color(0x4a4038).offsetHSL(0, 0, hash3(cx, y, cz) * 0.08 - 0.04);
      for (const x of dx) for (const z of dz) setVoxel(x, y, z, woodColor.getHex());
    }
  }
  // Cross-braces at four heights.
  for (const y of [19, 23, 27, 30]) {
    setVoxel(0, y, POST_OFFSET, 0x8a6a44);
    setVoxel(0, y, -POST_OFFSET, 0x8a6a44);
    setVoxel(POST_OFFSET, y, 0, 0x8a6a44);
    setVoxel(-POST_OFFSET, y, 0, 0x8a6a44);
  }
  // Plaster infill panels, leaving 19-23 and 27-29 open as window slits.
  for (const y of [17, 18, 24, 25, 26]) {
    const spans: Array<[number, number]> = [
      [0, POST_OFFSET],
      [0, -POST_OFFSET],
      [POST_OFFSET, 0],
      [-POST_OFFSET, 0],
    ];
    for (const [cx, cz] of spans) setVoxel(cx, y, cz, 0x6a5f52);
  }

  // Roof cap: an 8-step hip pyramid (perimeter-only shell — the interior is
  // never seen) so the slope reads smoothly, shingles in alternating tone.
  const ROOF_BASE_Y = 33;
  const ROOF_STEPS = 8;
  const ROOF_HALF_WIDTH = 5;
  for (let i = 0; i < ROOF_STEPS; i++) {
    const y = ROOF_BASE_Y + i;
    const half = Math.max(0, ROOF_HALF_WIDTH - i);
    for (let x = -half; x <= half; x++) {
      for (let z = -half; z <= half; z++) {
        if (half > 0 && Math.abs(x) !== half && Math.abs(z) !== half) continue; // perimeter only
        const shingle = (x + z + y) % 2 === 0;
        setVoxel(x, y, z, shingle ? 0x6a5a4a : 0x5c4d3f);
      }
    }
  }

  // Sunken ruins of the drowned city, half-submerged in the dark water band
  // around the island — "silent ghosts of the kingdom stir from their
  // sleep", "the city of Lyonesse... down deep unto a sunless sea". Each
  // cluster is a small broken wall ring (hollow footprint, not a solid
  // pillar) with crenellated, per-column-jittered tops so it reads as
  // ruined masonry rather than toothpicks poking out of the water.
  interface RuinCluster {
    cx: number;
    cz: number;
    height: number;
    size: number; // footprint half-width: size=1 -> 3x3, size=2 -> 5x5
  }
  const ruinClusters: RuinCluster[] = [
    { cx: 20, cz: 4, height: 9, size: 2 },
    { cx: 22, cz: 9, height: 5, size: 1 },
    { cx: -20, cz: -8, height: 12, size: 2 },
    { cx: -18, cz: -3, height: 6, size: 1 },
    { cx: 4, cz: 20, height: 9, size: 2 },
    { cx: 9, cz: 22, height: 5, size: 1 },
    { cx: -16, cz: 16, height: 9, size: 2 },
    { cx: -11, cz: 19, height: 5, size: 1 },
    { cx: 16, cz: -16, height: 9, size: 2 },
    { cx: 11, cz: -19, height: 5, size: 1 },
  ];
  for (const { cx, cz, height, size } of ruinClusters) {
    const cells: Array<[number, number]> = [];
    for (let dx = -size; dx <= size; dx++) {
      for (let dz = -size; dz <= size; dz++) {
        // Hollow ring: only the perimeter of the footprint is wall (broken
        // masonry shell), plus the four corners get a solid buttress column.
        const onPerimeter = Math.abs(dx) === size || Math.abs(dz) === size;
        const isCorner = Math.abs(dx) === size && Math.abs(dz) === size;
        if (!onPerimeter && !isCorner) continue;
        cells.push([cx + dx, cz + dz]);
      }
    }
    for (const [x, z] of cells) {
      const isCorner = Math.abs(x - cx) === size && Math.abs(z - cz) === size;
      // Corners stand taller (buttress towers); wall spans are more broken/eroded.
      const jitterRange = isCorner ? 3 : 6;
      const localHeight = Math.max(1, height - Math.floor(hash3(x, 3, z) * jitterRange));
      for (let y = 1; y <= localHeight; y++) {
        const t = y / localHeight;
        const ghostColor = new THREE.Color(0x39485a).lerp(new THREE.Color(0x5c7086), t * 0.6);
        setVoxel(x, y, z, ghostColor.getHex());
      }
    }
  }

  // --- Compile the voxel grid into a single InstancedMesh, matching the
  // cottage-diorama POC's technique: skip fully-hidden voxels, darken each
  // instance by a gentle ambient-occlusion factor from its solid-neighbour
  // count, and leave a small gap between unit cubes (0.85 scale) for the
  // "model kit" look rather than seamless flush surfaces. ---
  interface VoxelInstance {
    x: number;
    y: number;
    z: number;
    color: THREE.Color;
  }
  const voxelInstances: VoxelInstance[] = [];
  for (let x = -GRID_XZ; x <= GRID_XZ; x++) {
    for (let y = 0; y < GRID_H; y++) {
      for (let z = -GRID_XZ; z <= GRID_XZ; z++) {
        const color = getVoxel(x, y, z);
        if (color === 0) continue;

        // Hide fully surrounded voxels — never seen, pure win for instance count.
        if (
          getVoxel(x + 1, y, z) !== 0 &&
          getVoxel(x - 1, y, z) !== 0 &&
          getVoxel(x, y + 1, z) !== 0 &&
          getVoxel(x, y - 1, z) !== 0 &&
          getVoxel(x, y, z + 1) !== 0 &&
          getVoxel(x, y, z - 1) !== 0
        ) {
          continue;
        }

        // Gentle AO: count solid voxels in the full 26-neighbourhood and
        // darken proportionally, clamped so corners never go fully black.
        let solidNeighbors = 0;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
              if (dx === 0 && dy === 0 && dz === 0) continue;
              if (getVoxel(x + dx, y + dy, z + dz) !== 0) solidNeighbors++;
            }
          }
        }
        const aoFactor = Math.max(0.75, 1 - (solidNeighbors / 26) * 0.15);
        const col = new THREE.Color(color);
        col.multiplyScalar(aoFactor);
        voxelInstances.push({ x, y, z, color: col });
      }
    }
  }

  const terrainGeometry = new THREE.BoxGeometry(BU * 0.85, BU * 0.85, BU * 0.85);
  const terrainMaterial = new THREE.MeshStandardMaterial({ roughness: 0.88 });
  const terrainMesh = new THREE.InstancedMesh(terrainGeometry, terrainMaterial, voxelInstances.length);
  terrainMesh.castShadow = true;
  terrainMesh.receiveShadow = true;
  const terrainTargets: VoxelAssembleTarget[] = [];
  for (let i = 0; i < voxelInstances.length; i++) {
    const inst = voxelInstances[i];
    const position = new THREE.Vector3(inst.x * BU, inst.y * BU, inst.z * BU);
    terrainTargets.push({ position });
    terrainMesh.setColorAt(i, inst.color);
  }
  if (terrainMesh.instanceColor) terrainMesh.instanceColor.needsUpdate = true;
  dioramaGroup.add(terrainMesh);

  // Reusable "assemble on load" effect (see engine/voxelAssemble.ts): every
  // voxel drops in from above and settles with a staggered, bouncy ease,
  // bottom-up, so the whole diorama reads as physically building itself
  // rather than simply appearing.
  let terrainAssembleAnim: ReturnType<typeof createVoxelAssembleAnimation> | null =
    createVoxelAssembleAnimation(terrainMesh, terrainTargets, {
      stagger: 'bottom-up',
      fallDuration: 0.5,
      dropHeight: 2.2,
      staggerSpread: 1.3,
      startOffset: 0.2, // let the turntable base land first, then the voxels fall onto it
      seed: 7,
    });

  // --- Animated sea: a real-time Gerstner-style wave shader plane rather
  // than static voxels, so "the salt Cornish tide doth ebb and flow"
  // actually reads as moving water lapping at the shoreline and ruin
  // bases. Standard stylized-water recipe: sum of directional sine waves
  // for wave height + analytic normals, a fresnel-driven deep/shallow
  // color blend, a specular glint toward the moon, and a foam band
  // (oscillating over time for a "breathing tide" feel) near the
  // shoreline and each ruin cluster.
  const SEA_OUTER_R = 34;
  const seaGeometry = new THREE.RingGeometry(WATER_R - 1, SEA_OUTER_R, 160, 28);
  seaGeometry.rotateX(-Math.PI / 2); // lay flat; after this, geometry x/z map directly to world x/z

  // Foam distance field: how close each vertex is to the shoreline ring or
  // to a ruin cluster's footprint, baked once as a per-vertex attribute.
  const seaPos = seaGeometry.attributes.position;
  const foamAttr = new Float32Array(seaPos.count);
  for (let i = 0; i < seaPos.count; i++) {
    const x = seaPos.getX(i);
    const z = seaPos.getZ(i);
    const r = Math.sqrt(x * x + z * z);
    let dist = Math.abs(r - WATER_R);
    for (const ruin of ruinClusters) {
      const rd = Math.hypot(x - ruin.cx, z - ruin.cz) - (ruin.size + 1);
      dist = Math.min(dist, Math.max(0, rd));
    }
    const FOAM_WIDTH = 1.4;
    foamAttr[i] = Math.max(0, 1 - dist / FOAM_WIDTH);
  }
  seaGeometry.setAttribute('aFoam', new THREE.BufferAttribute(foamAttr, 1));

  const seaUniforms = {
    uTime: { value: 0 },
    uDeepColor: { value: new THREE.Color(0x041018) },
    uShallowColor: { value: new THREE.Color(0x123044) },
    uFoamColor: { value: new THREE.Color(0xcfe6f2) },
    uMoonDir: { value: new THREE.Vector3(-3, 5, -6).normalize() },
    uMoonColor: { value: new THREE.Color(0xbfd4ff) },
    uAudioLevel: { value: 0 }, // smoothed 0-1 music amplitude, driven from update()
    uBuildProgress: { value: 0 }, // 0 = flat calm water, 1 = full waves — ramps in on load
  };
  const seaMaterial = new THREE.ShaderMaterial({
    uniforms: seaUniforms,
    vertexShader: `
      uniform float uTime;
      uniform float uAudioLevel;
      uniform float uBuildProgress;
      attribute float aFoam;
      varying float vFoam;
      varying vec3 vWorldPos;
      varying vec3 vNormalW;

      // Four directional sine waves summed together (a simplified Gerstner
      // sea) — enough directional variety to avoid looking like one uniform
      // ripple, cheap enough to evaluate per-vertex in real time. Amplitude
      // gets a gentle music-driven lift so the sea breathes softly with the
      // track rather than a fixed mechanical swell.
      float waveHeight(vec2 p, float audioBoost) {
        float h = 0.0;
        h += 0.18 * audioBoost * sin(dot(vec2(1.0, 0.3), p) * 0.35 + uTime * 1.1);
        h += 0.12 * audioBoost * sin(dot(vec2(-0.6, 0.9), p) * 0.5 + uTime * 1.6);
        h += 0.08 * sin(dot(vec2(0.4, -0.8), p) * 0.8 + uTime * 2.1);
        h += 0.05 * sin(dot(vec2(-0.9, -0.2), p) * 1.3 + uTime * 2.8);
        return h;
      }
      vec2 waveGrad(vec2 p, float audioBoost) {
        vec2 g = vec2(0.0);
        g += 0.18 * audioBoost * 0.35 * vec2(1.0, 0.3) * cos(dot(vec2(1.0, 0.3), p) * 0.35 + uTime * 1.1);
        g += 0.12 * audioBoost * 0.5 * vec2(-0.6, 0.9) * cos(dot(vec2(-0.6, 0.9), p) * 0.5 + uTime * 1.6);
        g += 0.08 * 0.8 * vec2(0.4, -0.8) * cos(dot(vec2(0.4, -0.8), p) * 0.8 + uTime * 2.1);
        g += 0.05 * 1.3 * vec2(-0.9, -0.2) * cos(dot(vec2(-0.9, -0.2), p) * 1.3 + uTime * 2.8);
        return g;
      }

      void main() {
        vFoam = aFoam;
        vec3 pos = position;
        vec2 p = pos.xz;
        float audioBoost = 1.0 + uAudioLevel * 0.6;
        // Foam near the shoreline damps wave amplitude (water is shallow/still there).
        float amp = mix(1.0, 0.35, aFoam) * uBuildProgress;
        pos.y += waveHeight(p, audioBoost) * amp;
        vec2 grad = waveGrad(p, audioBoost) * amp;
        vec3 localNormal = normalize(vec3(-grad.x, 1.0, -grad.y));
        vNormalW = normalize(normalMatrix * localNormal);
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uFoamColor;
      uniform vec3 uMoonDir;
      uniform vec3 uMoonColor;
      uniform float uTime;
      uniform float uAudioLevel;
      uniform float uBuildProgress;
      varying float vFoam;
      varying vec3 vWorldPos;
      varying vec3 vNormalW;

      // Cheap hash-based sparkle noise for tiny glinting highlights in the
      // foam, like light catching on wet, bubbling water.
      float sparkleHash(vec2 p) {
        return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453123);
      }

      void main() {
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 baseColor = mix(uDeepColor, uShallowColor, fresnel * 0.6);

        // Lapping foam: a slow breathing oscillation rather than a static band.
        // Ramps in with uBuildProgress so the shoreline starts calm/dry and
        // the foam "arrives" with the first waves rather than being there
        // from frame one.
        float lap = sin(vFoam * 6.0 - uTime * 1.6) * 0.5 + 0.5;
        float foamMask = smoothstep(0.6, 1.0, vFoam) * mix(0.5, 1.0, lap) * uBuildProgress;
        vec3 color = mix(baseColor, uFoamColor, foamMask);

        // Sparkle: fine glinting highlights within the foam band only, drifting
        // over time and brightening softly with the music.
        vec2 sparkleCell = floor(vWorldPos.xz * 18.0 + uTime * 0.6);
        float sparkle = step(0.985 - uAudioLevel * 0.03, sparkleHash(sparkleCell));
        color += sparkle * foamMask * uFoamColor * (0.8 + uAudioLevel * 1.2);

        vec3 H = normalize(uMoonDir + V);
        float spec = pow(max(dot(N, H), 0.0), 80.0);
        color += uMoonColor * spec * (0.25 + uAudioLevel * 0.15);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const seaMesh = new THREE.Mesh(seaGeometry, seaMaterial);
  const SEA_REST_Y = -0.4 * BU;
  const SEA_RISE_START_Y = SEA_REST_Y - 0.9 * BU; // starts a little below the shoreline, rises in like an incoming tide
  seaMesh.position.y = SEA_RISE_START_Y;
  seaMesh.scale.setScalar(BU);
  dioramaGroup.add(seaMesh);

  // Sea "tide fills in" build-up: starts flat and low, then rises to its
  // resting height while uBuildProgress ramps 0-1 to bring the waves/foam
  // in together — timed to start once the shoreline rock has mostly
  // assembled.
  const SEA_BUILD_START_OFFSET = 0.9;
  const SEA_BUILD_DURATION = 1.8;
  let seaBuildDone = false;

  // The bell itself — warm glowing bronze, the bloom-catching centrepiece,
  // shaped as a small tapered bulge rather than a bare column. Not part of
  // the terrain InstancedMesh (it needs its own material), so it gets its
  // own "assemble on load" pass below — a capstone that drops into place
  // once the rock/tower has mostly settled, then its glow fades up.
  const bellAssembleTargets: ObjectAssembleTarget[] = [];
  function addBellVoxel(x: number, y: number, z: number): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(BU * 1.4, BU * 1.4, BU * 1.4),
      new THREE.MeshStandardMaterial({ color: 0xffb066, roughness: 0.3 }),
    );
    mesh.position.set(x * BU, y * BU, z * BU);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    dioramaGroup.add(mesh);
    bellAssembleTargets.push({ position: mesh.position.clone(), object: mesh });
  }
  addBellVoxel(0, 20, 0);
  addBellVoxel(0, 21, 0);
  addBellVoxel(1, 21, 0);
  addBellVoxel(-1, 21, 0);
  addBellVoxel(0, 21, 1);
  addBellVoxel(0, 21, -1);
  addBellVoxel(0, 22, 0);

  // Bell glow point light (this is the bloom-catching light source). Starts
  // dark and fades up in sync with the bell's assemble animation below, so
  // the glow reads as the bell "waking up" once it has settled rather than
  // being lit before it exists.
  const HEARTH_LIGHT_INTENSITY = 3.5;
  const hearthLight = new THREE.PointLight(0xffb066, 0, 6);
  hearthLight.position.set(0, 21 * BU, 0);
  dioramaGroup.add(hearthLight);

  const BELL_ASSEMBLE_START_OFFSET = 1.3; // let the terrain mostly settle first
  let bellAssembleAnim: ReturnType<typeof createObjectAssembleAnimation> | null =
    createObjectAssembleAnimation(bellAssembleTargets, {
      stagger: 'bottom-up',
      fallDuration: 0.4,
      dropHeight: 1.4,
      staggerSpread: 0.35,
      startOffset: BELL_ASSEMBLE_START_OFFSET,
      seed: 3,
    });

  return {
    update(assembleClock, dt, audioLevel) {
      seaUniforms.uTime.value += dt;
      seaUniforms.uAudioLevel.value = audioLevel;

      if (terrainAssembleAnim) {
        const stillAnimating = terrainAssembleAnim.update(assembleClock);
        if (!stillAnimating) terrainAssembleAnim = null; // done — mesh is now static, stop calling update
      }
      if (bellAssembleAnim) {
        const stillAnimating = bellAssembleAnim.update(assembleClock);
        hearthLight.intensity = HEARTH_LIGHT_INTENSITY * bellAssembleAnim.overallProgress;
        if (!stillAnimating) {
          bellAssembleAnim = null;
          hearthLight.intensity = HEARTH_LIGHT_INTENSITY; // guarantee full brightness once settled
        }
      }
      if (!seaBuildDone) {
        const localT = (assembleClock - SEA_BUILD_START_OFFSET) / SEA_BUILD_DURATION;
        const t = Math.min(1, Math.max(0, localT));
        const eased = t * t * (3 - 2 * t); // smoothstep — gentle ease in/out for the tide rising
        seaMesh.position.y = THREE.MathUtils.lerp(SEA_RISE_START_Y, SEA_REST_Y, eased);
        seaUniforms.uBuildProgress.value = eased;
        if (t >= 1) seaBuildDone = true;
      }
    },
    dispose() {
      // Lighting (ambient/hemisphere/key/moon) now lives in the composed
      // `moonlitIsle` backdrop (`src/backdrops/moonlitIsle.ts`) — nothing
      // scene-level left for this module to clean up beyond what
      // `disposeGroupChildren` already handles for `dioramaGroup`.
    },
  };
}
