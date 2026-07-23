/**
 * "Welsh Night Street" backdrop preset (Phase 5) — a static image of the
 * user's concept art (a night-time South Welsh terraced street), used
 * directly and unprocessed as `scene.background`.
 *
 * History: an earlier procedural-3D version never matched the concept
 * art's perspective and hit an unresolved rendering bug; a follow-up
 * looping-video version glitched visibly on every loop restart no matter
 * how the restart was triggered, even though the clip's last/first
 * frames matched. A plain static image sidesteps both problems entirely
 * — there's no perspective to get wrong (it's the actual artwork) and no
 * loop seam to glitch. A later attempt at vignette/blur/glow post-
 * processing to make the foreground table/diorama pop was also dropped
 * — the plain image read better, and matching the concept art's
 * perspective is really a camera-positioning question, not an image-
 * processing one.
 *
 * Like a plain `THREE.Color` background, a 2D `THREE.Texture` assigned to
 * `scene.background` renders as a fixed, camera-orientation-independent
 * backdrop filling the viewport — it does not react to `OrbitControls`
 * drags. That matches how every other backdrop's solid-colour sky already
 * behaves here, so no camera changes are needed.
 */
import * as THREE from 'three';
import type { BackdropHandle, BackdropFactory } from './types';

const IMAGE_SRC = '/images/welsh-night-street-bg.png';

export const createWelshNightStreetBackdrop: BackdropFactory = (scene) => {
  const previousBackground = scene.background;

  const textureLoader = new THREE.TextureLoader();
  const texture = textureLoader.load(IMAGE_SRC, (loaded) => {
    // Only known once the image has actually decoded — apply "cover" fit
    // (like CSS `background-size: cover`) so the artwork isn't stretched
    // to the viewport's aspect ratio.
    applyCoverFit(loaded);
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.matrixAutoUpdate = false;

  function applyCoverFit(loadedTexture: THREE.Texture): void {
    const image = loadedTexture.image as HTMLImageElement | undefined;
    if (!image?.width || !image.height) return;
    const imageAspect = image.width / image.height;
    const viewportAspect = window.innerWidth / window.innerHeight;
    let repeatX = 1;
    let repeatY = 1;
    if (viewportAspect > imageAspect) {
      // Viewport is relatively wider than the image — crop top/bottom.
      repeatY = imageAspect / viewportAspect;
    } else {
      // Viewport is relatively taller than the image — crop left/right.
      repeatX = viewportAspect / imageAspect;
    }
    loadedTexture.repeat.set(repeatX, repeatY);
    loadedTexture.offset.set((1 - repeatX) / 2, (1 - repeatY) / 2);
    loadedTexture.updateMatrix();
  }
  // Recompute the cover-fit crop whenever the viewport aspect changes.
  const onResize = () => applyCoverFit(texture);
  window.addEventListener('resize', onResize);

  scene.background = texture;

  // Modest ambient/hemisphere/key fill so the table/diorama sitting in
  // front of the image still reads with some shape, tuned toward the
  // artwork's cool night palette.
  const ambientLight = new THREE.AmbientLight(0x445577, 1.6);
  scene.add(ambientLight);
  const hemisphereLight = new THREE.HemisphereLight(0x445577, 0x14101c, 1.0);
  scene.add(hemisphereLight);
  const keyLight = new THREE.DirectionalLight(0xaaccff, 1.1);
  keyLight.position.set(-6, 30, 15);
  scene.add(keyLight);

  const handle: BackdropHandle = {
    update() {
      // Nothing to animate — static image background.
    },
    dispose() {
      window.removeEventListener('resize', onResize);
      scene.remove(ambientLight, hemisphereLight, keyLight);
      texture.dispose();
      scene.background = previousBackground;
    },
  };
  return handle;
};
