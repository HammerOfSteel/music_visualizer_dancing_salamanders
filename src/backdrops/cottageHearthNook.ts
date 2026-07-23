/**
 * "Cottage hearth nook" backdrop preset (Phase 3.7 #3, reworked) — a cosy
 * timber room behind/around the table: a stacked-stone fireplace with a
 * mantle (lantern, framed picture, potted plant), a curtained window
 * looking out on a starry night sky with a couple of slow-drifting
 * low-poly clouds, plank walls/floor/ceiling beams, a rug in front of the
 * hearth, a bookshelf on one side, and a doorway glimpsing into a lit
 * kitchen on the other. Fixed in world space, same pattern as
 * `moonlitIsle`/`summerMeadowDay`.
 *
 * IMPORTANT world-placement note: this backdrop's own `scene`-space
 * content is NOT positioned near the world origin the way you might
 * expect — the table/turntable diorama lives high up in world space
 * (`tableGroup` sits at world y=27, see `main.ts`), and the default
 * camera (~y=33, pitched steeply down toward y=21.5/z=-27.6) only has a
 * clear view of world-space content that's roughly at *table height*
 * (y in the high-20s/low-30s) and comfortably behind the table in Z —
 * anything placed near world-origin height falls entirely below the
 * visible frame from this camera. Props (fireplace stones, mantle decor,
 * window, curtains) are kept at realistic room-scale — an earlier pass
 * that blew every prop up ~2.8x to physically fill the frame looked
 * wrong (oversized, doll's-house-in-reverse). Instead, screen coverage
 * comes from making the ROOM ITSELF wide/tall (`ROOM_HALF_WIDTH`,
 * `ROOM_CEIL_Y`) and filling the newly-opened sides with more room
 * content (bookshelf, kitchen doorway) rather than scaling furniture up.
 */
import * as THREE from 'three';
import type { BackdropHandle, BackdropFactory } from './types';

// --- Room placement (see module doc above for why these aren't near 0) ---
const ROOM_FLOOR_Y = 24;
const ROOM_CEIL_Y = 37;
const WALL_Z = -18;
const ROOM_HALF_WIDTH = 20;

const FIRE_X = -3.5;
const WINDOW_X = 4;
const WINDOW_HALF_WIDTH = 1.6;
const WINDOW_BOTTOM_Y = 26;
const WINDOW_TOP_Y = 31;

const BOOKSHELF_X = -14.5;
const DOORWAY_X = 13.5;

// Kept at 1 (i.e. a no-op) — props are back to realistic room-scale
// per the module doc above; left in place in case future tuning wants a
// gentle uniform nudge without touching every call site.
const PROP_SCALE = 1;

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const m of material) m.dispose();
  } else {
    material.dispose();
  }
}

/** Disposes every mesh/points geometry+material found under `root`, then
 * removes `root` itself from `scene` — the generic cleanup path for this
 * backdrop's room dressing, which is deep enough (walls, fireplace,
 * window, curtains, rug, decor) that tracking each geometry/material by
 * hand would be unwieldy. Disposing a shared material/geometry more than
 * once (a few meshes here intentionally share one) is a harmless no-op in
 * three.js. */
function disposeRoom(scene: THREE.Scene, root: THREE.Group): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
      obj.geometry.dispose();
      disposeMaterial(obj.material);
    }
  });
  scene.remove(root);
}

