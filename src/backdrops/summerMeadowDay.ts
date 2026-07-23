/**
 * "Summer meadow day" backdrop preset — a direct, literal port of the
 * reference POC `POCs/low_poly_sunset_valley_2.html` (terrain height
 * function, mountain silhouette formula, cloud cluster/particle geometry,
 * single-species trees, static box sheep — all of it uses that POC's own
 * formulas, counts, and geometry, not a reinterpretation of them).
 *
 * The only departures from the POC are the strict minimum this project's
 * diorama-on-a-table setup requires, since the POC has no table at all:
 *  - A rectangular hole is cut out of the terrain mesh over the table's
 *    footprint (`isOverTable`) so the meadow can never render on top of
 *    the tabletop.
 *  - Trees/sheep/grass are nudged clear of the table footprint
 *    (`pushClearOfTable`) instead of being allowed to spawn on it.
 *  - The terrain/mountain z-placement sits behind the table instead of
 *    where the POC's own walking-POV camera stood (this project's camera
 *    looks down at a fixed table, it doesn't stand inside the meadow).
 *  - The POC's "hiker POV" foreground props (grassy mound, rocks,
 *    backpack, walking stick, first-person legs) are omitted entirely —
 *    they're a first-person hiking frame with no equivalent in a
 *    turntable diorama.
 * Fixed in world space (doesn't rotate with the turntable), same pattern
 * as `moonlitIsle`.
 */
import * as THREE from 'three';
import type { BackdropHandle, BackdropFactory } from './types';

// --- Table footprint (see `main.ts`: TABLE_WIDTH=16, TABLE_DEPTH=9,
// centred on the origin) — the only scene-specific fact this port needs
// that the POC has no equivalent for. ---
const TABLE_HALF_X = 8;
const TABLE_HALF_Z = 4.5;

function isOverTable(x: number, z: number, pad: number): boolean {
  return Math.abs(x) < TABLE_HALF_X + pad && Math.abs(z) < TABLE_HALF_Z + pad;
}

/** Nudges [x, z] to the nearest point clear of the table footprint (plus
 * `pad`) if it currently falls inside it. */
function pushClearOfTable(x: number, z: number, pad: number): [number, number] {
  if (!isOverTable(x, z, pad)) return [x, z];
  const toLeft = x - (-TABLE_HALF_X - pad);
  const toRight = TABLE_HALF_X + pad - x;
  const toBack = z - (-TABLE_HALF_Z - pad);
  const toFront = TABLE_HALF_Z + pad - z;
  const nearest = Math.min(toLeft, toRight, toBack, toFront);
  if (nearest === toLeft) return [-TABLE_HALF_X - pad, z];
  if (nearest === toRight) return [TABLE_HALF_X + pad, z];
  if (nearest === toBack) return [x, -TABLE_HALF_Z - pad];
  return [x, TABLE_HALF_Z + pad];
}

// --- Terrain height field — verbatim port of the POC's getTerrainHeight(),
// evaluated directly in world [x, z] (the POC's own camera stood right
// where our table sits, so its dist<80 valley-flattening term already
// keeps the ground calm immediately around the table). ---
function getTerrainHeight(x: number, z: number): number {
  let y = Math.sin(x * 0.02) * 8 + Math.cos(z * 0.02) * 8;
  y += Math.sin(x * 0.05 + z * 0.05) * 3;
  const dist = Math.sqrt(x * x + z * z);
  if (dist < 80) {
    const factor = dist / 80;
    y = y * factor + y * 0.2 * (1 - factor);
  }
  return y;
}

const TERRAIN_BASE_Y = -0.02;
const TERRAIN_HALF_WIDTH = 300; // POC: PlaneGeometry(600, ...)
const TERRAIN_NEAR_Z = 15;
const TERRAIN_FAR_Z = -205; // 220-deep, close to the POC's 400-deep plane once table-fronting is discounted
const TERRAIN_SEGMENTS_X = 100; // POC: 100 segments
const TERRAIN_SEGMENTS_Z = 80; // POC: 80 segments

/** Builds the POC's rolling terrain grid, with a hole cut for the table
 * footprint (see module doc — the one necessary departure from the POC). */
