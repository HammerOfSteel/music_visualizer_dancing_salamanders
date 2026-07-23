/**
 * Music Visualizer — simple proof-of-concept.
 *
 * Proves the actual composition described in the design spec (Option B):
 * a tilted-down camera on a rotating turntable (LP disc), with a small
 * hand-authored voxel diorama raised on a plinth above the disc's centre,
 * both rotating together slowly while the track plays. The diorama here is
 * a quick sketch of "The Bells of Lyonesse" — a small rocky island rising
 * from dark water with a bell tower on top, its bronze bell glowing warm
 * against the night. Deliberately open on all sides (no walls/enclosure),
 * since the whole thing rotates 360° and needs to read correctly from every
 * angle — not a room, not a building interior. The diorama is built directly
 * from this specific song's lyrics: oak cross-braced timber framing for
 * "low beams of oak by a hearth fire's glow", ghostly half-submerged ruins
 * in the water ring for "the city of Lyonesse... silent ghosts of the
 * kingdom stir from their sleep", and a fixed cool-toned moon distinct from
 * the warm bell-glow for "the moonlight falls across her dreaming face".
 *

 * Also proves the live audio-reactive visualizer ring: a real Web Audio
 * `AnalyserNode` samples the actual playing track's frequency data each
 * frame (not pre-computed), and a simple energy-peak detector spawns
 * `VisualizerPulseRings`-style rings at the disc's edge that travel inward
 * and fade as they converge — the design spec's pulse-rings style, chosen
 * for this song's gentle/swelling character over sharp per-band bars.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { activeLyricLine, fadeProgress, type LyricLine } from './engine/lyrics';
import { overallAmplitude, BeatDetector } from './engine/audio';
import { createObjectAssembleAnimation } from './engine/voxelAssemble';
import { loadTracks, trackAudioUrl, trackLyricsUrl, type LoadedTrack } from './engine/tracks';
import { sceneFactories, type DioramaSceneHandle } from './scenes';
import { backdropPresets, sceneDefaultBackdrops, DEFAULT_BACKDROP_ID, type BackdropHandle } from './backdrops';
import { createWoodGrainTexture, createWovenRunnerTexture } from './engine/proceduralTexture';
import { createTabletopProps, type TabletopPropsHandle } from './engine/tabletopProps';
import { createBookStack } from './engine/bookStack';
import { createBookReaderSystem } from './engine/bookReader';
import { BOOK_TITLE_BANK, BOOK_FAMILY_STYLES, type BookFamily } from './content/bookTitles';
import { generateBookPages } from './content/bookPages';

const app = document.getElementById('app')!;
const playBtn = document.getElementById('playBtn') as HTMLButtonElement;
const prevBtn = document.getElementById('prevBtn') as HTMLButtonElement;
const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement;
const trackMenuBtn = document.getElementById('trackMenuBtn') as HTMLButtonElement;
const trackMenuEl = document.getElementById('trackMenu')!;
const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
const settingsMenuEl = document.getElementById('settingsMenu')!;
const loadingOverlayEl = document.getElementById('loadingOverlay')!;
const loadingTextEl = document.getElementById('loadingText')!;
const audio = document.getElementById('audio') as HTMLAudioElement;
const trackTitleEl = document.getElementById('trackTitle')!;
const trackAlbumEl = document.getElementById('trackAlbum')!;
const trackArtistEl = document.getElementById('trackArtist')!;
const lyricsEl = document.getElementById('lyricsOverlay')!;
const seekBar = document.getElementById('seekBar') as HTMLInputElement;
const timeElapsedEl = document.getElementById('timeElapsed')!;
const timeDurationEl = document.getElementById('timeDuration')!;
const volumeSlider = document.getElementById('volumeSlider') as HTMLInputElement;
const volumeIconEl = document.getElementById('volumeIcon')!;

// --- Transport controls: seek bar, elapsed/duration time, volume ---
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function updateSeekFill(): void {
  const max = Number(seekBar.max) || 1;
  const pct = (Number(seekBar.value) / max) * 100;
  seekBar.style.setProperty('--fill', `${pct}%`);
}

let isScrubbing = false;

audio.addEventListener('loadedmetadata', () => {
  seekBar.max = String(audio.duration || 0);
  timeDurationEl.textContent = formatTime(audio.duration);
});

audio.addEventListener('timeupdate', () => {
  if (isScrubbing) return;
  seekBar.value = String(audio.currentTime);
  timeElapsedEl.textContent = formatTime(audio.currentTime);
  updateSeekFill();
});

seekBar.addEventListener('input', () => {
  isScrubbing = true;
  audio.currentTime = Number(seekBar.value);
  timeElapsedEl.textContent = formatTime(audio.currentTime);
  updateSeekFill();
});
seekBar.addEventListener('change', () => {
  isScrubbing = false;
});

function updateVolumeIcon(volume: number): void {
  volumeIconEl.textContent = volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊';
}

audio.volume = Number(volumeSlider.value);
updateVolumeIcon(audio.volume);
volumeSlider.addEventListener('input', () => {
  audio.volume = Number(volumeSlider.value);
  updateVolumeIcon(audio.volume);
});

// --- Track header (title/artist/album) + lyrics ---
// Populated per-track by `loadTrack()` below (see the track manifest /
// scene-module wiring after the scene setup), not fetched here directly.
let lyrics: LyricLine[] = [];
let lastLyricText = '';

function updateLyricsOverlay(currentTime: number): void {
  const line = activeLyricLine(lyrics, currentTime);
  if (!line) {
    lyricsEl.style.opacity = '0';
    return;
  }
  if (line.text !== lastLyricText) {
    lyricsEl.textContent = line.text;
    lastLyricText = line.text;
  }
  lyricsEl.style.opacity = String(fadeProgress(line, currentTime));
}

// --- Scene / renderer ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);

// Far plane pushed way out (was 100) — with the camera now standing this
// high up and looking this far out over the valley, the mountains (as far
// back as z=-300) and clouds (as far as ~200 units from camera) were being
// clipped by the camera's own far plane, not actually missing from the
// scene.
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 600);
// Live-tuned default framing: standing high above the table looking down
// and out over the valley so the terrain/mountains read. Captured via the
// in-app camera-capture debug tool (press "C") after manually orbiting to
// this framing on 2026-07-23.
const DEFAULT_CAMERA_POSITION = new THREE.Vector3(0.02, 30.94, 4.74);
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(-0.43, 21.66, -27.66);
camera.position.copy(DEFAULT_CAMERA_POSITION);
camera.lookAt(DEFAULT_CAMERA_TARGET);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

// Permanent "look around" feature — drag to orbit the camera around the
// baked default view. Plain drag rotates; holding Shift (or Ctrl/Cmd)
// while dragging pans instead — OrbitControls already does this natively
// off the `mouseButtons.LEFT = ROTATE` mapping (it checks
// event.shiftKey/ctrlKey/metaKey itself at drag-start), no custom key
// listener needed. Zoom stays bounded and pan has no explicit limit, but
// the polar-angle clamp keeps the camera from swinging under the table
// or flattening out above the sky, so a curious drag can't easily lose
// the composed shot. Damping gives the drag some weight instead of
// feeling instant/rigid.
const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.target.copy(DEFAULT_CAMERA_TARGET);
orbitControls.enablePan = true;
orbitControls.screenSpacePanning = true;
orbitControls.panSpeed = 0.6;
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.08;
orbitControls.minDistance = 15;
orbitControls.maxDistance = 55;
orbitControls.minPolarAngle = Math.PI * 0.15;
orbitControls.maxPolarAngle = Math.PI * 0.6;
// Zoom disabled: this app is embedded as an iframe on other pages (e.g.
// dancingsalamanders.com), and OrbitControls' default mouse-wheel/pinch
// zoom calls preventDefault() on wheel events, which hijacks the page's
// scroll whenever the cursor is over the embed instead of letting the
// parent page scroll normally. Drag-to-orbit/pan still work; only wheel
// zoom (and touch pinch-zoom) is turned off so scrolling stays free.
orbitControls.enableZoom = false;
orbitControls.update();

// --- Dev-only camera capture tool ------------------------------------
// Drag/orbit/zoom to a nice framing, then press "C" to log the camera's
// exact current position and orbit target to the console, formatted as
// ready-to-paste `DEFAULT_CAMERA_POSITION`/`DEFAULT_CAMERA_TARGET`
// constants (see above) — avoids eyeballing numbers off a stats overlay.
// Also exposed on `window.__cameraDebug` so it can be read directly
// (e.g. from an automated browser session) without needing a keypress.
window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() !== 'c') return;
  const p = camera.position;
  const t = orbitControls.target;
  const fmt = (n: number) => n.toFixed(2);
  // eslint-disable-next-line no-console
  console.log(
    '[camera capture]\n' +
      `const DEFAULT_CAMERA_POSITION = new THREE.Vector3(${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)});\n` +
      `const DEFAULT_CAMERA_TARGET = new THREE.Vector3(${fmt(t.x)}, ${fmt(t.y)}, ${fmt(t.z)});`,
  );
});
(
  window as unknown as {
    __cameraDebug?: { camera: THREE.PerspectiveCamera; orbitControls: OrbitControls };
  }
).__cameraDebug = { camera, orbitControls };

// The table, turntable, and everything sitting on the table (books,
// runner, legs) all live inside this one group so the whole physical
// "set" sits together at its live-tuned elevated position.
const tableGroup = new THREE.Group();
tableGroup.position.set(0, 27, 0);
scene.add(tableGroup);

// --- Turntable: LP disc + plinth/body ---
const turntableGroup = new THREE.Group();
tableGroup.add(turntableGroup);

// Disc/label/plinth/riser grouped together so the whole turntable base can
// be animated in as one rigid unit (see turntableBaseAssembleAnim below),
// landing first before the diorama's voxels fall onto it.
const turntableBaseGroup = new THREE.Group();
turntableGroup.add(turntableBaseGroup);

const disc = new THREE.Mesh(
  new THREE.CylinderGeometry(3.4, 3.4, 0.08, 64),
  new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.35, metalness: 0.2 }),
);
disc.position.y = 0.3;
disc.receiveShadow = true;
turntableBaseGroup.add(disc);

const label = new THREE.Mesh(
  new THREE.CylinderGeometry(0.9, 0.9, 0.09, 48),
  new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.6 }),
);
label.position.y = 0.31;
turntableBaseGroup.add(label);

const plinth = new THREE.Mesh(
  new THREE.CylinderGeometry(3.7, 3.9, 0.5, 64),
  new THREE.MeshStandardMaterial({ color: 0x3a2f28, roughness: 0.8 }),
);
plinth.position.y = 0.02;
plinth.receiveShadow = true;
turntableBaseGroup.add(plinth);

// Riser lifting the diorama plinth above the disc's centre.
const riser = new THREE.Mesh(
  new THREE.CylinderGeometry(0.35, 0.45, 1.4, 24),
  new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9 }),
);
riser.position.y = 1.05;
riser.receiveShadow = true;
riser.castShadow = true;
turntableBaseGroup.add(riser);

// The base drops in first (startOffset 0) and settles quickly, so the
// diorama voxels read as falling onto an already-landed turntable rather
// than everything appearing at once. A single-item "object assemble" reusing
// the same fall/settle/bounce model as the voxel terrain.
const TURNTABLE_DROP_HEIGHT = 3.5;
let turntableBaseAssembleAnim: ReturnType<typeof createObjectAssembleAnimation> | null =
  createObjectAssembleAnimation(
    [{ position: new THREE.Vector3(0, 0, 0), object: turntableBaseGroup }],
    {
      fallDuration: 0.55,
      dropHeight: TURNTABLE_DROP_HEIGHT,
      staggerSpread: 0,
      startOffset: 0,
    },
  );

// --- Table: static wood tabletop the turntable rests on (Phase 3b, 3.9) ---
// Lives directly in `scene` (not `turntableGroup`) since it must stay put
// while the turntable spins above it. Wood grain + the woven runner under
// the turntable base are both procedural canvas textures — no image assets.
// Sized generously around the runner's footprint (radius 4.0, i.e. an 8.0
// diameter) so both the runner and the turntable's own plinth (radius 3.9)
// sit comfortably inset from every edge instead of overhanging it. Kept
// wide-and-shallow (rectangular, not square) rather than deep, so there's
// open tabletop along the sides for future props/book stacks (3.10, 3.12)
// without the table stretching further into the background than needed.

/** A rounded-rectangle slab (extruded shape, not a plain box) centred at the
 * origin: `width` along X, `thickness` along Y, `depth` along Z. Corners use
 * a coarse `curveSegments` count so the rounding reads as a few flat facets
 * rather than a perfectly smooth machine-tooled curve — a more organic,
 * hand-built low-poly look for the tabletop's edges. */