// --- Fireplace: an irregular stack of flat-shaded "stone" boxes forming a
// rough chimney breast, a darker inset firebox cavity, and a mantle shelf
// sticking out above it. ---
function buildFireplace(): { group: THREE.Group; fireOrigin: THREE.Object3D; mantleTopY: number } {
  const group = new THREE.Group();

  const stoneMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x6e6459, roughness: 0.95, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x7d7266, roughness: 0.95, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x5c5349, roughness: 0.95, flatShading: true }),
  ];
  const stoneWidth = 3.6 * PROP_SCALE;
  const stoneDepth = 1.2 * PROP_SCALE;
  const stoneHeight = ROOM_CEIL_Y - ROOM_FLOOR_Y;
  const stoneFrontZ = WALL_Z + stoneDepth;

  // Rough "fieldstone" look: a grid of jittered boxes rather than one flat
  // slab, each a slightly different size/shade.
  const rows = 8;
  const cols = 4;
  // Leave the two centre columns of the bottom two rows empty — that's
  // exactly where the firebox cavity sits below, and a stone with enough
  // random depth there would render in front of (and hide) the opening.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r < 2 && (c === 1 || c === 2)) continue;
      const w = stoneWidth / cols + (Math.random() - 0.5) * (0.3 * PROP_SCALE);
      const h = stoneHeight / rows + (Math.random() - 0.5) * (0.25 * PROP_SCALE);
      const d = stoneDepth * (0.75 + Math.random() * 0.25);
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        stoneMaterials[Math.floor(Math.random() * stoneMaterials.length)],
      );
      box.position.set(
        FIRE_X + (c - (cols - 1) / 2) * (stoneWidth / cols) + (Math.random() - 0.5) * (0.1 * PROP_SCALE),
        ROOM_FLOOR_Y + (r + 0.5) * (stoneHeight / rows),
        WALL_Z + stoneDepth / 2 + (Math.random() - 0.5) * (0.06 * PROP_SCALE),
      );
      group.add(box);
    }
  }

  // Firebox cavity — a dark recessed opening low in the stonework.
  const fireboxWidth = 1.7 * PROP_SCALE;
  const fireboxHeight = 2.0 * PROP_SCALE;
  const fireboxY = ROOM_FLOOR_Y + 1.15 * PROP_SCALE;
  const firebox = new THREE.Mesh(
    new THREE.BoxGeometry(fireboxWidth, fireboxHeight, 0.4 * PROP_SCALE),
    new THREE.MeshStandardMaterial({ color: 0x120a08, roughness: 1 }),
  );
  firebox.position.set(FIRE_X, fireboxY, stoneFrontZ - 0.25 * PROP_SCALE);
  group.add(firebox);

  // Logs sitting in the firebox opening — reads as an actual hearth with
  // fuel in it, rather than a flat dark slab.
  const logMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.9, flatShading: true });
  const emberLogMat = new THREE.MeshStandardMaterial({
    color: 0x2b1c12,
    roughness: 0.9,
    flatShading: true,
    emissive: 0xff5a1a,
    emissiveIntensity: 0.7,
  });
  const logGeo = new THREE.CylinderGeometry(0.14 * PROP_SCALE, 0.17 * PROP_SCALE, fireboxWidth * 0.9, 8);
  const logBaseY = fireboxY - fireboxHeight / 2 + 0.22 * PROP_SCALE;
  const logZ = stoneFrontZ - 0.15 * PROP_SCALE;
  const log1 = new THREE.Mesh(logGeo, logMat);
  log1.rotation.z = Math.PI / 2;
  log1.rotation.y = 0.12;
  log1.position.set(FIRE_X, logBaseY, logZ);
  group.add(log1);
  const log2 = new THREE.Mesh(logGeo, emberLogMat);
  log2.rotation.z = Math.PI / 2;
  log2.rotation.y = -0.16;
  log2.position.set(FIRE_X, logBaseY + 0.16 * PROP_SCALE, logZ + 0.08 * PROP_SCALE);
  group.add(log2);
  const log3 = new THREE.Mesh(logGeo, logMat);
  log3.rotation.z = Math.PI / 2;
  log3.rotation.x = 0.3;
  log3.position.set(FIRE_X + 0.05 * PROP_SCALE, logBaseY + 0.32 * PROP_SCALE, logZ - 0.06 * PROP_SCALE);
  group.add(log3);

  // Mantle shelf — protrudes further than the stone face.
  const mantleY = ROOM_FLOOR_Y + 4.6 * PROP_SCALE;
  const mantleZ = WALL_Z + 1.6 * PROP_SCALE;
  const mantle = new THREE.Mesh(
    new THREE.BoxGeometry(4.4 * PROP_SCALE, 0.32 * PROP_SCALE, 1.6 * PROP_SCALE),
    new THREE.MeshStandardMaterial({ color: 0x2c1d14, roughness: 0.8, flatShading: true }),
  );
  mantle.position.set(FIRE_X, mantleY, mantleZ);
  group.add(mantle);

  const fireOrigin = new THREE.Object3D();
  fireOrigin.position.set(FIRE_X, fireboxY - 0.6 * PROP_SCALE, stoneFrontZ - 0.15 * PROP_SCALE);
  group.add(fireOrigin);

  return { group, fireOrigin, mantleTopY: mantleY + 0.16 * PROP_SCALE };
}