function buildTerrain(): THREE.Mesh {
  const segX = TERRAIN_SEGMENTS_X;
  const segZ = TERRAIN_SEGMENTS_Z;
  const vertsX = segX + 1;
  const depth = TERRAIN_NEAR_Z - TERRAIN_FAR_Z;

  const positions = new Float32Array((segX + 1) * (segZ + 1) * 3);
  for (let iz = 0; iz <= segZ; iz++) {
    const z = TERRAIN_NEAR_Z - (iz / segZ) * depth;
    for (let ix = 0; ix <= segX; ix++) {
      const x = -TERRAIN_HALF_WIDTH + (ix / segX) * TERRAIN_HALF_WIDTH * 2;
      const vi = iz * vertsX + ix;
      positions[vi * 3] = x;
      positions[vi * 3 + 1] = TERRAIN_BASE_Y + getTerrainHeight(x, z);
      positions[vi * 3 + 2] = z;
    }
  }

  const indices: number[] = [];
  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iz * vertsX + ix;
      const b = a + 1;
      const c = a + vertsX;
      const d = c + 1;
      // Skip any quad touching the table footprint (inset slightly so the
      // remaining ground tucks a little under the tabletop's edge rather
      // than leaving a gap of sky between meadow and table).
      const corners: Array<[number, number]> = [
        [positions[a * 3], positions[a * 3 + 2]],
        [positions[b * 3], positions[b * 3 + 2]],
        [positions[c * 3], positions[c * 3 + 2]],
        [positions[d * 3], positions[d * 3 + 2]],
      ];
      if (corners.some(([cx, cz]) => isOverTable(cx, cz, -0.4))) continue;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x7b9c44, // verbatim POC terrain colour
    flatShading: true,
    roughness: 0.8,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

// --- Mountains — verbatim port of the POC's createMountains() height
// formula (jagged abs(sin) peaks, no table concern since they sit far
// enough back to never overlap the table's z-range). ---
const MOUNTAIN_HALF_WIDTH = 500; // POC: PlaneGeometry(1000, ...)
// A small overlap with the terrain's own far edge (z=-205) so the two
// meshes' edges tuck into each other with no seam — enough overlap to
// close the gap (which showed background sky as a fake "lake" band), but
// far short of the ~100-unit overlap that caused the original z-fighting.
const MOUNTAIN_NEAR_Z = -203;
const MOUNTAIN_FAR_Z = -403; // 200-deep, matching the POC's plane depth
const MOUNTAIN_SEGMENTS_X = 80; // POC: 80 segments
const MOUNTAIN_SEGMENTS_Z = 20; // POC: 20 segments
// Well below the terrain's own lowest possible dip (~-19) so the mountain
// plane's base never floats above a gap of sky where the terrain valley
// happens to dip lower than the mountain's near edge (which often clamps
// to 0 height).
const MOUNTAIN_BASE_Y = -30;

function buildMountains(): THREE.Mesh {
  const segX = MOUNTAIN_SEGMENTS_X;
  const segZ = MOUNTAIN_SEGMENTS_Z;
  const vertsX = segX + 1;
  const localDepth = MOUNTAIN_NEAR_Z - MOUNTAIN_FAR_Z;

  const positions = new Float32Array((segX + 1) * (segZ + 1) * 3);
  for (let iz = 0; iz <= segZ; iz++) {
    // Local z as the POC's own formula uses it (pre-translation, centred
    // on the plane), separate from world z (post-translation).
    const localZ = -localDepth / 2 + (iz / segZ) * localDepth;
    const worldZ = MOUNTAIN_NEAR_Z - (iz / segZ) * localDepth;
    for (let ix = 0; ix <= segX; ix++) {
      const localX = -MOUNTAIN_HALF_WIDTH + (ix / segX) * MOUNTAIN_HALF_WIDTH * 2;
      // Verbatim POC formula, mirrored front-to-back (180°, same footprint):
      // the POC's own camera stands past the near edge looking toward the
      // far edge, so its "-localZ*0.4" makes the near edge tallest. Our
      // camera looks the opposite way down the same axis, so that reads as
      // a wall right behind the terrain instead of foothills-into-peaks;
      // flipping the sign turns the whole ridge around in place.
      let y = Math.abs(Math.sin(localX * 0.008)) * 45 + Math.random() * 10;
      y += localZ * 0.4;
      y -= Math.abs(localX * 0.03);
      y = Math.max(0, y);
      const vi = iz * vertsX + ix;
      positions[vi * 3] = localX;
      positions[vi * 3 + 1] = MOUNTAIN_BASE_Y + y;
      positions[vi * 3 + 2] = worldZ;
    }
  }

  const indices: number[] = [];
  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iz * vertsX + ix;
      const b = a + 1;
      const c = a + vertsX;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x8a8b75, // verbatim POC mountain colour
    flatShading: true,
    roughness: 0.9,
  });
  return new THREE.Mesh(geometry, material);
}