function createRoundedSlabGeometry(
  width: number,
  depth: number,
  thickness: number,
  cornerRadius: number,
  curveSegments = 4,
): THREE.ExtrudeGeometry {
  const w = width / 2;
  const d = depth / 2;
  const r = Math.min(cornerRadius, w, d);
  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -d);
  shape.lineTo(w - r, -d);
  shape.absarc(w - r, -d + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(w, d - r);
  shape.absarc(w - r, d - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-w + r, d);
  shape.absarc(-w + r, d - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-w, -d + r);
  shape.absarc(-w + r, -d + r, r, Math.PI, Math.PI * 1.5, false);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments,
  });
  // The shape/extrude are authored in XY (extruded along Z); rotate so
  // width/depth land on X/Z and the extrusion (thickness) lands on Y,
  // matching the BoxGeometry(width, thickness, depth) convention this
  // replaces, then centre the extrusion vertically.
  geometry.translate(0, 0, -thickness / 2);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

const TABLE_SURFACE_Y = -0.24; // flush with the plinth's underside (~-0.23)
const TABLE_THICKNESS = 0.3;
const TABLE_LEG_HEIGHT = 3.2;
const TABLE_WIDTH = 16;
const TABLE_DEPTH = 9;
const TABLE_CORNER_RADIUS = 1.4;

