/**
 * "Moonlit isle" backdrop preset (Phase 3.7 #1) — the original lighting
 * recipe from "The Bells of Lyonesse" (Phase 0/1), pulled out of
 * `scenes/bellsOfLyonesse.ts` in Phase 3.11 so it's a reusable, swappable
 * backdrop rather than baked into that one song's scene module. Night,
 * cool moonlight + warm bell-glow contrast (the bell-glow itself stays in
 * the diorama scene — this owns the surrounding ambient/hemisphere/key
 * fill and the fixed moon), animated sea lives in the diorama scene too
 * (it's part of that song's specific content, not generic backdrop).
 */
import * as THREE from 'three';
import type { BackdropHandle, BackdropFactory } from './types';

export const createMoonlitIsleBackdrop: BackdropFactory = (scene) => {
  const previousBackground = scene.background;

  const ambientLight = new THREE.AmbientLight(0x40405a, 2.2);
  scene.add(ambientLight);
  const hemisphereLight = new THREE.HemisphereLight(0x445577, 0x1a1410, 1.2);
  scene.add(hemisphereLight);
  const keyLight = new THREE.DirectionalLight(0xaabbee, 1.3);
  keyLight.position.set(4, 8, 6);
  scene.add(keyLight);

  // Moon: fixed in world space — a cool blue-white counterpoint to warm
  // hearth-glow light sources in whatever diorama is currently mounted.
  // Bright enough to catch its own soft bloom. Casts real shadows so the
  // diorama reads with proper depth as it turns beneath this fixed light.
  //
  // NOTE on placement: the turntable/diorama (`tableGroup`) lives up at
  // world y=27 (see `main.ts`), not near the origin — this preset's moon
  // predates that offset, so it used to sit at (-3, 5, -6), well below
  // and just in front of the tabletop, where it rendered hidden behind
  // the (opaque, near-camera) table surface instead of up in the "sky".
  // Placed up near table height and further back in Z instead, matching
  // the world-placement convention documented in `cottageHearthNook.ts`.
  const moonLight = new THREE.DirectionalLight(0xaaccff, 1.8);
  moonLight.position.set(-9, 34, -20);
  moonLight.target.position.set(0, 27, 0);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const moonShadowCam = moonLight.shadow.camera as THREE.OrthographicCamera;
  moonShadowCam.left = -3;
  moonShadowCam.right = 3;
  moonShadowCam.top = 3;
  moonShadowCam.bottom = -3;
  moonShadowCam.near = 15;
  moonShadowCam.far = 35;
  moonLight.shadow.bias = -0.001;
  scene.add(moonLight);
  scene.add(moonLight.target);
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(1.0, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0xdbe8ff,
      emissive: 0xbfd4ff,
      emissiveIntensity: 1.2,
      roughness: 0.4,
    }),
  );
  moon.position.set(-9, 34, -20);
  scene.add(moon);


  // Moon "rises" in: starts dark and small, then brightens and grows to
  // full size — reads as arriving alongside the diorama's own build-in
  // sequence rather than being lit from frame one.
  const MOON_FINAL_INTENSITY = 1.8;
  const MOON_RISE_START_OFFSET = 0.4;
  const MOON_RISE_DURATION = 2.0;
  moonLight.intensity = 0;
  moon.scale.setScalar(0.001);
  let moonRiseDone = false;

  const handle: BackdropHandle = {
    update(assembleClock) {
      if (moonRiseDone) return;
      const localT = (assembleClock - MOON_RISE_START_OFFSET) / MOON_RISE_DURATION;
      const t = Math.min(1, Math.max(0, localT));
      const eased = t * t * (3 - 2 * t); // smoothstep — gentle brighten/grow
      moonLight.intensity = MOON_FINAL_INTENSITY * eased;
      moon.scale.setScalar(Math.max(0.001, eased));
      if (t >= 1) moonRiseDone = true;
    },
    dispose() {
      scene.remove(ambientLight, hemisphereLight, keyLight, moonLight, moonLight.target, moon);
      moon.geometry.dispose();
      (moon.material as THREE.Material).dispose();
      scene.background = previousBackground;
    },
  };
  return handle;
};