// --- Mantle decor: a lantern, a framed picture on the wall above, and a
// small potted plant. ---
function buildMantleDecor(mantleTopY: number): THREE.Group {
  const group = new THREE.Group();
  const mantleZ = WALL_Z + 1.6 * PROP_SCALE;
  const s = PROP_SCALE;

  // Lantern.
  const lanternBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16 * s, 0.2 * s, 0.12 * s, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.6, flatShading: true }),
  );
  const lanternCage = new THREE.Mesh(
    new THREE.BoxGeometry(0.26 * s, 0.42 * s, 0.26 * s),
    new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 0.5, flatShading: true }),
  );
  lanternCage.position.y = 0.27 * s;
  const lanternGlow = new THREE.Mesh(
    new THREE.BoxGeometry(0.16 * s, 0.3 * s, 0.16 * s),
    new THREE.MeshStandardMaterial({ color: 0xffb15a, emissive: 0xff8a2d, emissiveIntensity: 1.2, roughness: 0.6 }),
  );
  lanternGlow.position.y = 0.27 * s;
  const lantern = new THREE.Group();
  lantern.add(lanternBase, lanternCage, lanternGlow);
  lantern.position.set(FIRE_X - 1.15 * s, mantleTopY, mantleZ + 0.1 * s);
  group.add(lantern);

  // Framed picture, mounted on the wall above the mantle.
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.95 * s, 0.75 * s, 0.08 * s),
    new THREE.MeshStandardMaterial({ color: 0x2c1d14, roughness: 0.7, flatShading: true }),
  );
  const canvas = new THREE.Mesh(
    new THREE.PlaneGeometry(0.75 * s, 0.55 * s),
    new THREE.MeshStandardMaterial({ color: 0x4a6b4a, roughness: 0.9 }),
  );
  canvas.position.z = 0.05 * s;
  frame.add(canvas);
  frame.position.set(FIRE_X, mantleTopY + 1.35 * s, WALL_Z + 0.2 * s);
  group.add(frame);

  // Potted plant.
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14 * s, 0.11 * s, 0.22 * s, 8),
    new THREE.MeshStandardMaterial({ color: 0xb5651d, roughness: 0.9, flatShading: true }),
  );
  const leavesMat = new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 0.85, flatShading: true });
  const leafGeo = new THREE.ConeGeometry(0.13 * s, 0.4 * s, 5);
  const plant = new THREE.Group();
  plant.add(pot);
  for (let i = 0; i < 4; i++) {
    const leaf = new THREE.Mesh(leafGeo, leavesMat);
    const angle = (i / 4) * Math.PI * 2;
    leaf.position.set(Math.cos(angle) * 0.06 * s, 0.28 * s, Math.sin(angle) * 0.06 * s);
    leaf.rotation.z = Math.cos(angle) * 0.35;
    leaf.rotation.x = Math.sin(angle) * 0.35;
    plant.add(leaf);
  }
  plant.position.set(FIRE_X + 1.2 * s, mantleTopY, mantleZ + 0.1 * s);
  group.add(plant);

  return group;
}

// --- Low-poly fire particles: diamond-shaped (octahedron) meshes that
// rise, wobble, shrink and fade, then reset — ported from the reference
// POC's candle-flame technique (`POCs/wood-teturesfor_table_and_low_poly_fire.html`). ---
interface FireParticle {
  mesh: THREE.Mesh;
  life: number;
  speed: number;
  wobbleSpeed: number;
  wobbleOffset: number;
}

const FIRE_PARTICLE_COUNT = 16;
const FIRE_COLORS = [0xffee77, 0xffaa00, 0xff4400];

function buildFireParticles(origin: THREE.Object3D): { group: THREE.Group; particles: FireParticle[] } {
  const group = new THREE.Group();
  const s = PROP_SCALE;
  const geometry = new THREE.OctahedronGeometry(0.1 * s, 0);
  const particles: FireParticle[] = [];
  for (let i = 0; i < FIRE_PARTICLE_COUNT; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)],
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    const life = Math.random();
    mesh.position.set((Math.random() - 0.5) * 0.25 * s, life * 0.5 * s, (Math.random() - 0.5) * 0.25 * s);
    group.add(mesh);
    particles.push({
      mesh,
      life,
      speed: 0.4 + Math.random() * 0.5,
      wobbleSpeed: 2 + Math.random() * 5,
      wobbleOffset: Math.random() * Math.PI * 2,
    });
  }
  origin.add(group);
  return { group, particles };
}

// --- Window: frame, night-sky plane, stars, a small moon, and a couple of
// slow-drifting low-poly clouds, flanked by simple curtains. ---
interface WindowCloud {
  group: THREE.Group;
  speed: number;
}

