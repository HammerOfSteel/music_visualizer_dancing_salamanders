/**
 * Tabletop prop scatter (Phase 3.12) — a first pass of small procedural
 * clutter items (from the 3.8 brainstorm) that scatter around the
 * table's edges alongside the book stacks: a brass telescope, a teacup
 * with a continuous rising steam wisp, a lit candle in a tarnished
 * holder (flickering point light), and a potted fern. Generic engine
 * module — no imports from song/scene-specific content, just procedural
 * geometry.
 *
 * Each prop is built by its own function at a fixed anchor slot (in the
 * caller's local space, i.e. `tableGroup` space in `main.ts` — NOT the
 * world-space convention documented in `src/backdrops/*`, since props
 * sit on the actual table surface). `createTabletopProps()` randomly
 * picks a subset of the four per load (matching the TODO's "scatter 2-4
 * per load" spec) so the table looks a little different each time.
 */
import * as THREE from 'three';

export interface TabletopPropsHandle {
  group: THREE.Group;
  update(dt: number, elapsed: number): void;
}

const BRASS = 0xb08d57;
const TARNISHED_BRASS = 0x6b6255;

function buildTelescope(): THREE.Group {
  const group = new THREE.Group();
  const brassMat = new THREE.MeshStandardMaterial({ color: BRASS, roughness: 0.4, metalness: 0.7, flatShading: true });

  // Simple tripod: three legs splayed from a hub.
  const legGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.55, 6);
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(legGeo, brassMat);
    leg.position.set(Math.cos(angle) * 0.16, 0.26, Math.sin(angle) * 0.16);
    leg.rotation.z = Math.cos(angle) * 0.35;
    leg.rotation.x = -Math.sin(angle) * 0.35;
    group.add(leg);
  }

  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), brassMat);
  hub.position.y = 0.53;
  group.add(hub);

  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.62, 10), brassMat);
  tube.position.set(0, 0.72, 0.02);
  tube.rotation.z = -0.55;
  group.add(tube);
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.065, 0.02, 10),
    new THREE.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.2, metalness: 0.6 }),
  );
  lens.position.copy(tube.position).add(new THREE.Vector3(Math.sin(0.55) * 0.31, Math.cos(0.55) * 0.31, 0));
  lens.rotation.z = tube.rotation.z;
  group.add(lens);

  return group;
}

interface SteamRig {
  particles: THREE.Points;
  /** Per-particle rise-cycle length (seconds) — varied so particles don't
   * recycle in lockstep. */
  cycleLengths: Float32Array;
  /** Per-particle time offset into its cycle, so cycles are staggered
   * continuously rather than all starting/resetting together. */
  phaseOffsets: Float32Array;
  baseX: Float32Array;
  baseZ: Float32Array;
  startY: number;
  riseHeight: number;
}