const tableTopTexture = createWoodGrainTexture({
  // Sized to the table's own aspect ratio and mapped once (no repeat) —
  // tiling a small texture across this large a surface made the plank
  // seams read as an artificial repeating grid instead of real planks.
  width: 1536,
  height: Math.round(1536 * (TABLE_DEPTH / TABLE_WIDTH)),
  baseColor: '#6b4530',
  grainColor: '#3a2718',
  knotCount: 6,
});
const tableTop = new THREE.Mesh(
  createRoundedSlabGeometry(TABLE_WIDTH, TABLE_DEPTH, TABLE_THICKNESS, TABLE_CORNER_RADIUS),
  new THREE.MeshStandardMaterial({
    map: tableTopTexture,
    roughness: 0.75,
    metalness: 0.05,
    flatShading: true,
  }),
);
tableTop.position.y = TABLE_SURFACE_Y - TABLE_THICKNESS / 2;
tableTop.receiveShadow = true;
tableTop.castShadow = true;
tableGroup.add(tableTop);

const legTexture = createWoodGrainTexture({
  baseColor: '#4a3320',
  grainColor: '#2a1c10',
  knotCount: 1,
});
const legMaterial = new THREE.MeshStandardMaterial({ map: legTexture, roughness: 0.8, flatShading: true });
const legOffsets: Array<[number, number]> = [
  [TABLE_WIDTH / 2 - 0.8, TABLE_DEPTH / 2 - 0.8],
  [TABLE_WIDTH / 2 - 0.8, -(TABLE_DEPTH / 2 - 0.8)],
  [-(TABLE_WIDTH / 2 - 0.8), TABLE_DEPTH / 2 - 0.8],
  [-(TABLE_WIDTH / 2 - 0.8), -(TABLE_DEPTH / 2 - 0.8)],
];
for (const [x, z] of legOffsets) {
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, TABLE_LEG_HEIGHT, 8), legMaterial);
  leg.position.set(x, TABLE_SURFACE_Y - TABLE_THICKNESS - TABLE_LEG_HEIGHT / 2, z);
  leg.castShadow = true;
  leg.receiveShadow = true;
  tableGroup.add(leg);
}