function buildWindow(): { group: THREE.Group; clouds: WindowCloud[]; skyMaterial: THREE.Material } {
  const group = new THREE.Group();
  const s = PROP_SCALE;
  const skyZ = WALL_Z + 0.05 * s;
  const frameZ = WALL_Z + 0.15 * s;
  const windowWidth = WINDOW_HALF_WIDTH * 2;
  const windowHeight = WINDOW_TOP_Y - WINDOW_BOTTOM_Y;
  const windowCenterY = (WINDOW_TOP_Y + WINDOW_BOTTOM_Y) / 2;

  // Night sky backing.
  const skyMaterial = new THREE.MeshBasicMaterial({ color: 0x0a1230 });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(windowWidth, windowHeight), skyMaterial);
  sky.position.set(WINDOW_X, windowCenterY, skyZ);
  group.add(sky);

  // Stars.
  const starCount = 60;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3] = WINDOW_X + (Math.random() - 0.5) * (windowWidth - 0.4);
    starPositions[i * 3 + 1] = WINDOW_BOTTOM_Y + Math.random() * windowHeight;
    starPositions[i * 3 + 2] = skyZ + 0.02 * s;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({ color: 0xfff6dd, size: 0.1 * s, transparent: true, opacity: 0.9 });
  const stars = new THREE.Points(starGeometry, starMaterial);
  group.add(stars);

  // Small moon.
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(0.28 * s, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xf3ecd8, emissive: 0xdcd3ad, emissiveIntensity: 0.9, roughness: 0.9 }),
  );
  moon.position.set(WINDOW_X + 0.7 * s, WINDOW_TOP_Y - 0.8 * s, skyZ + 0.03 * s);
  group.add(moon);

  // A couple of small, slow-drifting low-poly clouds, confined to the
  // window's width so they read as passing behind the frame.
  const cloudGeo = new THREE.IcosahedronGeometry(0.16 * s, 0);
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xb7c2d9, flatShading: true, transparent: true, opacity: 0.9 });
  const clouds: WindowCloud[] = [];
  const cloudCount = 3;
  for (let i = 0; i < cloudCount; i++) {
    const cloud = new THREE.Group();
    const partCount = 2 + Math.floor(Math.random() * 2);
    for (let p = 0; p < partCount; p++) {
      const part = new THREE.Mesh(cloudGeo, cloudMat);
      part.position.set((Math.random() - 0.5) * 0.3 * s, (Math.random() - 0.5) * 0.08 * s, 0);
      const scale = 0.7 + Math.random() * 0.6;
      part.scale.set(scale, scale * 0.6, scale);
      cloud.add(part);
    }
    cloud.position.set(
      WINDOW_X - WINDOW_HALF_WIDTH + Math.random() * windowWidth,
      WINDOW_BOTTOM_Y + windowHeight * (0.45 + Math.random() * 0.4),
      skyZ + 0.025 * s,
    );
    group.add(cloud);
    clouds.push({ group: cloud, speed: 0.08 + Math.random() * 0.09 });
  }

  // Frame.
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x2c1d14, roughness: 0.8, flatShading: true });
  const frameThickness = 0.12 * s;
  const horizGeo = new THREE.BoxGeometry(windowWidth + frameThickness * 2, frameThickness, 0.14 * s);
  const vertGeo = new THREE.BoxGeometry(frameThickness, windowHeight, 0.14 * s);
  const top = new THREE.Mesh(horizGeo, frameMaterial);
  top.position.set(WINDOW_X, WINDOW_TOP_Y + frameThickness / 2, frameZ);
  const bottom = new THREE.Mesh(horizGeo, frameMaterial);
  bottom.position.set(WINDOW_X, WINDOW_BOTTOM_Y - frameThickness / 2, frameZ);
  const left = new THREE.Mesh(vertGeo, frameMaterial);
  left.position.set(WINDOW_X - WINDOW_HALF_WIDTH, windowCenterY, frameZ);
  const right = new THREE.Mesh(vertGeo, frameMaterial);
  right.position.set(WINDOW_X + WINDOW_HALF_WIDTH, windowCenterY, frameZ);
  const mullion = new THREE.Mesh(new THREE.BoxGeometry(frameThickness * 0.8, windowHeight, 0.12 * s), frameMaterial);
  mullion.position.set(WINDOW_X, windowCenterY, frameZ);
  group.add(top, bottom, left, right, mullion);

  // Curtains flanking the window, plus a rod.
  const curtainMaterial = new THREE.MeshStandardMaterial({ color: 0xcbb994, roughness: 0.85, side: THREE.DoubleSide });
  const curtainGeo = new THREE.PlaneGeometry(0.7 * s, windowHeight + 0.5 * s, 4, 1);
  const curtainPos = curtainGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < curtainPos.count; i++) {
    const x = curtainPos.getX(i);
    curtainPos.setZ(i, Math.sin(x * (6 / s)) * 0.08 * s);
  }
  curtainGeo.computeVertexNormals();
  const leftCurtain = new THREE.Mesh(curtainGeo, curtainMaterial);
  leftCurtain.position.set(WINDOW_X - WINDOW_HALF_WIDTH - 0.55 * s, windowCenterY - 0.25 * s, frameZ + 0.1 * s);
  leftCurtain.rotation.y = 0.15;
  const rightCurtain = new THREE.Mesh(curtainGeo, curtainMaterial);
  rightCurtain.position.set(WINDOW_X + WINDOW_HALF_WIDTH + 0.55 * s, windowCenterY - 0.25 * s, frameZ + 0.1 * s);
  rightCurtain.rotation.y = -0.15;
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05 * s, 0.05 * s, windowWidth + 2.2 * s, 8),
    new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 0.5, flatShading: true }),
  );
  rod.rotation.z = Math.PI / 2;
  rod.position.set(WINDOW_X, WINDOW_TOP_Y + 0.35 * s, frameZ + 0.1 * s);
  group.add(leftCurtain, rightCurtain, rod);

  return { group, clouds, skyMaterial };
}

// --- Rug, in front of the hearth. ---
function buildRug(): THREE.Group {
  const group = new THREE.Group();
  const s = PROP_SCALE;
  const rugZ = WALL_Z + 5.5 * s;
  const under = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2 * s, 3 * s),
    new THREE.MeshStandardMaterial({ color: 0x6b2a2a, roughness: 0.95 }),
  );
  under.rotation.x = -Math.PI / 2;
  under.position.set(FIRE_X + 1.2 * s, ROOM_FLOOR_Y + 0.03 * s, rugZ);
  const accent = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4 * s, 2.3 * s),
    new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.95 }),
  );
  accent.rotation.x = -Math.PI / 2;
  accent.position.set(FIRE_X + 1.2 * s, ROOM_FLOOR_Y + 0.04 * s, rugZ);
  group.add(under, accent);
  return group;
}