// --- Clouds — verbatim port of the POC's createClouds(): each cloud is a
// cluster of 4-7 squashed icosahedra "parts" plus 2-4 smaller "particle"
// wisps, all sharing one material. ---
const CLOUD_COUNT = 15; // POC: 15 clouds

interface CloudInstance {
  group: THREE.Group;
  speed: number;
  bobSpeed: number;
  bobOffset: number;
}

function buildCloud(cloudGeo: THREE.IcosahedronGeometry, particleGeo: THREE.IcosahedronGeometry, material: THREE.Material): THREE.Group {
  const cloud = new THREE.Group();
  const partCount = 4 + Math.floor(Math.random() * 4); // POC: 4-7
  for (let i = 0; i < partCount; i++) {
    const part = new THREE.Mesh(cloudGeo, material);
    part.position.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 4);
    const scale = 1 + Math.random() * 2.5; // POC: 1-3.5
    part.scale.set(scale, scale * 0.6, scale);
    part.castShadow = true;
    cloud.add(part);
  }
  const particleCount = 2 + Math.floor(Math.random() * 3); // POC: 2-4
  for (let i = 0; i < particleCount; i++) {
    const particle = new THREE.Mesh(particleGeo, material);
    particle.position.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8);
    particle.castShadow = true;
    cloud.add(particle);
  }
  return cloud;
}

function buildClouds(): { group: THREE.Group; clouds: CloudInstance[] } {
  const cloudGeo = new THREE.IcosahedronGeometry(1, 0);
  const particleGeo = new THREE.IcosahedronGeometry(0.4, 0);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    flatShading: true,
    transparent: true,
    opacity: 0.95,
  });
  const group = new THREE.Group();
  const clouds: CloudInstance[] = [];
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const cloud = buildCloud(cloudGeo, particleGeo, material);
    cloud.position.set(
      (Math.random() - 0.5) * 250, // POC: x spread ±125
      35 + Math.random() * 25, // POC: y 35-60
      -40 - Math.random() * 100, // POC: z -40..-140
    );
    group.add(cloud);
    clouds.push({
      group: cloud,
      speed: 0.01 + Math.random() * 0.02, // POC: 0.01-0.03
      bobSpeed: 0.01 + Math.random() * 0.02, // POC: 0.01-0.03
      bobOffset: Math.random() * Math.PI * 2,
    });
  }
  return { group, clouds };
}

// --- Trees — verbatim port of the POC's createTrees(): a single species
// (cylinder trunk + dodecahedron canopy), no multi-species system. ---
const TREE_COUNT = 70; // denser + spread across the whole meadow, not just the near foreground

function buildTrees(): THREE.Group {
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 2, 5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, flatShading: true });
  const leavesGeo = new THREE.DodecahedronGeometry(2, 0);
  const leavesMat = new THREE.MeshStandardMaterial({ color: 0x3a5f0b, flatShading: true });

  const group = new THREE.Group();
  for (let i = 0; i < TREE_COUNT; i++) {
    const tree = new THREE.Group();

    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    tree.add(trunk);

    const leaves = new THREE.Mesh(leavesGeo, leavesMat);
    leaves.position.y = 2.5;
    leaves.scale.set(1 + Math.random() * 0.5, 1 + Math.random() * 0.5, 1 + Math.random() * 0.5);
    leaves.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    tree.add(leaves);

    let x = (Math.random() - 0.5) * 340; // spread across the full meadow width
    let z = -10 - Math.random() * 185; // out to near the mountain seam
    [x, z] = pushClearOfTable(x, z, 1.5);
    const y = TERRAIN_BASE_Y + getTerrainHeight(x, z) - 0.2; // POC buries the base slightly to hide any seam
    tree.position.set(x, y, z);
    group.add(tree);
  }
  return group;
}