// Woven runner/doily under the turntable base — static, sits on the
// tabletop, slightly larger than the plinth's footprint.
const RUNNER_THICKNESS = 0.03;
const runnerTexture = createWovenRunnerTexture({ baseColor: '#8a3b3b', accentColor: '#e8d9b5' });
const runner = new THREE.Mesh(
  new THREE.CylinderGeometry(4.0, 4.0, RUNNER_THICKNESS, 48),
  new THREE.MeshStandardMaterial({ map: runnerTexture, roughness: 0.9 }),
);
runner.position.y = TABLE_SURFACE_Y + RUNNER_THICKNESS / 2;
runner.receiveShadow = true;
tableGroup.add(runner);

// Tabletop book stacks (Phase 3b, 3.10) — a couple of small messy piles
// picked from the shared title/cover content bank, placed in the open
// tabletop space alongside the turntable (kept clear of the runner's
// radius so nothing overlaps the spinning turntable). Each book is
// clickable (see `createBookReaderSystem` below): click one to lift it up
// and read it, since the flat lying-down covers aren't legible from the
// default camera angle.
const BOOK_STACK_ONE_POS = new THREE.Vector3(-5.4, TABLE_SURFACE_Y, 1.4);
const BOOK_STACK_TWO_POS = new THREE.Vector3(5.6, TABLE_SURFACE_Y, -1.8);
let bookStackOne = createBookStack(BOOK_TITLE_BANK, BOOK_FAMILY_STYLES, {
  position: BOOK_STACK_ONE_POS,
  rotationY: 0.4,
});
tableGroup.add(bookStackOne);
let bookStackTwo = createBookStack(BOOK_TITLE_BANK, BOOK_FAMILY_STYLES, {
  count: 2 + Math.floor(Math.random() * 2),
  position: BOOK_STACK_TWO_POS,
  rotationY: -0.6,
});
tableGroup.add(bookStackTwo);

// Tabletop prop scatter (Phase 3.12) — 2-4 small procedural clutter items
// (telescope, teacup, candle, fern) randomly picked and placed around the
// table's edges each load.
let tabletopProps: TabletopPropsHandle = createTabletopProps(TABLE_SURFACE_Y);
tableGroup.add(tabletopProps.group);

/** Rerolls the two book-stack piles in place (Phase 3.13 settings-menu
 * action): re-populates `bookStackOne`/`bookStackTwo` with a fresh random
 * selection from the title bank at their same fixed table positions,
 * disposing the old book meshes' geometry/materials first. Keeps the
 * same `THREE.Group` object identity for each stack (only swaps their
 * children) so `bookReader`'s `stackGroups` references stay valid without
 * needing to be re-wired. */
function rerollBookStacks(): void {
  disposeGroupChildren(bookStackOne);
  disposeGroupChildren(bookStackTwo);
  const freshOne = createBookStack(BOOK_TITLE_BANK, BOOK_FAMILY_STYLES, {
    position: BOOK_STACK_ONE_POS,
    rotationY: 0.4,
  });
  for (const child of [...freshOne.children]) bookStackOne.add(child);
  const freshTwo = createBookStack(BOOK_TITLE_BANK, BOOK_FAMILY_STYLES, {
    count: 2 + Math.floor(Math.random() * 2),
    position: BOOK_STACK_TWO_POS,
    rotationY: -0.6,
  });
  for (const child of [...freshTwo.children]) bookStackTwo.add(child);
}

/** Rerolls the tabletop prop scatter (Phase 3.13 settings-menu action):
 * tears down the current `tabletopProps` handle's group and swaps in a
 * freshly-built one (new random subset + slot assignment). Unlike the
 * book-stack reroll, this replaces the whole group/handle rather than
 * just its children, since the flicker/steam animation rigs are
 * captured in `tabletopProps.update`'s closure and need rebuilding too. */
function rerollTabletopProps(): void {
  disposeGroupChildren(tabletopProps.group);
  tableGroup.remove(tabletopProps.group);
  tabletopProps = createTabletopProps(TABLE_SURFACE_Y);
  tableGroup.add(tabletopProps.group);
}