// --- Bookshelf, filling out the far-left side of the room. ---
function buildBookshelf(): THREE.Group {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x2c1d14, roughness: 0.8, flatShading: true });
  const shelfWidth = 3.6;
  const shelfHeight = 8.2;
  const shelfDepth = 1.0;
  const shelfZ = WALL_Z + shelfDepth / 2 + 0.05;
  const baseY = ROOM_FLOOR_Y;

  // Carcass: back panel + top/bottom/side boards.
  const back = new THREE.Mesh(new THREE.BoxGeometry(shelfWidth, shelfHeight, 0.12), woodMat);
  back.position.set(BOOKSHELF_X, baseY + shelfHeight / 2, WALL_Z + 0.1);
  group.add(back);

  const sideGeo = new THREE.BoxGeometry(0.14, shelfHeight, shelfDepth);
  const leftSide = new THREE.Mesh(sideGeo, woodMat);
  leftSide.position.set(BOOKSHELF_X - shelfWidth / 2, baseY + shelfHeight / 2, shelfZ);
  const rightSide = new THREE.Mesh(sideGeo, woodMat);
  rightSide.position.set(BOOKSHELF_X + shelfWidth / 2, baseY + shelfHeight / 2, shelfZ);
  group.add(leftSide, rightSide);

  const shelfLevels = 5;
  const boardGeo = new THREE.BoxGeometry(shelfWidth, 0.1, shelfDepth);
  const bookColors = [0x8a3b3b, 0x3b5f8a, 0x3f6b3a, 0xb08a4a, 0x5c3f6b, 0x8a6a3b];
  for (let level = 0; level <= shelfLevels; level++) {
    const y = baseY + (level / shelfLevels) * (shelfHeight - 0.3) + 0.15;
    const board = new THREE.Mesh(boardGeo, woodMat);
    board.position.set(BOOKSHELF_X, y, shelfZ);
    group.add(board);

    // A row of jittered "book" boxes standing on this shelf (skip the top
    // board, which acts as the unit's roof).
    if (level < shelfLevels) {
      const rowY = y + 0.06;
      const bookCount = 6 + Math.floor(Math.random() * 3);
      let cursor = -shelfWidth / 2 + 0.15;
      for (let i = 0; i < bookCount && cursor < shelfWidth / 2 - 0.15; i++) {
        const bw = 0.14 + Math.random() * 0.16;
        const bh = 0.45 + Math.random() * 0.35;
        const bd = shelfDepth * (0.6 + Math.random() * 0.3);
        const book = new THREE.Mesh(
          new THREE.BoxGeometry(bw, bh, bd),
          new THREE.MeshStandardMaterial({
            color: bookColors[Math.floor(Math.random() * bookColors.length)],
            roughness: 0.85,
            flatShading: true,
          }),
        );
        book.position.set(BOOKSHELF_X + cursor + bw / 2, rowY + bh / 2, shelfZ);
        book.rotation.z = (Math.random() - 0.5) * 0.08;
        group.add(book);
        cursor += bw + 0.02;
      }
    }
  }

  return group;
}

// --- Doorway to the kitchen: a proper closed wooden door set in a stone
// archway (matching the new stone side/back walls), with a warm sliver of
// light glowing from underneath rather than the whole opening lit up. ---
function buildKitchenDoorway(): { group: THREE.Group; glowLight: THREE.PointLight } {
  const group = new THREE.Group();
  const doorWidth = 3.6;
  const doorHeight = 8.4;
  const doorBottomY = ROOM_FLOOR_Y;
  const doorTopY = doorBottomY + doorHeight;
  const doorCenterY = (doorBottomY + doorTopY) / 2;

  // Stone archway surround (matches the side/back wall stonework).
  const archMat = new THREE.MeshStandardMaterial({ color: 0x6e6459, roughness: 0.95, flatShading: true });
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 0.9, 0.6, 0.5), archMat);
  lintel.position.set(DOORWAY_X, doorTopY + 0.3, WALL_Z + 0.35);
  const jambGeo = new THREE.BoxGeometry(0.45, doorHeight, 0.5);
  const leftJamb = new THREE.Mesh(jambGeo, archMat);
  leftJamb.position.set(DOORWAY_X - doorWidth / 2 - 0.22, doorCenterY, WALL_Z + 0.35);
  const rightJamb = new THREE.Mesh(jambGeo, archMat);
  rightJamb.position.set(DOORWAY_X + doorWidth / 2 + 0.22, doorCenterY, WALL_Z + 0.35);
  group.add(lintel, leftJamb, rightJamb);

  // Closed wooden door slab, recessed slightly inside the archway.
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.75, flatShading: true });
  const doorSlab = new THREE.Mesh(new THREE.BoxGeometry(doorWidth - 0.2, doorHeight - 0.2, 0.15), doorMat);
  doorSlab.position.set(DOORWAY_X, doorCenterY, WALL_Z + 0.15);
  group.add(doorSlab);

  // Raised panel detailing — a 2x3 grid of proud rectangles for a
  // panelled-door texture.
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.7, flatShading: true });
  const panelCols = 2;
  const panelRows = 3;
  const panelW = (doorWidth - 0.7) / panelCols - 0.15;
  const panelH = (doorHeight - 0.7) / panelRows - 0.2;
  for (let pr = 0; pr < panelRows; pr++) {
    for (let pc = 0; pc < panelCols; pc++) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, 0.05), panelMat);
      panel.position.set(
        DOORWAY_X - (doorWidth - 0.7) / 2 + panelW / 2 + pc * ((doorWidth - 0.7) / panelCols),
        doorBottomY + 0.45 + panelH / 2 + pr * ((doorHeight - 0.7) / panelRows),
        WALL_Z + 0.24,
      );
      group.add(panel);
    }
  }

  // Door handle.
  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 0.4, metalness: 0.3 }),
  );
  handle.position.set(DOORWAY_X + doorWidth / 2 - 0.35, doorCenterY, WALL_Z + 0.24);
  group.add(handle);

  // A warm sliver of light glowing from underneath the door, hinting at
  // the lit kitchen beyond without flooding the whole opening yellow.
  const glowStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(doorWidth - 0.6, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xffcf8a }),
  );
  glowStrip.position.set(DOORWAY_X, doorBottomY + 0.06, WALL_Z + 0.3);
  group.add(glowStrip);

  const glowLight = new THREE.PointLight(0xffcf8a, 2.2, 7, 1.6);
  glowLight.position.set(DOORWAY_X, doorBottomY + 0.6, WALL_Z + 1.2);
  group.add(glowLight);

  return { group, glowLight };
}