// --- Sheep — box body/head + cylinder legs (same low-poly build as the
// POC's createSheep()), but each one now wanders a home patch of meadow,
// pauses to graze (head tilts down), and idles, instead of standing
// frozen. Simple per-agent state machine + a straight-line steer toward a
// randomly re-picked target — the standard lightweight "critter AI"
// pattern for background wildlife that doesn't need a full skeleton/walk
// cycle (see threejs-animation skill: procedural motion via a per-frame
// clock is the recommended approach when there's no rig to drive). ---
const SHEEP_COUNT = 45; // denser + spread across the whole meadow, not just the near foreground
const SHEEP_LEG_OFFSETS: Array<[number, number, number]> = [
  [-0.4, 0.4, 0.5],
  [0.4, 0.4, 0.5],
  [-0.4, 0.4, -0.5],
  [0.4, 0.4, -0.5],
];

const SHEEP_ROAM_RADIUS = 16; // how far a sheep wanders from its own spawn point
const SHEEP_WALK_SPEED = 1.0; // units/sec, deliberately slow/grazing-paced
const SHEEP_TURN_SPEED = 3.0; // rad/sec turn-to-face smoothing
const SHEEP_ARRIVE_DIST = 0.3;
const SHEEP_IDLE_MIN = 1.5;
const SHEEP_IDLE_MAX = 4;
const SHEEP_GRAZE_MIN = 3;
const SHEEP_GRAZE_MAX = 7;
const SHEEP_HEAD_GRAZE_TILT = 0.7;

type SheepMode = 'idle' | 'walking' | 'grazing';

interface SheepAgent {
  node: THREE.Group;
  head: THREE.Mesh;
  homeX: number;
  homeZ: number;
  targetX: number;
  targetZ: number;
  mode: SheepMode;
  timer: number;
  bobPhase: number;
  facing: number;
}

function pickSheepTarget(agent: SheepAgent): void {
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.random() * SHEEP_ROAM_RADIUS;
  let x = agent.homeX + Math.cos(angle) * dist;
  let z = agent.homeZ + Math.sin(angle) * dist;
  [x, z] = pushClearOfTable(x, z, 1.5);
  agent.targetX = x;
  agent.targetZ = z;
}

function buildSheep(): { group: THREE.Group; agents: SheepAgent[] } {
  const bodyGeo = new THREE.BoxGeometry(1.2, 0.8, 1.5);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, flatShading: true });
  const darkGeo = new THREE.BoxGeometry(0.5, 0.5, 0.6);
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222, flatShading: true });
  const legGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 4);

  const group = new THREE.Group();
  const agents: SheepAgent[] = [];
  for (let i = 0; i < SHEEP_COUNT; i++) {
    const sheep = new THREE.Group();

    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.8;
    body.castShadow = true;
    sheep.add(body);

    const head = new THREE.Mesh(darkGeo, darkMat);
    head.position.set(0, 1.2, 0.8);
    head.castShadow = true;
    sheep.add(head);

    for (const [lx, ly, lz] of SHEEP_LEG_OFFSETS) {
      const leg = new THREE.Mesh(legGeo, darkMat);
      leg.position.set(lx, ly, lz);
      leg.castShadow = true;
      sheep.add(leg);
    }

    let x = (Math.random() - 0.5) * 320; // spread across the full meadow width
    let z = -5 - Math.random() * 175; // out to near the mountain seam
    [x, z] = pushClearOfTable(x, z, 1.5);
    const y = TERRAIN_BASE_Y + getTerrainHeight(x, z);
    const facing = Math.random() * Math.PI * 2;
    sheep.position.set(x, y, z);
    sheep.rotation.y = facing;
    group.add(sheep);

    agents.push({
      node: sheep,
      head,
      homeX: x,
      homeZ: z,
      targetX: x,
      targetZ: z,
      mode: 'idle',
      timer: SHEEP_IDLE_MIN + Math.random() * (SHEEP_IDLE_MAX - SHEEP_IDLE_MIN),
      bobPhase: Math.random() * Math.PI * 2,
      facing,
    });
  }
  return { group, agents };
}

/** Advances every sheep's idle/graze/walk state machine one frame. Called
 * from the backdrop's `update()` with the real per-frame `dt` (not the
 * build-in clock), same as any other procedural motion in this file. */