// Interactive book reader — click any book on the table to pick it up,
// hold it up bobbing in front of the camera, open it, and flip pages.
// Escape (or clicking away) puts the current book back down.
const bookReader = createBookReaderSystem({
  scene,
  camera,
  domElement: renderer.domElement,
  stackGroups: [bookStackOne, bookStackTwo],
  getPages: (title, family) => generateBookPages(title, family as BookFamily),
});

// --- Diorama: swappable per-track scene (Phase 3 multi-track architecture) ---
// The diorama's actual content (voxel terrain, sea, bell, moon, and their
// lighting) is hand-authored per song in its own module under `src/scenes/`
// (see `createBellsOfLyonesseScene` for the first one) rather than living
// here — `dioramaGroup` is just the shared empty stage those modules build
// into, raised on the turntable's riser above the disc's centre.
const dioramaGroup = new THREE.Group();
dioramaGroup.position.y = 1.9;
turntableGroup.add(dioramaGroup);

// Shared clock for every "assemble on load" effect (turntable base + all of
// the current scene's own internal build-in animations) so their
// `startOffset`s are measured from the same t=0. Reset to 0 by `loadTrack()`
// on every track load (including the first) so the whole build-in sequence
// replays from scratch each time.
let assembleClock = 0;

let currentScene: DioramaSceneHandle | null = null;
// Swappable environment preset (Phase 3.11) composed alongside the current
// track's diorama scene — owns ambient/hemisphere/key lighting, sky/
// background colour, and any fixed set dressing (clouds, embers, a moon).
let currentBackdrop: BackdropHandle | null = null;
let currentBackdropId: string | null = null;
// User's manual "Background Scene" choice from the settings menu, if any
// — takes priority over each track's own scene-appropriate default so a
// user's pick sticks across track switches instead of being silently
// reset. Persisted so it survives a page reload too.
const BACKDROP_OVERRIDE_KEY = 'backdropOverride';
let backdropOverrideId: string | null = localStorage.getItem(BACKDROP_OVERRIDE_KEY);
let tracks: LoadedTrack[] = [];
let currentTrackIndex = 0;

/** Disposes the current backdrop (if any) and installs the one for
 * `backdropId`, falling back to the default preset if the id is unknown
 * or its factory isn't implemented yet. Used both on track load and when
 * the user picks a new background scene from the settings menu — in the
 * latter case it swaps the backdrop in place under the still-running
 * diorama scene, no track reload needed. */
function applyBackdrop(backdropId: string): void {
  const backdropPreset = backdropPresets[backdropId] ?? backdropPresets[DEFAULT_BACKDROP_ID];
  const backdropFactory = backdropPreset.factory ?? backdropPresets[DEFAULT_BACKDROP_ID].factory!;
  currentBackdrop?.dispose();
  currentBackdrop = backdropFactory(scene);
  currentBackdropId = backdropPreset.factory ? backdropPreset.id : DEFAULT_BACKDROP_ID;
}

/** Disposes + removes every child of a group — used to generically tear
 * down whatever the previous track's scene module added to `dioramaGroup`
 * without that module needing its own dioramaGroup-specific cleanup code
 * (only `scene`-level additions need a per-scene `dispose()`). */
function disposeGroupChildren(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.dispose();
    }
  }
}

/** Tears down the current track's scene (if any) and builds the requested
 * track's, replaying the whole build-in sequence from scratch, swapping the
 * audio source, and updating the header/lyrics — the core of track
 * switching (initial load, next/prev, and the track menu all funnel through
 * this one function). */
async function loadTrack(index: number): Promise<void> {
  const track = tracks[index];
  if (!track) return;
  const sceneFactory = sceneFactories[track.scene];
  if (!sceneFactory) {
    console.error(`No scene factory registered for scene id "${track.scene}"`);
    return;
  }
  currentTrackIndex = index;
  const wasPlaying = !audio.paused;

  currentScene?.dispose();
  currentBackdrop?.dispose();
  disposeGroupChildren(dioramaGroup);

  // Replay the build-in sequence (turntable base drop + the new scene's own
  // internal animations) from scratch for the new track. Reset the base
  // group's transform first: `createObjectAssembleAnimation` captures the
  // object's CURRENT scale as its "fully settled" target, and by the time
  // this runs (after the async track/meta fetch) the previous assemble
  // animation may have only partially scaled it back up — without this
  // reset, the base would lock in at whatever fractional scale it happened
  // to be paused at, i.e. the "turntable is tiny" bug.
  turntableBaseGroup.scale.set(1, 1, 1);
  turntableBaseGroup.position.set(0, 0, 0);
  assembleClock = 0;
  turntableGroup.rotation.y = 0;
  turntableBaseAssembleAnim = createObjectAssembleAnimation(
    [{ position: new THREE.Vector3(0, 0, 0), object: turntableBaseGroup }],
    {
      fallDuration: 0.55,
      dropHeight: TURNTABLE_DROP_HEIGHT,
      staggerSpread: 0,
      startOffset: 0,
    },
  );

  const backdropId = backdropOverrideId ?? sceneDefaultBackdrops[track.scene] ?? DEFAULT_BACKDROP_ID;
  applyBackdrop(backdropId);

  currentScene = sceneFactory(scene, dioramaGroup);

  trackTitleEl.textContent = track.meta.title;
  trackAlbumEl.textContent = track.meta.album;
  trackArtistEl.textContent = track.meta.artist;
  // Instrumental tracks (or albums whose lyrics haven't been transcribed
  // yet) simply have no lyrics.json — fall back to an empty line list
  // instead of failing the whole track load.
  lyrics = await fetch(trackLyricsUrl(track))
    .then((r) => (r.ok ? (r.json() as Promise<LyricLine[]>) : []))
    .catch(() => [] as LyricLine[]);
  lastLyricText = '';

  audio.src = trackAudioUrl(track);
  renderTrackMenu();
  if (wasPlaying) {
    ensureAudioGraph();
    void audio.play();
  }
}