// --- A simple low-poly armchair, sat against a wall. ---
function buildArmchair(x: number, z: number, facingRotationY: number): THREE.Group {
  const group = new THREE.Group();
  const fabricMat = new THREE.MeshStandardMaterial({ color: 0x4d3a3a, roughness: 0.9, flatShading: true });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x2c1d14, roughness: 0.7, flatShading: true });

  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.42, 1.2), fabricMat);
  seat.position.y = ROOM_FLOOR_Y + 0.45;
  group.add(seat);

  const back = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.45, 0.28), fabricMat);
  back.position.set(0, ROOM_FLOOR_Y + 1.15, -0.46);
  back.rotation.x = -0.1;
  group.add(back);

  const armGeo = new THREE.BoxGeometry(0.26, 0.65, 1.12);
  const leftArm = new THREE.Mesh(armGeo, fabricMat);
  leftArm.position.set(-0.65, ROOM_FLOOR_Y + 0.72, 0);
  const rightArm = new THREE.Mesh(armGeo, fabricMat);
  rightArm.position.set(0.65, ROOM_FLOOR_Y + 0.72, 0);
  group.add(leftArm, rightArm);

  // A throw blanket draped over one arm for a lived-in touch.
  const blanket = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.4, 1.05),
    new THREE.MeshStandardMaterial({ color: 0x8a5a3b, roughness: 0.95, flatShading: true }),
  );
  blanket.position.set(0.66, ROOM_FLOOR_Y + 0.95, 0.05);
  blanket.rotation.z = 0.12;
  group.add(blanket);

  const legGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.34, 6);
  for (const [lx, lz] of [[-0.55, 0.45], [0.55, 0.45], [-0.55, -0.45], [0.55, -0.45]] as const) {
    const leg = new THREE.Mesh(legGeo, woodMat);
    leg.position.set(lx, ROOM_FLOOR_Y + 0.17, lz);
    group.add(leg);
  }

  group.position.set(x, 0, z);
  group.rotation.y = facingRotationY;
  return group;
}

// --- A small round side table with a candle and a stack of books, plus
// a cosy floor rug patch — dressing to make the armchair corner feel
// lived-in rather than a bare showroom chair. ---
function buildChairVignette(x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.75, flatShading: true });

  const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 10), woodMat);
  tableTop.position.set(x, ROOM_FLOOR_Y + 0.62, z);
  group.add(tableTop);
  const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.6, 8), woodMat);
  tableLeg.position.set(x, ROOM_FLOOR_Y + 0.32, z);
  group.add(tableLeg);

  const candle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.22, 8),
    new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8 }),
  );
  candle.position.set(x - 0.12, ROOM_FLOOR_Y + 0.76, z + 0.05);
  group.add(candle);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.04, 0.1, 6),
    new THREE.MeshBasicMaterial({ color: 0xffa94d }),
  );
  flame.position.set(x - 0.12, ROOM_FLOOR_Y + 0.92, z + 0.05);
  group.add(flame);
  const candleGlow = new THREE.PointLight(0xffb066, 1.4, 3, 1.5);
  candleGlow.position.set(x - 0.12, ROOM_FLOOR_Y + 0.85, z + 0.05);
  group.add(candleGlow);

  // A small stack of books on the table.
  const bookColors = [0x8a3b3b, 0x3f6b3a, 0x5c3f6b];
  for (let i = 0; i < bookColors.length; i++) {
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.06, 0.22),
      new THREE.MeshStandardMaterial({ color: bookColors[i], roughness: 0.8, flatShading: true }),
    );
    book.position.set(x + 0.14, ROOM_FLOOR_Y + 0.68 + i * 0.06, z - 0.05);
    book.rotation.y = (i - 1) * 0.15;
    group.add(book);
  }

  // A small round rug patch beneath the chair/table corner.
  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 16),
    new THREE.MeshStandardMaterial({ color: 0x5c2e2e, roughness: 0.95, flatShading: true }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(x - 0.6, ROOM_FLOOR_Y + 0.01, z - 0.3);
  group.add(rug);

  return group;
}