function updateSheep(agents: SheepAgent[], dt: number): void {
  for (const agent of agents) {
    agent.bobPhase += dt;
    switch (agent.mode) {
      case 'idle': {
        agent.timer -= dt;
        agent.head.rotation.x = Math.sin(agent.bobPhase * 0.8) * 0.05;
        if (agent.timer <= 0) {
          agent.mode = 'grazing';
          agent.timer = SHEEP_GRAZE_MIN + Math.random() * (SHEEP_GRAZE_MAX - SHEEP_GRAZE_MIN);
        }
        break;
      }
      case 'grazing': {
        agent.timer -= dt;
        agent.head.rotation.x = SHEEP_HEAD_GRAZE_TILT + Math.sin(agent.bobPhase * 2) * 0.04;
        if (agent.timer <= 0) {
          agent.head.rotation.x = 0;
          pickSheepTarget(agent);
          agent.mode = 'walking';
        }
        break;
      }
      case 'walking': {
        const dx = agent.targetX - agent.node.position.x;
        const dz = agent.targetZ - agent.node.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < SHEEP_ARRIVE_DIST) {
          agent.mode = 'idle';
          agent.timer = SHEEP_IDLE_MIN + Math.random() * (SHEEP_IDLE_MAX - SHEEP_IDLE_MIN);
          break;
        }
        const step = Math.min(dist, SHEEP_WALK_SPEED * dt);
        const nx = agent.node.position.x + (dx / dist) * step;
        const nz = agent.node.position.z + (dz / dist) * step;
        const walkBob = Math.abs(Math.sin(agent.bobPhase * 7)) * 0.05;
        agent.node.position.set(nx, TERRAIN_BASE_Y + getTerrainHeight(nx, nz) + walkBob, nz);

        const desiredFacing = Math.atan2(dx, dz);
        const diff = Math.atan2(Math.sin(desiredFacing - agent.facing), Math.cos(desiredFacing - agent.facing));
        agent.facing += diff * Math.min(1, SHEEP_TURN_SPEED * dt);
        agent.node.rotation.y = agent.facing;
        agent.head.rotation.x = Math.sin(agent.bobPhase * 6) * 0.04;
        break;
      }
    }
  }
}

// --- Grass — verbatim geometry from the POC's instanced foreground grass
// blades (`createForegroundElements`), scattered across the near meadow
// instead of the POC's single foreground mound (this scene has no mound —
// the table stands where the POC's mound/hiker legs did). Wind sway is
// added via `onBeforeCompile` (the standard low-cost way to animate an
// InstancedMesh without touching per-instance CPU-side matrices every
// frame — see threejs-shaders skill): a sine offset driven by a `time`
// uniform, scaled by each vertex's height along the blade (0 at the base,
// full at the tip) so blades bend rather than translate rigidly, phase-
// shifted per instance by its own position so the whole meadow doesn't
// sway in lockstep. ---
const GRASS_COUNT = 3000; // denser + spread across the whole meadow, not just the near foreground
const GRASS_BLADE_HEIGHT = 1.5;
const GRASS_WIND_SPEED = 1.6;
const GRASS_WIND_STRENGTH = 0.14;

function buildGrass(): THREE.InstancedMesh {
  const grassGeo = new THREE.ConeGeometry(0.15, GRASS_BLADE_HEIGHT, 3);
  grassGeo.translate(0, GRASS_BLADE_HEIGHT / 2, 0); // POC: pivot shifted to the base
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x5c7c2b, flatShading: true });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.time = { value: 0 };
    grassMat.userData.shader = shader;
    shader.vertexShader = `uniform float time;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
      vec3 grassInstancePos = instanceMatrix[3].xyz;
      #else
      vec3 grassInstancePos = vec3(0.0);
      #endif
      float grassHeightFactor = clamp(transformed.y / ${GRASS_BLADE_HEIGHT.toFixed(2)}, 0.0, 1.0);
      float grassSway = sin(time * ${GRASS_WIND_SPEED.toFixed(2)} + grassInstancePos.x * 0.6 + grassInstancePos.z * 0.4) * ${GRASS_WIND_STRENGTH.toFixed(2)} * grassHeightFactor * grassHeightFactor;
      transformed.x += grassSway;
      transformed.z += grassSway * 0.6;`,
    );
  };
  const mesh = new THREE.InstancedMesh(grassGeo, grassMat, GRASS_COUNT);
  mesh.castShadow = true;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < GRASS_COUNT; i++) {
    let x = (Math.random() - 0.5) * 580; // spread across the full meadow width
    let z = -3 - Math.random() * 200; // out to near the mountain seam
    [x, z] = pushClearOfTable(x, z, 0.5);
    const y = TERRAIN_BASE_Y + getTerrainHeight(x, z);
    dummy.position.set(x, y, z);
    const scale = 0.5 + Math.random();
    dummy.scale.set(scale, scale * (1 + Math.random()), scale);
    dummy.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * Math.PI, (Math.random() - 0.5) * 0.4);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  return mesh;
}

