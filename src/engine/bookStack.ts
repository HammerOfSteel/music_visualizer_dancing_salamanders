/**
 * Procedural book-stack generator (Phase 3b, 3.10) — a generic engine
 * module: it knows how to draw a stylized book-cover canvas texture (base
 * colour + emblem silhouette + foil title band with wrapped text) and how
 * to stack a handful of book meshes with jitter so the pile reads as messy
 * rather than a neat catalog. It has zero knowledge of any specific book
 * titles/content — callers pass in a title pool + family style map (see
 * `src/content/bookTitles.ts`) so this stays reusable for any book-ish
 * content bank.
 */
import * as THREE from 'three';

export type EmblemType = 'raven' | 'moon' | 'flask' | 'harp' | 'dragon' | 'star' | 'wave' | 'heart';

export interface BookFamilyStyle {
  coverColors: string[];
  accentColor: string;
  emblems: EmblemType[];
}

export interface BookTitleEntry<TFamily extends string = string> {
  title: string;
  family: TFamily;
}

/** Metadata stamped onto a book mesh's `userData` so an interaction system
 * (e.g. `src/engine/bookReader.ts`) can pick it up, read its title, and
 * regenerate its cover colours without needing to know how the mesh was
 * built. */
export interface BookUserData {
  isBook: true;
  title: string;
  family: string;
  coverColor: string;
  accentColor: string;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Draws a simple, stylized emblem silhouette centred at (0,0) within a
 * `size`-square area — low-poly/woodcut style shapes, not detailed art. */
function drawEmblem(ctx: CanvasRenderingContext2D, type: EmblemType, size: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.05;
  ctx.lineCap = 'round';

  switch (type) {
    case 'moon': {
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(size * 0.2, -size * 0.08, size * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'star': {
      const spikes = 5;
      const outerR = size * 0.45;
      const innerR = size * 0.2;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (Math.PI / spikes) * i - Math.PI / 2;
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'flask': {
      ctx.beginPath();
      ctx.moveTo(-size * 0.1, -size * 0.42);
      ctx.lineTo(size * 0.1, -size * 0.42);
      ctx.lineTo(size * 0.1, -size * 0.08);
      ctx.lineTo(size * 0.32, size * 0.36);
      ctx.quadraticCurveTo(0, size * 0.5, -size * 0.32, size * 0.36);
      ctx.lineTo(-size * 0.1, -size * 0.08);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'harp': {
      ctx.beginPath();
      ctx.moveTo(-size * 0.28, size * 0.42);
      ctx.quadraticCurveTo(-size * 0.08, -size * 0.46, size * 0.28, -size * 0.36);
      ctx.lineTo(size * 0.2, -size * 0.28);
      ctx.quadraticCurveTo(-size * 0.05, -size * 0.38, -size * 0.2, size * 0.38);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        const x0 = -size * 0.24 + t * size * 0.1;
        ctx.beginPath();
        ctx.moveTo(x0, size * 0.28 - t * size * 0.08);
        ctx.lineTo(x0 + size * 0.32, -size * 0.32 + t * size * 0.04);
        ctx.stroke();
      }
      break;
    }
    case 'raven': {
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.2, size * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-size * 0.12, -size * 0.04);
      ctx.quadraticCurveTo(-size * 0.46, -size * 0.32, -size * 0.38, size * 0.1);
      ctx.quadraticCurveTo(-size * 0.26, 0, -size * 0.12, size * 0.02);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(size * 0.12, -size * 0.04);
      ctx.quadraticCurveTo(size * 0.46, -size * 0.32, size * 0.38, size * 0.1);
      ctx.quadraticCurveTo(size * 0.26, 0, size * 0.12, size * 0.02);
      ctx.fill();
      break;
    }
    case 'dragon': {
      ctx.beginPath();
      ctx.moveTo(-size * 0.36, size * 0.1);
      ctx.quadraticCurveTo(-size * 0.08, size * 0.42, size * 0.14, size * 0.14);
      ctx.quadraticCurveTo(size * 0.32, -size * 0.05, size * 0.14, -size * 0.24);
      ctx.quadraticCurveTo(size * 0.04, -size * 0.32, -size * 0.1, -size * 0.24);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-size * 0.1, -size * 0.24);
      ctx.lineTo(-size * 0.26, -size * 0.3);
      ctx.lineTo(-size * 0.16, -size * 0.14);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'wave': {
      ctx.beginPath();
      ctx.moveTo(-size * 0.45, 0);
      for (let x = -size * 0.45; x <= size * 0.45; x += size * 0.04) {
        const y = Math.sin((x / size) * Math.PI * 2.4) * size * 0.14;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      break;
    }
    case 'heart': {
      ctx.beginPath();
      ctx.moveTo(0, size * 0.28);
      ctx.bezierCurveTo(-size * 0.46, -size * 0.08, -size * 0.18, -size * 0.44, 0, -size * 0.14);
      ctx.bezierCurveTo(size * 0.18, -size * 0.44, size * 0.46, -size * 0.08, 0, size * 0.28);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxWidth: number,
  lineHeight: number,
): void {
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
  const totalHeight = lines.length * lineHeight;
  let y = cy - totalHeight / 2 + lineHeight / 2;
  for (const l of lines) {
    ctx.fillText(l, cx, y);
    y += lineHeight;
  }
}

/** Paints one book's front-cover texture: cloth/leather base colour, a
 * centred emblem silhouette, and a foil title band with wrapped text. */
function createBookCoverTexture(title: string, coverColor: string, accentColor: string, emblem: EmblemType): THREE.CanvasTexture {
  const width = 256;
  const height = 384;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = coverColor;
  ctx.fillRect(0, 0, width, height);

  // Subtle cloth/leather speckle noise.
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(0,0,0,${(Math.random() * 0.06).toFixed(3)})`;
    ctx.fillRect(Math.random() * width, Math.random() * height, 2, 2);
  }

  ctx.save();
  ctx.translate(width / 2, height * 0.36);
  drawEmblem(ctx, emblem, width * 0.55, accentColor);
  ctx.restore();

  const bandY = height * 0.68;
  const bandHeight = height * 0.16;
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = accentColor;
  ctx.fillRect(width * 0.08, bandY, width * 0.84, bandHeight);
  ctx.globalAlpha = 1;

  ctx.fillStyle = coverColor;
  ctx.font = `bold ${Math.round(height * 0.042)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  wrapText(ctx, title, width / 2, bandY + bandHeight / 2, width * 0.76, height * 0.048);

  // Spine-edge darkening down the left side.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(0, 0, width * 0.045, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface BookStackOptions<TFamily extends string> {
  /** How many books to stack; defaults to a random 2-5. */
  count?: number;
  /** Base position (bottom of the stack, resting on whatever surface). */
  position?: THREE.Vector3;
  /** Random Y rotation applied to the whole stack. */
  rotationY?: number;
}

/** Builds a `THREE.Group` of jittered, stacked book meshes: picks `count`
 * random (non-repeating where possible) entries from `pool`, generates each
 * a procedural cover texture per its family's style, and stacks them with
 * slight position/rotation jitter and per-book size variance so it reads as
 * a believable messy pile rather than a neat catalog. */
export function createBookStack<TFamily extends string>(
  pool: readonly BookTitleEntry<TFamily>[],
  familyStyles: Record<TFamily, BookFamilyStyle>,
  options: BookStackOptions<TFamily> = {},
): THREE.Group {
  const { count = 2 + Math.floor(Math.random() * 4), position = new THREE.Vector3(0, 0, 0), rotationY = 0 } = options;

  const group = new THREE.Group();
  group.position.copy(position);
  group.rotation.y = rotationY;

  const remaining = [...pool];
  const chosen: BookTitleEntry<TFamily>[] = [];
  const pickCount = Math.min(count, remaining.length);
  for (let i = 0; i < pickCount; i++) {
    const idx = Math.floor(Math.random() * remaining.length);
    chosen.push(remaining.splice(idx, 1)[0]);
  }

  let stackY = 0;
  for (const entry of chosen) {
    const style = familyStyles[entry.family];
    const coverColor = pick(style.coverColors);
    const emblem = pick(style.emblems);
    const coverTexture = createBookCoverTexture(entry.title, coverColor, style.accentColor, emblem);

    const bookWidth = 1.05 + Math.random() * 0.35;
    const bookDepth = 1.45 + Math.random() * 0.3;
    const bookHeight = 0.15 + Math.random() * 0.08;

    const sideMaterial = new THREE.MeshStandardMaterial({ color: coverColor, roughness: 0.85, flatShading: true });
    const pageMaterial = new THREE.MeshStandardMaterial({ color: '#e8e2d0', roughness: 0.9, flatShading: true });
    const coverMaterial = new THREE.MeshStandardMaterial({ map: coverTexture, roughness: 0.7, flatShading: true });
    const materials = [sideMaterial, sideMaterial, coverMaterial, pageMaterial, sideMaterial, sideMaterial];

    const book = new THREE.Mesh(new THREE.BoxGeometry(bookWidth, bookHeight, bookDepth), materials);
    book.position.set((Math.random() - 0.5) * 0.16, stackY + bookHeight / 2, (Math.random() - 0.5) * 0.16);
    book.rotation.y = (Math.random() - 0.5) * 0.45;
    book.castShadow = true;
    book.receiveShadow = true;
    const userData: BookUserData = {
      isBook: true,
      title: entry.title,
      family: entry.family,
      coverColor,
      accentColor: style.accentColor,
    };
    book.userData = userData;
    group.add(book);
    stackY += bookHeight;
  }

  return group;
}

export interface BookStandOptions<TFamily extends string> {
  /** How many books to display upright; defaults to 3. */
  count?: number;
  /** Base position (bottom of the stand's plinth, resting on a surface). */
  position?: THREE.Vector3;
  /** Y rotation applied to the whole stand, e.g. to angle it toward a camera. */
  rotationY?: number;
}

/** Builds a small wooden book-stand `THREE.Group`: a plinth with a low back
 * ledge, and `count` books standing upright side by side on top with their
 * front covers facing forward (local +z) so titles are readable — unlike
 * `createBookStack()`'s flat messy pile, this is meant for close-up display
 * where the cover art/title needs to actually be legible. */
export function createBookStand<TFamily extends string>(
  pool: readonly BookTitleEntry<TFamily>[],
  familyStyles: Record<TFamily, BookFamilyStyle>,
  options: BookStandOptions<TFamily> = {},
): THREE.Group {
  const { count = 3, position = new THREE.Vector3(0, 0, 0), rotationY = 0 } = options;

  const group = new THREE.Group();
  group.position.copy(position);
  group.rotation.y = rotationY;

  const remaining = [...pool];
  const chosen: BookTitleEntry<TFamily>[] = [];
  const pickCount = Math.min(count, remaining.length);
  for (let i = 0; i < pickCount; i++) {
    const idx = Math.floor(Math.random() * remaining.length);
    chosen.push(remaining.splice(idx, 1)[0]);
  }

  const bookDims = chosen.map(() => ({
    width: 0.85 + Math.random() * 0.2,
    height: 1.3 + Math.random() * 0.2,
    depth: 0.2 + Math.random() * 0.06,
  }));
  // Books stand with their front cover (width x height) facing the camera,
  // so neighbouring books must be spaced by *width* — using the thin
  // spine `depth` here was the earlier bug that made covers overlap.
  const gap = 0.1;
  const totalWidth = bookDims.reduce((sum, d) => sum + d.width, 0) + gap * Math.max(0, bookDims.length - 1);
  const plinthWidth = totalWidth + 0.4;

  // Wooden plinth the books stand on.
  const plinthThickness = 0.09;
  const plinthDepth = 0.4;
  const standMaterial = new THREE.MeshStandardMaterial({ color: '#5a3d28', roughness: 0.85, flatShading: true });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(plinthWidth, plinthThickness, plinthDepth), standMaterial);
  plinth.position.y = plinthThickness / 2;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  // Low back ledge (bookend-style) the row visually rests against.
  const ledgeHeight = 0.24;
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(plinthWidth, ledgeHeight, 0.05), standMaterial);
  ledge.position.set(0, plinthThickness + ledgeHeight / 2, -plinthDepth / 2 + 0.03);
  ledge.castShadow = true;
  group.add(ledge);

  let x = -totalWidth / 2;
  for (let i = 0; i < chosen.length; i++) {
    const entry = chosen[i];
    const dims = bookDims[i];
    const style = familyStyles[entry.family];
    const coverColor = pick(style.coverColors);
    const emblem = pick(style.emblems);
    const coverTexture = createBookCoverTexture(entry.title, coverColor, style.accentColor, emblem);

    const edgeMaterial = new THREE.MeshStandardMaterial({ color: '#e8e2d0', roughness: 0.9, flatShading: true });
    const backMaterial = new THREE.MeshStandardMaterial({ color: coverColor, roughness: 0.85, flatShading: true });
    const coverMaterial = new THREE.MeshStandardMaterial({ map: coverTexture, roughness: 0.6, flatShading: true });
    // Face order for BoxGeometry: +x, -x, +y, -y, +z (front cover), -z (back).
    const materials = [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, coverMaterial, backMaterial];

    const book = new THREE.Mesh(new THREE.BoxGeometry(dims.width, dims.height, dims.depth), materials);
    book.position.set(x + dims.width / 2, plinthThickness + dims.height / 2, -plinthDepth / 2 + 0.14);
    // No y-rotation jitter — even a few degrees of yaw combined with the
    // wide front face causes neighbouring covers to clip into each other
    // at this spacing, and it fights readability. Keep the row dead flat.
    book.castShadow = true;
    book.receiveShadow = true;
    group.add(book);
    x += dims.width + gap;
  }

  return group;
}