// --- Rough-stone wall cladding: a jittered grid of boxes (same technique
// as the fireplace stonework), reused for the back wall and both side
// walls so the whole room reads as one stone cottage interior. ---
const STONE_WALL_COLORS = [0x6e6459, 0x776d60, 0x5c5349, 0x847a6c];
function stoneWallMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: STONE_WALL_COLORS[Math.floor(Math.random() * STONE_WALL_COLORS.length)],
    roughness: 0.95,
    flatShading: true,
  });
}

function buildStoneBackWall(): THREE.Group {
  const group = new THREE.Group();
  const width = ROOM_HALF_WIDTH * 2;
  const height = ROOM_CEIL_Y - ROOM_FLOOR_Y;
  const rows = 7;
  const cols = 18;
  const thickness = 0.4;
  // Keep stonework clear of the window opening (with a little padding)
  // so no boxes ever jitter forward in front of the window's sky plane.
  const windowPad = 0.5;
  const winXMin = WINDOW_X - WINDOW_HALF_WIDTH - windowPad;
  const winXMax = WINDOW_X + WINDOW_HALF_WIDTH + windowPad;
  const winYMin = WINDOW_BOTTOM_Y - windowPad;
  const winYMax = WINDOW_TOP_Y + windowPad;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = -ROOM_HALF_WIDTH + (c + 0.5) * (width / cols);
      const cy = ROOM_FLOOR_Y + (r + 0.5) * (height / rows);
      if (cx > winXMin && cx < winXMax && cy > winYMin && cy < winYMax) continue;
      const w = width / cols + (Math.random() - 0.5) * (width / cols) * 0.3;
      const h = height / rows + (Math.random() - 0.5) * (height / rows) * 0.3;
      const d = thickness * (0.7 + Math.random() * 0.3);
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneWallMaterial());
      box.position.set(
        cx + (Math.random() - 0.5) * 0.08,
        cy,
        WALL_Z + (Math.random() - 0.5) * 0.1 - d / 2,
      );
      group.add(box);
    }
  }
  return group;
}

function buildStoneSideWall(xPos: number, depth: number): THREE.Group {
  const group = new THREE.Group();
  const height = ROOM_CEIL_Y - ROOM_FLOOR_Y;
  const rows = 7;
  const cols = 11;
  const thickness = 0.45;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const w = depth / cols + (Math.random() - 0.5) * (depth / cols) * 0.3;
      const h = height / rows + (Math.random() - 0.5) * (height / rows) * 0.3;
      const d = thickness * (0.7 + Math.random() * 0.3);
      const box = new THREE.Mesh(new THREE.BoxGeometry(d, h, w), stoneWallMaterial());
      box.position.set(
        xPos + (Math.random() - 0.5) * 0.08,
        ROOM_FLOOR_Y + (r + 0.5) * (height / rows),
        WALL_Z + (c + 0.5) * (depth / cols) + (Math.random() - 0.5) * 0.1,
      );
      group.add(box);
    }
  }
  return group;
}

// --- Walls, floor, ceiling beams. ---
function buildShell(): THREE.Group {
  const group = new THREE.Group();

  const floorDepth = 32;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_HALF_WIDTH * 2, floorDepth),
    new THREE.MeshStandardMaterial({ color: 0x241811, roughness: 0.95, flatShading: true }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, ROOM_FLOOR_Y, WALL_Z + floorDepth / 2);
  group.add(floor);

  group.add(buildStoneBackWall());

  const sideWallDepth = 18;
  group.add(buildStoneSideWall(-ROOM_HALF_WIDTH, sideWallDepth));
  group.add(buildStoneSideWall(ROOM_HALF_WIDTH, sideWallDepth));

  const beamMaterial = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.95, flatShading: true });
  const beamCount = 9;
  const beamLength = 34;
  for (let i = 0; i < beamCount; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, beamLength), beamMaterial);
    beam.position.set(-ROOM_HALF_WIDTH + 3 + (i / (beamCount - 1)) * (ROOM_HALF_WIDTH * 2 - 6), ROOM_CEIL_Y - 0.35, WALL_Z + beamLength / 2 - 1);
    group.add(beam);
  }

  return group;
}

