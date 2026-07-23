/**
 * Registry of every backdrop preset documented in the 3.7 brainstorm.
 * Implemented presets (Phase 3.11's first pass) carry a `factory`; the
 * rest are documented-but-not-yet-built stubs so the future settings menu
 * (3.13) can list all ten and callers can detect "not implemented yet"
 * without a separate list to keep in sync.
 */
import { createMoonlitIsleBackdrop } from './moonlitIsle';
import { createSummerMeadowDayBackdrop } from './summerMeadowDay';
import { createCottageHearthNookBackdrop } from './cottageHearthNook';
import { createWelshNightStreetBackdrop } from './welshNightStreet';
import type { BackdropPreset } from './types';

export const DEFAULT_BACKDROP_ID = 'moonlitIsle';

export const backdropPresets: Record<string, BackdropPreset> = {
  moonlitIsle: {
    id: 'moonlitIsle',
    label: 'Moonlit Isle',
    description: 'Night, cool moonlight + warm bell-glow contrast, animated sea.',
    factory: createMoonlitIsleBackdrop,
  },
  summerMeadowDay: {
    id: 'summerMeadowDay',
    label: 'Summer Meadow Day',
    description: 'Pastel sky, soft sun key light, slow low-poly cloud billboards drifting.',
    factory: createSummerMeadowDayBackdrop,
  },
  cottageHearthNook: {
    id: 'cottageHearthNook',
    label: 'Cottage Hearth Nook',
    description: 'Dim warm interior, crackling hearth glow, timber-beam ceiling silhouette.',
    factory: createCottageHearthNookBackdrop,
  },
  welshNightStreet: {
    id: 'welshNightStreet',
    label: 'Welsh Night Street',
    description: "The concept art itself as the background behind the table, with a soft vignette/edge blur and a music-reactive glow.",
    factory: createWelshNightStreetBackdrop,
  },
  mistyHighlandMoor: {
    id: 'mistyHighlandMoor',
    label: 'Misty Highland Moor at Dawn',
    description: 'Cool grey-lavender fog bank, distant standing-stone silhouettes, soft rim light.',
  },
  starlitSeaVoyage: {
    id: 'starlitSeaVoyage',
    label: 'Starlit Sea Voyage',
    description: 'Ship-deck framing, gentle swell, lantern glow, faint aurora-like colour bands.',
  },
  autumnHarvestEvening: {
    id: 'autumnHarvestEvening',
    label: 'Autumn Harvest Evening',
    description: 'Amber/orange palette, falling-leaf particles, distant bonfire glow.',
  },
  snowboundWinterCabin: {
    id: 'snowboundWinterCabin',
    label: 'Snowbound Winter Cabin',
    description: 'Falling snow particles, cool moonlight vs. warm window-glow contrast.',
  },
  enchantedForestClearing: {
    id: 'enchantedForestClearing',
    label: 'Enchanted Forest Clearing',
    description: 'Firefly bloom-particles, deep green canopy silhouette, dappled light shafts.',
  },
  oldLibraryArchive: {
    id: 'oldLibraryArchive',
    label: 'Old Library Archive',
    description: 'Dust motes in a window light-shaft, tall bookshelf silhouettes.',
  },
  tidalCaveGrotto: {
    id: 'tidalCaveGrotto',
    label: 'Tidal Cave Grotto',
    description: 'Bioluminescent teal water glow, dripping stalactites, cool palette.',
  },
};

/** Maps a track manifest's `scene` id to its default backdrop preset id
 * (see `src/scenes/index.ts`'s `sceneFactories`). The future settings menu
 * (3.13) can override this per-session; this is just the "what loads by
 * default" mapping. */
export const sceneDefaultBackdrops: Record<string, string> = {
  bellsOfLyonesse: 'summerMeadowDay',
};

export type { BackdropHandle, BackdropFactory, BackdropPreset } from './types';