// Albums the user has manually expanded/collapsed in the track menu. The
// album containing the currently-playing track is always force-expanded
// (added back in `renderTrackMenu()` each render) so switching tracks
// never leaves the active song hidden inside a collapsed group.
const expandedAlbums = new Set<string>();

/** Groups `tracks` by `meta.album` (preserving first-seen order) into a
 * collapsible list — click an album header to expand/collapse its songs.
 * Keeps the menu usable once there are many albums/songs instead of one
 * long flat list. */
function renderTrackMenu(): void {
  trackMenuEl.innerHTML = '';

  const albums = new Map<string, { track: LoadedTrack; index: number }[]>();
  tracks.forEach((track, index) => {
    const album = track.meta.album;
    if (!albums.has(album)) albums.set(album, []);
    albums.get(album)!.push({ track, index });
  });

  const currentAlbum = tracks[currentTrackIndex]?.meta.album;
  if (currentAlbum) expandedAlbums.add(currentAlbum);

  for (const [album, albumTracks] of albums) {
    const isExpanded = expandedAlbums.has(album);
    const isActiveAlbum = albumTracks.some(({ index }) => index === currentTrackIndex);

    const header = document.createElement('button');
    header.className = 'trackMenuAlbum';
    if (isActiveAlbum) header.classList.add('active');

    const chevron = document.createElement('span');
    chevron.className = 'trackMenuAlbumChevron';
    chevron.textContent = isExpanded ? '▾' : '▸';
    header.appendChild(chevron);

    const name = document.createElement('span');
    name.className = 'trackMenuAlbumName';
    name.textContent = album;
    header.appendChild(name);

    const count = document.createElement('span');
    count.className = 'trackMenuAlbumCount';
    count.textContent = String(albumTracks.length);
    header.appendChild(count);

    header.addEventListener('click', () => {
      if (expandedAlbums.has(album)) expandedAlbums.delete(album);
      else expandedAlbums.add(album);
      renderTrackMenu();
    });
    trackMenuEl.appendChild(header);

    if (!isExpanded) continue;
    for (const { track, index } of albumTracks) {
      const item = document.createElement('button');
      item.className = 'trackMenuSong';
      item.textContent = track.meta.title;
      if (index === currentTrackIndex) item.classList.add('active');
      item.addEventListener('click', () => {
        trackMenuEl.classList.remove('open');
        void loadTrack(index);
      });
      trackMenuEl.appendChild(item);
    }
  }
}

/** Rebuilds the settings menu's "Background Scene" list — one button per
 * registered preset, disabled for presets that don't have a `factory`
 * yet (documented-but-not-built, see `backdrops/index.ts`), highlighting
 * whichever backdrop is actually installed right now. */
function renderSettingsMenu(): void {
  settingsMenuEl.innerHTML = '';
  const sectionTitle = document.createElement('div');
  sectionTitle.className = 'settingsSectionTitle';
  sectionTitle.textContent = 'Background Scene';
  settingsMenuEl.appendChild(sectionTitle);

  for (const preset of Object.values(backdropPresets)) {
    const item = document.createElement('button');
    item.textContent = preset.label;
    if (!preset.factory) {
      item.disabled = true;
      const hint = document.createElement('span');
      hint.className = 'settingsHint';
      hint.textContent = '(soon)';
      item.appendChild(hint);
    }
    if (preset.id === currentBackdropId) item.classList.add('active');
    item.addEventListener('click', () => {
      if (!preset.factory) return;
      backdropOverrideId = preset.id;
      localStorage.setItem(BACKDROP_OVERRIDE_KEY, preset.id);
      applyBackdrop(preset.id);
      renderSettingsMenu();
      settingsMenuEl.classList.remove('open');
    });
    settingsMenuEl.appendChild(item);
  }

  const randomizeBtn = document.createElement('button');
  randomizeBtn.textContent = '🎲 Randomize background';
  randomizeBtn.addEventListener('click', () => {
    const implemented = Object.values(backdropPresets).filter((p) => p.factory);
    const choices = implemented.length > 1 ? implemented.filter((p) => p.id !== currentBackdropId) : implemented;
    const pick = choices[Math.floor(Math.random() * choices.length)];
    backdropOverrideId = pick.id;
    localStorage.setItem(BACKDROP_OVERRIDE_KEY, pick.id);
    applyBackdrop(pick.id);
    renderSettingsMenu();
  });
  settingsMenuEl.appendChild(randomizeBtn);

  const tabletopTitle = document.createElement('div');
  tabletopTitle.className = 'settingsSectionTitle';
  tabletopTitle.textContent = 'Tabletop';
  settingsMenuEl.appendChild(tabletopTitle);

  const rerollBooksBtn = document.createElement('button');
  rerollBooksBtn.textContent = '🔀 Reroll book stacks';
  rerollBooksBtn.addEventListener('click', () => rerollBookStacks());
  settingsMenuEl.appendChild(rerollBooksBtn);

  const rerollPropsBtn = document.createElement('button');
  rerollPropsBtn.textContent = '🔀 Reroll tabletop props';
  rerollPropsBtn.addEventListener('click', () => rerollTabletopProps());
  settingsMenuEl.appendChild(rerollPropsBtn);
}