function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
      child.geometry.dispose();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
    }
  });
}

export const createSummerMeadowDayBackdrop: BackdropFactory = (scene) => {
  const previousBackground = scene.background;
  // Kept just under the bloom pass's luminance threshold (0.65) — a
  // brighter pastel here blows the whole background out to white through
  // `UnrealBloomPass` since it treats the background as part of the lit
  // scene.
  scene.background = new THREE.Color(0x5f8fc2);

  // Verbatim POC lighting rig (ambient + warm sun key + cool sky fill),
  // keeping this project's existing tight shadow-camera frustum since
  // that's tuned for the turntable diorama's own shadow quality, not part
  // of "the nature scene" itself.
  const ambientLight = new THREE.AmbientLight(0xfff0e6, 0.9);
  scene.add(ambientLight);
  const sunLight = new THREE.DirectionalLight(0xffdcb4, 1.6);
  sunLight.position.set(5, 10, 4);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  const sunShadowCam = sunLight.shadow.camera as THREE.OrthographicCamera;
  sunShadowCam.left = -3;
  sunShadowCam.right = 3;
  sunShadowCam.top = 3;
  sunShadowCam.bottom = -3;
  sunShadowCam.near = 1;
  sunShadowCam.far = 20;
  sunLight.shadow.bias = -0.001;
  scene.add(sunLight);
  scene.add(sunLight.target);
  const fillLight = new THREE.DirectionalLight(0x87ceeb, 0.4);
  fillLight.position.set(-4, 5, 5);
  scene.add(fillLight);

  const { group: cloudGroup, clouds } = buildClouds();
  scene.add(cloudGroup);

  const terrain = buildTerrain();
  const mountains = buildMountains();
  const trees = buildTrees();
  const { group: sheep, agents: sheepAgents } = buildSheep();
  const grass = buildGrass();
  const grassShaderUniforms = (): { time: { value: number } } | null =>
    (grass.material as THREE.MeshStandardMaterial).userData.shader?.uniforms ?? null;

  const dressingGroup = new THREE.Group();
  dressingGroup.add(terrain, mountains, trees, sheep, grass);
  scene.add(dressingGroup);

  // Clouds + dressing fade/scale in on load (same build-in convention
  // every other backdrop preset uses), then clouds drift + bob per the
  // POC's own per-frame motion (its animate() runs once per rAF and
  // accumulates position each call rather than using real elapsed time —
  // `update()` here is likewise called once per rendered frame, so this
  // mirrors that behaviour directly rather than reworking it into a
  // delta-time formula). Sheep AI and grass wind sway use real `dt`/
  // `assembleClock` instead, since those need actual elapsed seconds.
  let buildProgress = 0;
  const BUILD_DURATION = 1.5;
  let frameTime = 0;

  const handle: BackdropHandle = {
    update(assembleClock, dt) {
      if (buildProgress < 1) {
        buildProgress = Math.min(1, assembleClock / BUILD_DURATION);
        const eased = buildProgress * buildProgress * (3 - 2 * buildProgress);
        cloudGroup.scale.setScalar(eased);
        dressingGroup.scale.setScalar(eased);
      }
      frameTime += 1;
      for (const cloud of clouds) {
        cloud.group.position.x -= cloud.speed;
        cloud.group.position.y += Math.sin(frameTime * cloud.bobSpeed + cloud.bobOffset) * 0.005;
        if (cloud.group.position.x < -150) {
          cloud.group.position.x = 150;
          cloud.group.position.z = -40 - Math.random() * 100;
          cloud.group.position.y = 35 + Math.random() * 25;
        }
      }
      updateSheep(sheepAgents, dt);
      const grassUniforms = grassShaderUniforms();
      if (grassUniforms) grassUniforms.time.value = assembleClock;
    },
    dispose() {
      scene.remove(ambientLight, sunLight, sunLight.target, fillLight, cloudGroup, dressingGroup);
      disposeObject3D(cloudGroup);
      disposeObject3D(dressingGroup);
      scene.background = previousBackground;
    },
  };
  return handle;
};
