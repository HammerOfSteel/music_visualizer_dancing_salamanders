/**
 * Interactive book reader (Phase 3b) — lets the player click a book lying
 * in one of the table's `createBookStack()` piles to pick it up, hold it
 * up in front of the camera (gently bobbing), open it, and flip through a
 * few procedurally-written pages with a curling page-turn animation.
 *
 * This module owns all of the pick-up/open/flip state machine and 3D
 * math; it has no opinion about *what* the pages say — callers provide a
 * `getPages(title, family)` lookup (see `src/content/bookPages.ts`) so the
 * generator stays reusable for any book-ish content bank.
 */
import * as THREE from 'three';
import type { BookUserData } from './bookStack';

export interface BookReaderOptions {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  /** Groups (e.g. the two `createBookStack()` piles) to scan for
   * interactive books — any child mesh with `userData.isBook`. */
  stackGroups: THREE.Group[];
  /** Returns the page texts for a book, given its title/family. */
  getPages: (title: string, family: string) => string[];
}

export interface BookReaderSystem {
  update(dt: number): void;
}

type BookState = 'onTable' | 'lifting' | 'floating' | 'open' | 'flipping' | 'puttingDown';

interface StaticPage {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  texture: THREE.CanvasTexture | null;
}

interface FlipLeaf {
  pivot: THREE.Group;
  geometry: THREE.BufferGeometry;
  basePositions: Float32Array;
  frontMaterial: THREE.MeshStandardMaterial;
  backMaterial: THREE.MeshStandardMaterial;
  dir: 1 | -1;
}

interface Book {
  mesh: THREE.Mesh;
  homeParent: THREE.Object3D;
  homePosition: THREE.Vector3;
  homeQuaternion: THREE.Quaternion;
  title: string;
  pages: string[];
  state: BookState;
  spreadIndex: number;
  bobPhase: number;
  anchor: THREE.Group | null;
  leftPage: StaticPage | null;
  rightPage: StaticPage | null;
  flipLeaf: FlipLeaf | null;
  flipProgress: number;
  flipDuration: number;
  tweenFrom: THREE.Vector3 | null;
  tweenFromQuat: THREE.Quaternion | null;
  tweenTo: THREE.Vector3 | null;
  tweenToQuat: THREE.Quaternion | null;
  tweenT: number;
  tweenDuration: number;
  onTweenDone: (() => void) | null;
}

// Where a held/open book sits on screen, expressed relative to the
// camera (forward + down offsets tuned against the original low camera)
// rather than a fixed world position — a fixed world constant here used
// to put the book on the ground once the camera/table were raised much
// higher for the aerial "cloud" view.
//
// HAND_DOWN_OFFSET in particular must stay small: the default camera sits
// high above the table pitched steeply downward, so its local "down" axis
// points mostly *toward* the table rather than straight down in screen
// space — at the old value (1.6) the held book projected to ~104% of the
// screen height (i.e. entirely below the visible viewport, only its very
// top edge poking in above the transport bar). 0.2 keeps the whole book
// on screen with margin top and bottom.
const HAND_FORWARD_OFFSET = 3.6;
const HAND_DOWN_OFFSET = 0.2;
function computeHandPosition(camera: THREE.Camera): THREE.Vector3 {
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const down = new THREE.Vector3(0, -1, 0).applyQuaternion(camera.quaternion);
  return camera.position
    .clone()
    .addScaledVector(forward, HAND_FORWARD_OFFSET)
    .addScaledVector(down, HAND_DOWN_OFFSET);
}
const PAGE_WIDTH = 1.15;
const PAGE_HEIGHT = 1.55;
const PAGE_GAP = 0.05;
const CURL_STRENGTH = 0.4;
const FLIP_DURATION = 0.6;
const LIFT_DURATION = 0.55;
const BOB_SPEED = 1.6;
const BOB_AMPLITUDE = 0.06;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Builds an orthonormal basis where local +Y (the book cover's / page's
 * normal) points directly back at the camera along the camera's *own*
 * forward axis, and local X/Z align with the camera's own right/up axes.
 *
 * This makes the held book a true camera-facing billboard — parallel to
 * the camera's image plane — so it reads perfectly flat on screen no
 * matter how the (static) camera is angled or pitched.
 *
 * IMPORTANT: `right`, `up`, `back` (= -forward) form a right-handed set
 * (right × up = back), so a basis built from them column-order
 * (right, back, up) has determinant -1 — an improper (mirror) transform,
 * not a rotation — which `setFromRotationMatrix` cannot represent and
 * silently produces a degenerate quaternion. Using `down` (= -up) instead
 * keeps (right, back, down) proper (det = +1: right × back = down) while
 * still mapping local X → screen-right and local -Z → screen-up (verified
 * numerically), so nothing appears mirrored. */