trackMenuBtn.addEventListener('click', () => {
  settingsMenuEl.classList.remove('open');
  trackMenuEl.classList.toggle('open');
});
settingsBtn.addEventListener('click', () => {
  trackMenuEl.classList.remove('open');
  renderSettingsMenu();
  settingsMenuEl.classList.toggle('open');
});
prevBtn.addEventListener('click', () => {
  void loadTrack((currentTrackIndex - 1 + tracks.length) % tracks.length);
});
nextBtn.addEventListener('click', () => {
  void loadTrack((currentTrackIndex + 1) % tracks.length);
});

void loadTracks()
  .then((loaded) => {
    tracks = loaded;
    return loadTrack(0);
  })
  .then(() => {
    loadingOverlayEl.classList.add('hidden');
  })
  .catch((err) => {
    console.error('Failed to load track manifest/metadata', err);
    loadingTextEl.textContent = 'Failed to load — check console';
  });

// --- Visualizer ring: physical wave-ripple style (per design spec) ---
// Rather than a flat decal ring (which z-fought with the disc's own top
// surface — same y, same plane, visible flicker), each pulse is a real
// vertical bump travelling across a shared full-disc geometry: a Gaussian
// "wave crest" ridge at radius `uWaveRadius` plus a damped trailing
// wavetrain (a simple physically-inspired ripple wake, like a stone
// dropped in water), animated inward from the disc's edge to its centre.
// Colour slowly cycles through a cool-to-warm theme (matching the moon and
// bell-glow palette already in the scene) instead of a static white.
const RING_OUTER_RADIUS = 3.4;
const RING_LIFETIME = 1.8; // seconds to travel from outer edge to centre
const DISC_TOP_Y = 0.34;
const MAX_CONCURRENT_RINGS = 2; // keeps crests visually distinct instead of merging into a wash
interface PulseRing {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  age: number;
  intensity: number;
}
const pulseRings: PulseRing[] = [];
let visualizerClock = 0; // shared slow clock driving the theme colour cycle
// Shared geometry for all ripples: flat disc-sized ring with many radial
// subdivisions so the vertex shader can sculpt a smooth crest at any radius.
const waveRingGeometry = new THREE.RingGeometry(0.001, RING_OUTER_RADIUS, 96, 48);
const waveRingVertexShader = `
  uniform float uWaveRadius;
  uniform float uWidth;
  uniform float uAmplitude;
  uniform float uPhase;
  varying float vBump;
  varying float vSlope;
  void main() {
    float r = length(position.xy);
    float d = r - uWaveRadius;
    float envelope = exp(-(d * d) / (uWidth * uWidth));
    // Damped trailing wavetrain behind the leading crest — a simple
    // physically-inspired ripple wake (like concentric water ripples),
    // rather than a single flat bump.
    float wake = sin(d * 12.0 - uPhase) * exp(-max(d, 0.0) * 1.6);
    float bump = envelope * 0.7 + wake * envelope * 0.4;
    vBump = bump;
    vSlope = abs(d / uWidth) * envelope;
    vec3 displaced = position + normal * uAmplitude * bump;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;
const waveRingFragmentShader = `
  uniform float uOpacity;
  uniform float uThemeTime;
  varying float vBump;
  varying float vSlope;
  // Slowly cycling theme colour: moonlit blue -> teal -> warm ember -> back,
  // matching the diorama's existing cool-moon / warm-bell palette.
  vec3 themeColor(float t) {
    vec3 c1 = vec3(0.81, 0.90, 0.95); // moonlit blue-white
    vec3 c2 = vec3(0.55, 0.85, 0.82); // teal
    vec3 c3 = vec3(0.95, 0.72, 0.50); // warm ember
    float p = fract(t);
    if (p < 0.333) return mix(c1, c2, p / 0.333);
    if (p < 0.667) return mix(c2, c3, (p - 0.333) / 0.334);
    return mix(c3, c1, (p - 0.667) / 0.333);
  }
  void main() {
    float glint = smoothstep(0.45, 0.85, vSlope) * 0.3;
    float alpha = (abs(vBump) * 0.3 + glint) * uOpacity;
    gl_FragColor = vec4(themeColor(uThemeTime), alpha);
  }