function buildTeacup(): { group: THREE.Group; steamRig: SteamRig } {
  const group = new THREE.Group();
  const ceramicMat = new THREE.MeshStandardMaterial({ color: 0xf0e6d2, roughness: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x8a3b3b, roughness: 0.4 });

  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.02, 20), ceramicMat);
  saucer.position.y = 0.01;
  group.add(saucer);

  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.14, 16), ceramicMat);
  cup.position.y = 0.09;
  group.add(cup);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 8, 16), accentMat);
  rim.position.y = 0.16;
  rim.rotation.x = Math.PI / 2;
  group.add(rim);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 8, 12, Math.PI * 1.4), ceramicMat);
  handle.position.set(0.15, 0.09, 0);
  handle.rotation.y = Math.PI / 2;
  group.add(handle);

  // Steam wisp — a continuous stream of soft particles. Each particle has
  // its own randomized cycle length and start phase, and fades in/out via
  // a per-vertex alpha attribute (custom shader) rather than a shared
  // material opacity, so individual recycles are invisible instead of
  // popping all together like a single looping animation.
  const steamCount = 14;
  const startY = 0.18;
  const riseHeight = 0.4;
  const positions = new Float32Array(steamCount * 3);
  const alphas = new Float32Array(steamCount);
  const baseX = new Float32Array(steamCount);
  const baseZ = new Float32Array(steamCount);
  const cycleLengths = new Float32Array(steamCount);
  const phaseOffsets = new Float32Array(steamCount);
  for (let i = 0; i < steamCount; i++) {
    baseX[i] = (Math.random() - 0.5) * 0.05;
    baseZ[i] = (Math.random() - 0.5) * 0.05;
    cycleLengths[i] = 1.6 + Math.random() * 1.2;
    phaseOffsets[i] = Math.random() * cycleLengths[i];
    positions[i * 3] = baseX[i];
    positions[i * 3 + 1] = startY;
    positions[i * 3 + 2] = baseZ[i];
    alphas[i] = 0;
  }
  const steamGeo = new THREE.BufferGeometry();
  steamGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  steamGeo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  const steamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xffffff) } },
    vertexShader: `
      attribute float aAlpha;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 60.0 / -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float edge = smoothstep(0.5, 0.15, d);
        gl_FragColor = vec4(uColor, vAlpha * edge * 0.5);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const steamParticles = new THREE.Points(steamGeo, steamMat);
  group.add(steamParticles);

  return {
    group,
    steamRig: { particles: steamParticles, cycleLengths, phaseOffsets, baseX, baseZ, startY, riseHeight },
  };
}

function buildCandle(): { group: THREE.Group; flickerLight: THREE.PointLight; flame: THREE.Mesh } {
  const group = new THREE.Group();
  const holderMat = new THREE.MeshStandardMaterial({ color: TARNISHED_BRASS, roughness: 0.5, metalness: 0.6, flatShading: true });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.03, 12), holderMat);
  base.position.y = 0.015;
  group.add(base);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.1, 8), holderMat);
  stem.position.y = 0.08;
  group.add(stem);
  const drip = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.02, 12), holderMat);
  drip.position.y = 0.14;
  group.add(drip);

  const candleMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8, flatShading: true });
  const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.22, 10), candleMat);
  candle.position.y = 0.26;
  group.add(candle);

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.028, 0.075, 8),
    new THREE.MeshBasicMaterial({ color: 0xffa94d }),
  );
  flame.position.y = 0.41;
  group.add(flame);

  const flickerLight = new THREE.PointLight(0xffa658, 1.1, 3.2, 1.8);
  flickerLight.position.y = 0.44;
  group.add(flickerLight);

  return { group, flickerLight, flame };
}

function buildFern(): THREE.Group {
  const group = new THREE.Group();
  // Pot top opening sits at y=0.22 (position 0.11 + half-height 0.11).
  // The rim lip and soil disc are both offset clear of that seam (and of
  // each other) so their faces never land in the same plane as the pot's
  // cap — coincident faces there were the "glitching earth texture"
  // z-fighting flicker.
  const potMat = new THREE.MeshStandardMaterial({ color: 0x9a5a3a, roughness: 0.85, flatShading: true });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.22, 10), potMat);
  pot.position.y = 0.11;
  group.add(pot);
  const potRim = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.014, 6, 12), potMat);
  potRim.position.y = 0.225;
  potRim.rotation.x = Math.PI / 2;
  group.add(potRim);

  const soilMat = new THREE.MeshStandardMaterial({ color: 0x2a1e14, roughness: 0.95, flatShading: true });
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.02, 10), soilMat);
  soil.position.y = 0.235;
  group.add(soil);

  const frondColors = [0x3f6b3a, 0x4a7d43, 0x35592f, 0x568a4c];
  const frondCount = 10;
  for (let i = 0; i < frondCount; i++) {
    const length = 0.42 + Math.random() * 0.22;
    const frond = buildFernFrond(length, frondColors[i % frondColors.length]);
    const angle = (i / frondCount) * Math.PI * 2 + Math.random() * 0.25;
    const outward = 0.1 + Math.random() * 0.03;
    frond.position.set(Math.cos(angle) * outward, 0.22, Math.sin(angle) * outward);
    // Rotate the whole frond to point outward from the pot center before
    // its own internal arch (built along +y in buildFernFrond) droops it
    // back down and out over the rim.
    frond.rotation.y = -angle + Math.PI / 2;
    frond.rotation.x = (Math.random() - 0.5) * 0.15;
    group.add(frond);
  }

  return group;
}

function buildFernFrond(length: number, color: number): THREE.Group {
  // A single arching compound frond: a thin curved central blade with a
  // handful of small paired leaflets along its length, built from a
  // gentle chain of segments so it reads as a plant leaf rather than a
  // spike. Pivots at its base (local origin) so the parent can plant it
  // at the pot rim and rotate it outward/downward as a whole.
  const frondGroup = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, side: THREE.DoubleSide });

  const segments = 5;
  let cursor = new THREE.Vector3(0, 0, 0);
  let bendAngle = -0.15;
  for (let i = 0; i < segments; i++) {
    const segLen = length / segments;
    const segGeo = new THREE.CylinderGeometry(0.006, 0.011, segLen, 4);
    const seg = new THREE.Mesh(segGeo, mat);
    seg.position.copy(cursor).add(new THREE.Vector3(0, segLen / 2, 0));
    seg.rotation.z = bendAngle;
    frondGroup.add(seg);

    // A pair of small leaflets sprouting either side of this segment.
    if (i > 0) {
      const leafletLen = segLen * 1.6;
      for (const side of [-1, 1]) {
        const leaflet = new THREE.Mesh(new THREE.ConeGeometry(0.014, leafletLen, 3), mat);
        leaflet.position.copy(cursor).add(new THREE.Vector3(0, leafletLen * 0.4, 0));
        leaflet.scale.z = 0.3;
        leaflet.rotation.z = side * 1.05 + bendAngle;
        frondGroup.add(leaflet);
      }
    }

    cursor.add(new THREE.Vector3(Math.sin(bendAngle) * segLen, Math.cos(bendAngle) * segLen, 0));
    bendAngle -= 0.16 + Math.random() * 0.05; // progressively arch outward/downward
  }

  return frondGroup;
}

type PropId = 'telescope' | 'teacup' | 'candle' | 'fern';

interface PropSlot {
  id: PropId;
  x: number;
  z: number;
  rotationY: number;
}

// Anchor slots around the table's edges, in `tableGroup` local space —
// kept clear of the woven runner (radius 4.0 around the origin) and the
// two book stacks (~(-5.4, 1.4) and ~(5.6, -1.8)) per `main.ts`. `z` is
// also kept within roughly [-4.2, 2.0]: the fixed camera looks down at a
// steep angle, so anything much closer to the camera than that (larger
// +z) projects below the visible viewport (verified by projecting these
// points through the camera — the original teacup/watch/fern slots at
// z=3.6-4.0 landed at ~106-110% screen height, i.e. entirely off-canvas).
const PROP_SLOTS: PropSlot[] = [
  { id: 'telescope', x: -7.0, z: -1.8, rotationY: 0.3 },
  { id: 'fern', x: 7.0, z: 1.6, rotationY: -0.4 },
  { id: 'candle', x: 7.4, z: -0.4, rotationY: 0.4 },
  // Pulled further out to the table's edge, near the telescope slot
  // above (~1.8 units away — comparable to the candle/fern spacing),
  // while staying clear of bookStackOne (~-5.4, 1.4) and bookStackTwo
  // (~5.6, -1.8).
  { id: 'teacup', x: -5.6, z: -3.0, rotationY: 0.3 },
];

// Base geometry is modeled at a modest, readable size relative to the
// telescope/candle etc., but reads as too small against the table's
// scale from the fixed camera distance — scale the whole prop up.
const PROP_SCALE = 2.2;

function shuffled<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Builds a random scatter of 2-4 tabletop props (from the six available)
 * at their designated edge slots, placed at `surfaceY`. Returns a group
 * to add to the table and an `update()` to drive the candle flicker and
 * continuous steam wisp each frame. */
export function createTabletopProps(surfaceY: number): TabletopPropsHandle {
  const group = new THREE.Group();
  const propCount = 2 + Math.floor(Math.random() * 3); // 2-4 inclusive
  const chosenSlots = shuffled(PROP_SLOTS).slice(0, propCount);

  const flickerLights: THREE.PointLight[] = [];
  const flickerFlames: THREE.Mesh[] = [];
  const steamRigs: SteamRig[] = [];

  for (const slot of chosenSlots) {
    const propGroup = new THREE.Group();
    propGroup.position.set(slot.x, surfaceY, slot.z);
    propGroup.rotation.y = slot.rotationY;
    propGroup.scale.setScalar(PROP_SCALE);

    switch (slot.id) {
      case 'telescope':
        propGroup.add(buildTelescope());
        break;
      case 'teacup': {
        const { group: teacupGroup, steamRig } = buildTeacup();
        propGroup.add(teacupGroup);
        steamRigs.push(steamRig);
        break;
      }
      case 'candle': {
        const { group: candleGroup, flickerLight, flame } = buildCandle();
        propGroup.add(candleGroup);
        flickerLights.push(flickerLight);
        flickerFlames.push(flame);
        break;
      }
      case 'fern':
        propGroup.add(buildFern());
        break;
    }

    propGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    group.add(propGroup);
  }

  return {
    group,
    update(dt, elapsed) {
      // Candle flicker: layered sine + jitter, same recipe as the hearth
      // light in `cottageHearthNook.ts`.
      for (let i = 0; i < flickerLights.length; i++) {
        const light = flickerLights[i];
        const flame = flickerFlames[i];
        const flicker =
          0.75 +
          0.15 * Math.sin(elapsed * 9 + i) +
          0.1 * Math.sin(elapsed * 23 + i * 3) +
          (Math.random() - 0.5) * 0.08;
        light.intensity = 0.9 * Math.max(0.4, flicker);
        flame.scale.setScalar(Math.max(0.7, flicker));
      }

      // Steam: each particle runs its own independent rise-cycle (own
      // length + phase offset), fading in/out via a per-vertex alpha
      // attribute that peaks mid-cycle and reaches zero at the wrap
      // point — so particles continuously recycle without any visible
      // popping/reset, unlike a single shared, synchronized loop.
      for (const rig of steamRigs) {
        const posAttr = rig.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
        const alphaAttr = rig.particles.geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
        for (let i = 0; i < posAttr.count; i++) {
          const cycle = rig.cycleLengths[i];
          const t = (elapsed + rig.phaseOffsets[i]) % cycle;
          const progress = t / cycle; // 0..1 through this particle's rise
          const y = rig.startY + progress * rig.riseHeight;
          const drift = progress * 0.06;
          posAttr.setXYZ(
            i,
            rig.baseX[i] + Math.sin(elapsed * 1.5 + i) * 0.01 * (1 + drift),
            y,
            rig.baseZ[i] + Math.cos(elapsed * 1.5 + i) * 0.01 * (1 + drift),
          );
          alphaAttr.setX(i, Math.sin(progress * Math.PI));
        }
        posAttr.needsUpdate = true;
        alphaAttr.needsUpdate = true;
      }
    },
  };
}