function computeHeldQuaternion(camera: THREE.Camera): THREE.Quaternion {
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const down = new THREE.Vector3(0, -1, 0).applyQuaternion(camera.quaternion);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const back = forward.negate();
  const m = new THREE.Matrix4().makeBasis(right, back, down);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function createPageTexture(text: string, pageLabel: string): THREE.CanvasTexture {
  const width = 512;
  const height = 690;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f2ead9';
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(120,100,70,${(Math.random() * 0.04).toFixed(3)})`;
    ctx.fillRect(Math.random() * width, Math.random() * height, 2, 2);
  }
  ctx.strokeStyle = 'rgba(90,70,45,0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, width - 36, height - 36);

  ctx.fillStyle = '#3a2c1a';
  ctx.font = '30px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const maxWidth = width - 90;
  const lines = wrapLines(ctx, text, maxWidth);
  const lineHeight = 40;
  let y = 90;
  for (const line of lines) {
    if (y > height - 80) break;
    ctx.fillText(line, 45, y);
    y += lineHeight;
  }

  ctx.font = '20px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#7a6a4e';
  ctx.fillText(pageLabel, width / 2, height - 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildStaticPageMesh(): StaticPage {
  const geometry = new THREE.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ color: '#f2ead9', roughness: 0.95 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return { mesh, material, texture: null };
}

function setPageTexture(page: StaticPage, texture: THREE.CanvasTexture): void {
  page.texture?.dispose();
  page.texture = texture;
  page.material.map = texture;
  page.material.color.set('#ffffff');
  page.material.needsUpdate = true;
}

function buildFlipLeaf(dir: 1 | -1): FlipLeaf {
  const geometry = new THREE.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT, 18, 1);
  geometry.translate((dir * PAGE_WIDTH) / 2, 0, 0);
  geometry.rotateX(-Math.PI / 2);
  const basePositions = (geometry.attributes.position as THREE.BufferAttribute).array.slice() as Float32Array;

  const frontMaterial = new THREE.MeshStandardMaterial({ color: '#f2ead9', roughness: 0.95, side: THREE.FrontSide });
  const backMaterial = new THREE.MeshStandardMaterial({ color: '#f2ead9', roughness: 0.95, side: THREE.BackSide });
  const front = new THREE.Mesh(geometry, frontMaterial);
  const back = new THREE.Mesh(geometry, backMaterial);
  front.castShadow = true;
  const pivot = new THREE.Group();
  pivot.add(front, back);

  return { pivot, geometry, basePositions, frontMaterial, backMaterial, dir };
}

function updateFlipCurl(leaf: FlipLeaf, progress: number): void {
  const posAttr = leaf.geometry.attributes.position as THREE.BufferAttribute;
  const arr = posAttr.array as Float32Array;
  const bulge = Math.sin(progress * Math.PI);
  for (let i = 0; i < posAttr.count; i++) {
    const bx = leaf.basePositions[i * 3];
    const u = Math.min(1, Math.abs(bx) / PAGE_WIDTH);
    arr[i * 3 + 1] = 0.015 + CURL_STRENGTH * u * u * bulge;
  }
  posAttr.needsUpdate = true;
  leaf.geometry.computeVertexNormals();
}

export function createBookReaderSystem(options: BookReaderOptions): BookReaderSystem {
  const { scene, camera, domElement, stackGroups, getPages } = options;

  const books: Book[] = [];
  for (const group of stackGroups) {
    for (const child of group.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      const data = child.userData as Partial<BookUserData>;
      if (!data.isBook) continue;
      const homePosition = new THREE.Vector3();
      const homeQuaternion = new THREE.Quaternion();
      child.getWorldPosition(homePosition);
      child.getWorldQuaternion(homeQuaternion);
      books.push({
        mesh: child,
        homeParent: group,
        homePosition,
        homeQuaternion,
        title: data.title ?? 'Untitled',
        pages: getPages(data.title ?? 'Untitled', data.family ?? 'homely'),
        state: 'onTable',
        spreadIndex: 0,
        bobPhase: Math.random() * Math.PI * 2,
        anchor: null,
        leftPage: null,
        rightPage: null,
        flipLeaf: null,
        flipProgress: 0,
        flipDuration: FLIP_DURATION,
        tweenFrom: null,
        tweenFromQuat: null,
        tweenTo: null,
        tweenToQuat: null,
        tweenT: 0,
        tweenDuration: LIFT_DURATION,
        onTweenDone: null,
      });
    }
  }

  let activeBook: Book | null = null;

  function startTween(
    book: Book,
    from: THREE.Vector3,
    fromQuat: THREE.Quaternion,
    to: THREE.Vector3,
    toQuat: THREE.Quaternion,
    duration: number,
    onDone: (() => void) | null,
  ): void {
    book.tweenFrom = from.clone();
    book.tweenFromQuat = fromQuat.clone();
    book.tweenTo = to.clone();
    book.tweenToQuat = toQuat.clone();
    book.tweenT = 0;
    book.tweenDuration = duration;
    book.onTweenDone = onDone;
  }

  function pickUpBook(book: Book): void {
    if (activeBook) return;
    activeBook = book;
    book.state = 'lifting';
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    book.mesh.getWorldPosition(worldPos);
    book.mesh.getWorldQuaternion(worldQuat);
    scene.attach(book.mesh);
    startTween(book, worldPos, worldQuat, computeHandPosition(camera), computeHeldQuaternion(camera), LIFT_DURATION, () => {
      book.state = 'floating';
    });
  }

  function putDownBook(book: Book): void {
    closeBookVisuals(book);
    book.state = 'puttingDown';
    startTween(book, book.mesh.position, book.mesh.quaternion, book.homePosition, book.homeQuaternion, LIFT_DURATION, () => {
      book.homeParent.attach(book.mesh);
      book.mesh.visible = true;
      book.state = 'onTable';
      book.spreadIndex = 0;
      activeBook = null;
    });
  }

  function buildOpenAnchor(book: Book): void {
    const anchor = new THREE.Group();
    anchor.position.copy(computeHandPosition(camera));
    anchor.quaternion.copy(computeHeldQuaternion(camera));
    scene.add(anchor);

    const left = buildStaticPageMesh();
    left.mesh.position.x = -(PAGE_WIDTH / 2 + PAGE_GAP / 2);
    const right = buildStaticPageMesh();
    right.mesh.position.x = PAGE_WIDTH / 2 + PAGE_GAP / 2;
    anchor.add(left.mesh, right.mesh);

    setPageTexture(left, createPageTexture(book.pages[book.spreadIndex] ?? '', `${book.spreadIndex + 1}`));
    setPageTexture(right, createPageTexture(book.pages[book.spreadIndex + 1] ?? '', `${book.spreadIndex + 2}`));

    book.anchor = anchor;
    book.leftPage = left;
    book.rightPage = right;
    book.mesh.visible = false;
  }

  function closeBookVisuals(book: Book): void {
    if (book.anchor) {
      scene.remove(book.anchor);
      book.leftPage?.texture?.dispose();
      book.rightPage?.texture?.dispose();
      book.anchor.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    }
    book.anchor = null;
    book.leftPage = null;
    book.rightPage = null;
    book.flipLeaf = null;
    book.mesh.visible = true;
  }

  function openBook(book: Book): void {
    book.state = 'open';
    book.spreadIndex = 0;
    buildOpenAnchor(book);
  }

  function startFlip(book: Book, dir: 1 | -1): void {
    if (!book.leftPage || !book.rightPage) return;
    const newSpreadIndex = book.spreadIndex + dir * 2;
    if (newSpreadIndex < 0) {
      // No previous spread — flipping back past the first page closes the book.
      book.state = 'floating';
      closeBookVisuals(book);
      return;
    }
    if (dir === 1 && book.spreadIndex + 2 >= book.pages.length) return; // no next spread
    if (dir === -1 && newSpreadIndex + 1 >= book.pages.length) return;

    const leaf = buildFlipLeaf(dir);
    leaf.pivot.position.x = dir === 1 ? PAGE_GAP / 2 : -(PAGE_GAP / 2);
    book.anchor!.add(leaf.pivot);
    book.flipLeaf = leaf;
    book.flipProgress = 0;
    book.state = 'flipping';

    if (dir === 1) {
      leaf.frontMaterial.map = createPageTexture(book.pages[book.spreadIndex + 1] ?? '', `${book.spreadIndex + 2}`);
      leaf.backMaterial.map = createPageTexture(book.pages[book.spreadIndex + 2] ?? '', `${book.spreadIndex + 3}`);
      leaf.frontMaterial.color.set('#ffffff');
      leaf.backMaterial.color.set('#ffffff');
      leaf.frontMaterial.needsUpdate = true;
      leaf.backMaterial.needsUpdate = true;
      book.rightPage!.mesh.visible = false;
      setPageTexture(book.rightPage!, createPageTexture(book.pages[book.spreadIndex + 3] ?? '', `${book.spreadIndex + 4}`));
    } else {
      leaf.frontMaterial.map = createPageTexture(book.pages[book.spreadIndex] ?? '', `${book.spreadIndex + 1}`);
      leaf.backMaterial.map = createPageTexture(book.pages[book.spreadIndex - 1] ?? '', `${book.spreadIndex}`);
      leaf.frontMaterial.color.set('#ffffff');
      leaf.backMaterial.color.set('#ffffff');
      leaf.frontMaterial.needsUpdate = true;
      leaf.backMaterial.needsUpdate = true;
      book.leftPage!.mesh.visible = false;
      setPageTexture(book.leftPage!, createPageTexture(book.pages[book.spreadIndex - 2] ?? '', `${book.spreadIndex - 1}`));
    }
  }

  function finishFlip(book: Book): void {
    const leaf = book.flipLeaf;
    if (!leaf) return;
    const dir = leaf.dir;

    // The page under the flipping leaf never had its texture swapped (only
    // the far static page was pre-swapped in `startFlip`) — update it now to
    // match what the leaf's back face was showing, otherwise it keeps
    // displaying stale content forever after the leaf is disposed.
    if (dir === 1) {
      setPageTexture(book.leftPage!, createPageTexture(book.pages[book.spreadIndex + 2] ?? '', `${book.spreadIndex + 3}`));
    } else {
      setPageTexture(book.rightPage!, createPageTexture(book.pages[book.spreadIndex - 1] ?? '', `${book.spreadIndex}`));
    }

    book.anchor!.remove(leaf.pivot);
    leaf.geometry.dispose();
    leaf.frontMaterial.map?.dispose();
    leaf.backMaterial.map?.dispose();
    leaf.frontMaterial.dispose();
    leaf.backMaterial.dispose();
    book.flipLeaf = null;

    book.spreadIndex += dir * 2;
    if (dir === 1) {
      book.rightPage!.mesh.visible = true;
    } else {
      book.leftPage!.mesh.visible = true;
    }
    book.state = 'open';
  }

  function onPointerDown(event: PointerEvent): void {
    const rect = domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);

    if (!activeBook) {
      const targets = books.filter((b) => b.state === 'onTable').map((b) => b.mesh);
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        const hitMesh = hits[0].object;
        const book = books.find((b) => b.mesh === hitMesh);
        if (book) pickUpBook(book);
      }
      return;
    }

    const book = activeBook;
    if (book.state === 'floating') {
      const hits = raycaster.intersectObject(book.mesh, false);
      if (hits.length > 0) {
        openBook(book);
      } else {
        putDownBook(book);
      }
      return;
    }

    if (book.state === 'open') {
      const targets = [book.leftPage!.mesh, book.rightPage!.mesh];
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length === 0) {
        putDownBook(book);
        return;
      }
      const hitMesh = hits[0].object;
      if (hitMesh === book.rightPage!.mesh) {
        startFlip(book, 1);
      } else {
        startFlip(book, -1);
      }
      return;
    }
    // 'lifting' / 'puttingDown' / 'flipping' — ignore clicks mid-transition.
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && activeBook) {
      putDownBook(activeBook);
    }
  }

  domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('keydown', onKeyDown);

  function update(dt: number): void {
    for (const book of books) {
      if (book.tweenTo && book.tweenFrom && book.tweenFromQuat && book.tweenToQuat) {
        book.tweenT = Math.min(1, book.tweenT + dt / book.tweenDuration);
        const t = easeInOutCubic(book.tweenT);
        book.mesh.position.lerpVectors(book.tweenFrom, book.tweenTo, t);
        book.mesh.quaternion.slerpQuaternions(book.tweenFromQuat, book.tweenToQuat, t);
        if (book.tweenT >= 1) {
          const done = book.onTweenDone;
          book.tweenFrom = null;
          book.tweenFromQuat = null;
          book.tweenTo = null;
          book.tweenToQuat = null;
          book.onTweenDone = null;
          done?.();
        }
      }

      if (book.state === 'flipping' && book.flipLeaf) {
        book.flipProgress = Math.min(1, book.flipProgress + dt / book.flipDuration);
        // Positive rotation about the anchor's local Z (up) axis sweeps the
        // page's +X edge toward +Y (the anchor's "toward camera" normal)
        // first, so the page lifts up and toward the viewer as it turns
        // rather than dipping away behind the book.
        const angle = book.flipLeaf.dir * Math.PI * book.flipProgress;
        book.flipLeaf.pivot.rotation.z = angle;
        updateFlipCurl(book.flipLeaf, book.flipProgress);
        if (book.flipProgress >= 1) finishFlip(book);
      }

      if (book.state === 'floating' || book.state === 'open') {
        book.bobPhase += dt * BOB_SPEED;
        const bob = Math.sin(book.bobPhase) * BOB_AMPLITUDE;
        const sway = Math.sin(book.bobPhase * 0.6) * 0.02;
        // Recomputed from the LIVE camera every frame (not a one-time
        // snapshot) — the camera can now be freely dragged/orbited by the
        // player, so a held/open book needs to keep tracking "in front of
        // you" rather than staying pinned to wherever the camera used to
        // be when it was picked up.
        const target = book.anchor ?? book.mesh;
        target.position.copy(computeHandPosition(camera));
        target.position.y += bob;
        target.quaternion.copy(computeHeldQuaternion(camera));
        target.rotateZ(sway);
      }
    }
  }

  return { update };
}