`;
function spawnPulseRing(intensity: number): void {
  if (pulseRings.length >= MAX_CONCURRENT_RINGS) return;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uWaveRadius: { value: RING_OUTER_RADIUS },
      uWidth: { value: 0.26 },
      uAmplitude: { value: 0 },
      uPhase: { value: 0 },
      uThemeTime: { value: visualizerClock * 0.04 },
      uOpacity: { value: Math.min(0.3, 0.12 + intensity * 0.14) },
    },
    vertexShader: waveRingVertexShader,
    fragmentShader: waveRingFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(waveRingGeometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = DISC_TOP_Y + 0.01;
  turntableGroup.add(mesh);
  pulseRings.push({ mesh, material, age: 0, intensity });
}
function updatePulseRings(dt: number): void {
  visualizerClock += dt;
  for (let i = pulseRings.length - 1; i >= 0; i--) {
    const ring = pulseRings[i];
    ring.age += dt;
    const t = ring.age / RING_LIFETIME; // 0 = just spawned at edge, 1 = converged at centre
    if (t >= 1) {
      turntableGroup.remove(ring.mesh);
      ring.material.dispose();
      pulseRings.splice(i, 1);
      continue;
    }
    // Wave crest travels from the outer edge to the centre.
    ring.material.uniforms.uWaveRadius.value = RING_OUTER_RADIUS * (1 - t);
    ring.material.uniforms.uPhase.value = ring.age * 5.0;
    ring.material.uniforms.uThemeTime.value = visualizerClock * 0.04;
    // Amplitude envelope: quick rise then a longer decaying fall, like a
    // real wave crest losing energy as it propagates — not a linear fade.
    const rise = Math.min(1, t / 0.12);
    const fall = 1 - Math.pow(t, 1.6);
    const envelope = Math.min(rise, fall);
    ring.material.uniforms.uAmplitude.value = (0.012 + ring.intensity * 0.014) * envelope;
    // The crest narrows slightly as it travels so distinct rings stay
    // readable rather than broadening into an overlapping wash.
    ring.material.uniforms.uWidth.value = 0.22 + t * 0.18;
  }
}

// --- Live Web Audio FFT analysis (per design spec: live AnalyserNode, not
// pre-computed) driving the pulse-ring spawner via simple beat detection. ---
let analyser: AnalyserNode | null = null;
let freqData: Uint8Array | null = null;
let smoothedAudioLevel = 0;
const beatDetector = new BeatDetector();
function ensureAudioGraph(): void {
  if (analyser) return;
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaElementSource(audio);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  analyser.connect(audioCtx.destination);
  freqData = new Uint8Array(analyser.frequencyBinCount);
}
function updateVisualizerRing(dt: number): void {
  if (analyser && freqData) {
    analyser.getByteFrequencyData(freqData as Uint8Array<ArrayBuffer>);
    const amplitude = overallAmplitude(freqData);
    if (beatDetector.update(amplitude, dt)) spawnPulseRing(amplitude);
    // Smooth toward the raw amplitude so audio-reactive scene elements (e.g.
    // a swelling sea) breathe softly with the music rather than jittering
    // frame-to-frame with the raw FFT signal.
    smoothedAudioLevel += (amplitude - smoothedAudioLevel) * Math.min(1, dt * 3);
  } else {
    smoothedAudioLevel += (0 - smoothedAudioLevel) * Math.min(1, dt * 3);
  }
  updatePulseRings(dt);
}

// --- Bloom postprocessing (borrowed technique from Bloom's interior viewer) ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.5, // strength
  0.4, // radius
  0.65, // threshold — only the brightest hearth pixels bloom, not the whole scene
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

function onResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

// --- Slow continuous rotation while playing (per spec: ~20-30s/rotation) ---
// `lastT` is set on the first real animation frame (not at module-eval time):
// the very first `requestAnimationFrame` callback can fire a while after
// this module finishes running (shader/texture compile, first paint), which
// would otherwise produce one huge `dt` outlier that skips the assemble
// animation (and any other time-based effect) straight to near-completion.
let lastT: number | null = null;
function animate(now: number): void {
  requestAnimationFrame(animate);
  if (lastT === null) lastT = now;
  const dt = (now - lastT) / 1000;
  lastT = now;
  if (!audio.paused) {
    turntableGroup.rotation.y += (dt * (Math.PI * 2)) / 24; // ~24s per rotation
  }
  updateLyricsOverlay(audio.currentTime);
  updateVisualizerRing(dt);
  // Shared clock for every "assemble on load" effect (turntable base +
  // whatever the current scene module's own internal build-in animations
  // are) so their startOffsets are all measured from the same t=0.
  assembleClock += dt;
  if (turntableBaseAssembleAnim) {
    const stillAnimating = turntableBaseAssembleAnim.update(assembleClock);
    if (!stillAnimating) turntableBaseAssembleAnim = null;
  }
  currentBackdrop?.update(assembleClock, dt, smoothedAudioLevel);
  currentScene?.update(assembleClock, dt, smoothedAudioLevel);
  bookReader.update(dt);
  tabletopProps.update(dt, assembleClock);
  orbitControls.update();
  composer.render();
}
requestAnimationFrame(animate);

playBtn.addEventListener('click', () => {
  ensureAudioGraph();
  if (audio.paused) {
    void audio.play();
    playBtn.textContent = '⏸';
    playBtn.setAttribute('aria-label', 'Pause');
  } else {
    audio.pause();
    playBtn.textContent = '▶';
    playBtn.setAttribute('aria-label', 'Play');
  }
});
