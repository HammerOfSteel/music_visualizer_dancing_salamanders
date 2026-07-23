/**
 * Procedural canvas-based textures — no external image assets. Currently
 * used by the tabletop (Phase 3b, 3.9) but written as a generic engine
 * helper so future wood-ish props (3.12) can reuse `createWoodGrainTexture`
 * without duplicating the canvas-drawing logic.
 */
import * as THREE from 'three';

function hexToRgb(hex: string): [number, number, number] {
  const num = parseInt(hex.replace('#', ''), 16);
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

export interface WoodGrainOptions {
  width?: number;
  height?: number;
  /** Base plank colour, e.g. '#6b4530'. */
  baseColor?: string;
  /** Colour of the grain streaks/knots, usually a darker shade of baseColor. */
  grainColor?: string;
  knotCount?: number;
  /** 0-1 strength of the darkened, worn/scuffed-looking edge vignette. */
  edgeDarken?: number;
}

/** Paints a wood-grain texture onto a canvas: a per-pixel sine-based "wood
 * rings" pattern (wavy distortion + quantized colour banding for a
 * stylized/painterly look, not a smooth photoreal gradient) with jittered
 * plank-seam dividers, a few knots, and an optional darkened edge vignette
 * for a worn/scuffed look. Meant to be mapped once across a surface at
 * `repeat.set(1, 1)` rather than tiled — tiling reads as an artificial
 * repeating grid at this scale. */
export function createWoodGrainTexture(options: WoodGrainOptions = {}): THREE.CanvasTexture {
  const {
    width = 1024,
    height = 1024,
    baseColor = '#6b4530',
    grainColor = '#3a2718',
    knotCount = 4,
    edgeDarken = 0.3,
  } = options;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Per-pixel wood-ring pattern: a sine wave (with a slower secondary wave
  // added in for wavy, non-uniform rings) run through a few quantized
  // colour bands rather than a smooth gradient, plus a little per-pixel
  // noise — reads as stylized painted wood grain rather than a photo
  // texture, which suits the diorama's low-poly look.
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  const [darkR, darkG, darkB] = hexToRgb(grainColor);
  const [lightR, lightG, lightB] = hexToRgb(baseColor);
  const ringScaleX = 0.012;
  const ringScaleY = 0.05;
  const ringCount = 8;
  const bandSteps = 5;
  for (let y = 0; y < height; y++) {
    const ny = y * ringScaleY;
    for (let x = 0; x < width; x++) {
      const nx = x * ringScaleX;
      const distortion = Math.sin(nx * 2.0) * 3.0 + Math.sin(nx * 0.5) * 1.5;
      let value = Math.sin((ny + distortion) * ringCount);
      value = (value + 1) / 2;
      value = Math.floor(value * bandSteps) / (bandSteps - 1);
      const noise = (Math.random() - 0.5) * 0.1;
      value = Math.max(0, Math.min(1, value + noise));
      const idx = (y * width + x) * 4;
      data[idx] = darkR + (lightR - darkR) * value;
      data[idx + 1] = darkG + (lightG - darkG) * value;
      data[idx + 2] = darkB + (lightB - darkB) * value;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  // Plank seams overlaid on top of the ring pattern: jittered widths and a
  // wavy, hand-cut-looking line rather than a perfectly straight one, since
  // dead-straight evenly-spaced lines read as an artificial CAD grid.
  const plankCount = 5 + Math.floor(Math.random() * 3);
  const avgPlankWidth = width / plankCount;
  let x0 = 0;
  for (let p = 0; p < plankCount; p++) {
    const plankWidth = p === plankCount - 1 ? width - x0 : avgPlankWidth * (0.8 + Math.random() * 0.4);
    if (p > 0) {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let y = 0;
      let x = x0 + (Math.random() - 0.5) * 4;
      ctx.moveTo(x, y);
      while (y < height) {
        y += 14 + Math.random() * 22;
        x = x0 + (Math.random() - 0.5) * 5;
        ctx.lineTo(x, Math.min(y, height));
      }
      ctx.stroke();
    }
    x0 += plankWidth;
  }

  // A handful of knots.
  for (let i = 0; i < knotCount; i++) {
    const kx = Math.random() * width;
    const ky = Math.random() * height;
    const r = 6 + Math.random() * 10;
    const gradient = ctx.createRadialGradient(kx, ky, 0, kx, ky, r * 2.2);
    gradient.addColorStop(0, 'rgba(20,12,8,0.8)');
    gradient.addColorStop(0.5, 'rgba(40,24,14,0.4)');
    gradient.addColorStop(1, 'rgba(40,24,14,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(kx, ky, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  if (edgeDarken > 0) {
    const gradient = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.3,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.72,
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${edgeDarken})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface WovenRunnerOptions {
  size?: number;
  baseColor?: string;
  accentColor?: string;
}

/** Paints a simple woven-cloth-look texture (crosshatch weave + a few
 * concentric accent rings near the edge) for a table runner/doily. */
export function createWovenRunnerTexture(options: WovenRunnerOptions = {}): THREE.CanvasTexture {
  const { size = 512, baseColor = '#8a3b3b', accentColor = '#e8d9b5' } = options;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  for (let i = -size; i < size * 2; i += 6) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }
  ctx.strokeStyle = '#ffffff';
  for (let i = -size; i < size * 2; i += 6) {
    ctx.beginPath();
    ctx.moveTo(i, size);
    ctx.lineTo(i + size, 0);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.48;
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.6;
  for (let ring = 0; ring < 4; ring++) {
    const r = maxR * (0.78 + ring * 0.055);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