export const createCottageHearthNookBackdrop: BackdropFactory = (scene) => {
  const previousBackground = scene.background;
  scene.background = new THREE.Color(0x120d0a);

  const ambientLight = new THREE.AmbientLight(0x3d2c1c, 2.2);
  scene.add(ambientLight);
  const hemisphereLight = new THREE.HemisphereLight(0x584028, 0x140d09, 1.2);
  scene.add(hemisphereLight);

  const roomGroup = new THREE.Group();
  scene.add(roomGroup);

  // Local warm "room glow" fill, distinct from the flickering `hearthLight`
  // below — a constant practical light that makes the stonework, mantle
  // decor and curtains actually readable, without a large enough range to
  // spill onto the (much further away) diorama itself.
  const roomFillLight = new THREE.PointLight(0xffb066, 4.2, 24, 1.3);
  roomFillLight.position.set(FIRE_X + 3, ROOM_FLOOR_Y + 5, WALL_Z + 4.5);
  roomGroup.add(roomFillLight);

  // A second, cooler/dimmer fill so the bookshelf on the far side of the
  // room isn't left pitch black between the hearth's glow and the
  // kitchen doorway's own light.
  const bookshelfFillLight = new THREE.PointLight(0xaab6cc, 8, 18, 1.3);
  bookshelfFillLight.position.set(BOOKSHELF_X + 1.6, ROOM_FLOOR_Y + 4.5, WALL_Z + 2.2);
  roomGroup.add(bookshelfFillLight);

  // A third warm fill so the armchair tucked in the far corner reads
  // clearly instead of sitting in near-darkness.
  const chairFillLight = new THREE.PointLight(0xffb87a, 6, 14, 1.3);
  chairFillLight.position.set(ROOM_HALF_WIDTH - 3, ROOM_FLOOR_Y + 3.5, WALL_Z + 3);
  roomGroup.add(chairFillLight);

  roomGroup.add(buildShell());
  const { group: fireplaceGroup, fireOrigin, mantleTopY } = buildFireplace();
  roomGroup.add(fireplaceGroup);
  roomGroup.add(buildMantleDecor(mantleTopY));
  roomGroup.add(buildRug());
  roomGroup.add(buildBookshelf());
  roomGroup.add(buildArmchair(ROOM_HALF_WIDTH - 4, WALL_Z + 2, -Math.PI / 2));
  roomGroup.add(buildChairVignette(ROOM_HALF_WIDTH - 2, WALL_Z + 3.2));
  const { group: doorwayGroup } = buildKitchenDoorway();
  roomGroup.add(doorwayGroup);
  const { group: windowGroup, clouds } = buildWindow();
  roomGroup.add(windowGroup);

  const { particles: fireParticles } = buildFireParticles(fireOrigin);

  const HEARTH_BASE_INTENSITY = 3.4;
  const hearthLight = new THREE.PointLight(0xff8a3d, 0, 9);
  fireOrigin.add(hearthLight);

  let flickerSeed = Math.random() * 1000;
  let buildProgress = 0;
  const BUILD_DURATION = 1.2;

  const handle: BackdropHandle = {
    update(assembleClock, dt) {
      if (buildProgress < 1) {
        buildProgress = Math.min(1, assembleClock / BUILD_DURATION);
      }
      // Flicker: layered sines + a touch of randomness for a crackling feel.
      flickerSeed += dt;
      const flicker =
        0.85 +
        0.1 * Math.sin(flickerSeed * 9.0) +
        0.05 * Math.sin(flickerSeed * 23.0) +
        (Math.random() - 0.5) * 0.06;
      hearthLight.intensity = HEARTH_BASE_INTENSITY * buildProgress * Math.max(0.5, flicker);

      // Low-poly fire particles: rise, wobble, shrink, fade, then reset.
      for (const p of fireParticles) {
        p.life -= p.speed * dt;
        if (p.life <= 0) {
          p.life = 1;
          p.mesh.position.set((Math.random() - 0.5) * 0.25 * PROP_SCALE, 0, (Math.random() - 0.5) * 0.25 * PROP_SCALE);
        }
        p.mesh.position.y += dt * 0.5 * PROP_SCALE;
        p.mesh.position.x += Math.sin(flickerSeed * p.wobbleSpeed + p.wobbleOffset) * 0.01 * PROP_SCALE;
        p.mesh.position.z += Math.cos(flickerSeed * p.wobbleSpeed + p.wobbleOffset) * 0.01 * PROP_SCALE;
        p.mesh.scale.setScalar(p.life);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = p.life * buildProgress;
      }

      // Clouds drift slowly across the window, wrapping around.
      for (const cloud of clouds) {
        cloud.group.position.x += cloud.speed * dt;
        if (cloud.group.position.x > WINDOW_X + WINDOW_HALF_WIDTH + 0.3) {
          cloud.group.position.x = WINDOW_X - WINDOW_HALF_WIDTH - 0.3;
        }
      }
    },
    dispose() {
      scene.remove(ambientLight, hemisphereLight);
      disposeRoom(scene, roomGroup);
      scene.background = previousBackground;
    },
  };
  return handle;
};
