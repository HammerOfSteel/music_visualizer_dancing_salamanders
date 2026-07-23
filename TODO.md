# Music Visualizer — TODO

Standalone browser music player. Central idea: a spinning voxel/subvoxel
diorama scene, unique per song, built by hand from that song's lyrics/mood,
sitting above a rotating turntable with a live audio-reactive visualizer and
synced lyrics. This file tracks phases → tasks → subtasks so work can proceed
without re-asking direction each session. Check items off as completed.

## Phase 0 — Research prototype (DONE)

- [x] Turntable + LP disc + plinth, tilted-camera composition
- [x] Hand-authored voxel diorama for "The Bells of Lyonesse" (island + bell
      tower), open on all sides so it reads while rotating
- [x] Bloom postprocessing (UnrealBloomPass) on the glowing bell
- [x] Live Web Audio FFT (`AnalyserNode`) → simple beat detector → pulse
      rings spawning at disc edge, traveling inward, fading
- [x] Time-synced lyrics overlay (fade in/out) from `lyrics.json`
- [x] Track header (title/artist/album) from `meta.json`
- [x] Play/pause transport
- [x] Repo relocated to its own subfolder (`music-visualizer/`) + own branch
      inside `bloom`, isolated from bloom's main app

## Phase 1 — Diorama visual depth pass: "The Bells of Lyonesse" (DONE)

Goal: make the centerpiece diorama actually reflect the song's lyrics, not
just its title, and add subvoxel-level detail so it reads as a rich scene,
not a blocky sketch.

Lyric ideas to draw from (see `public/music/lyrics.json`):
"Low beams of oak by a hearth fire's glow", "the salt Cornish tide",
"silent ghosts of the kingdom stir from their sleep", "the city of
Lyonesse, your mother's home", "down deep unto a sunless sea, dark and
bleak", "the moonlight falls across her dreaming face".

- [x] **1.1 Subvoxel detail pass** — add a smaller voxel size (half of the
      current 0.22 unit cubes) for fine details: bell-tower window slits,
      oak cross-beam accents at the tower's base, roof shingle lines
- [x] **1.2 Sunken ruins ring** — in the dark water band (`r > 4.5` on the
      island), add 5-8 small broken tower/wall clusters, partially
      submerged, pale ghostly blue-grey with a faint self-emissive tint so
      bloom just catches their edges (nods to "silent ghosts of the
      kingdom", "the city of Lyonesse... down deep unto a sunless sea")
- [x] **1.3 Moonlight** — add a cool blue-white light (directional or rim)
      plus a small emissive "moon" catching bloom high above the scene,
      distinct in color temperature from the warm hearth-bell glow (nods to
      "the moonlight falls across her dreaming face")
- [x] **1.4 Verify visually** — screenshot via Playwright at a few rotation
      angles, confirm ruins/moonlight read clearly and don't muddy the
      silhouette or wash out the bell's bloom
- [x] **1.5 Commit**

## Phase 2 — Transport controls

- [x] **2.1 Seek bar** — draggable progress bar synced to `audio.currentTime`
      / `audio.duration`, updates live during playback
- [x] **2.2 Volume control** — slider bound to `audio.volume`, with a
      speaker icon that switches muted/low/high based on level
- [x] **2.3 Elapsed/duration time display** — mm:ss text flanking the seek
      bar (elapsed left, total duration right — updates live via
      `loadedmetadata`/`timeupdate`)
- [x] **2.4 Verify + commit** — redesigned the old top-left text play
      button into a pill-shaped floating transport bar (bottom-center,
      glass/blur panel matching the header's purple theme) housing a
      round play/pause icon button, elapsed time, seek bar, duration, and
      volume icon+slider; verified via Playwright (play/pause, live time
      update, programmatic seek jumps the scene's synced lyrics correctly)

## Phase 3 — Multi-track architecture

- [x] **3.1 Track manifest** — `public/music/tracks.json` listing available
      tracks (id, folder, meta). DONE: added the manifest
      (`{id, folder, audioFile, scene}`) and moved `meta.json`/`lyrics.json`/
      the mp3 into `public/music/bells-of-lyonesse/`. `src/engine/tracks.ts`
      fetches the manifest plus every track's `meta.json` up front (so the
      track menu can show real titles) and resolves per-track audio/lyrics
      URLs.
- [x] **3.2 Per-track diorama modules** — refactor the single hand-authored
      diorama into a swappable `scene.config`-style module so each new
      track gets its own diorama file without touching shared code
      (turntable, pulse rings, lyrics overlay, bloom stay shared). DONE:
      extracted the entire ~500-line hand-authored diorama (voxel terrain,
      animated sea shader, bell + hearth light, ambient/hemisphere/key
      lights, fixed moon) out of `main.ts` into
      `src/scenes/bellsOfLyonesse.ts`, exporting a factory
      `createBellsOfLyonesseScene(scene, dioramaGroup)` that returns a
      `DioramaSceneHandle` (`update(assembleClock, dt, audioLevel)` +
      `dispose()`), per the shared contract in `src/scenes/types.ts`.
      Registered in `src/scenes/index.ts`'s `sceneFactories` map, keyed by
      the manifest's `scene` id. `main.ts` now only owns the shared stage
      (turntable base, empty `dioramaGroup`, pulse rings, audio graph,
      bloom composer) and delegates all per-song animation to
      `currentScene.update(...)` each frame. Ambient/hemisphere/key/moon
      lighting currently lives inside the per-song scene module as a
      transitional simplification — Phase 3b's background-variety system
      will pull lighting into its own swappable preset layer later.
- [x] **3.3 Track menu UI** — simple list/selector to switch tracks,
      tears down old diorama + audio graph, loads the new one. DONE: added
      a `☰` button in the transport bar opening a small glass-panel dropdown
      (`#trackMenu`) listing every track's title/artist (highlighting the
      active one); clicking an entry calls `loadTrack(index)`.
- [x] **3.4 Next/prev controls** — DONE: `⏮`/`⏭` buttons in the transport
      bar wrap-around through the tracks array via `loadTrack()`.
- [x] **3.5 Verify + commit** — `tsc --noEmit` clean; verified via Playwright:
      initial load (voxel diorama/audio/lyrics/header all working), track
      menu open/select, and the next/prev teardown-rebuild cycle (scene
      disposes cleanly via `disposeGroupChildren` + `currentScene.dispose()`,
      turntable-base + diorama build-in animation replays correctly, audio
      keeps playing through the swap). Found + fixed a real bug during
      verification: `createObjectAssembleAnimation` captures an object's
      *current* scale as its "settled" target, so re-triggering the
      turntable-base drop-in animation on track load (after the async
      manifest fetch) was capturing a mid-animation, partially-scaled value
      and permanently shrinking the turntable — fixed by resetting
      `turntableBaseGroup.scale`/`position` to identity before re-creating
      its assemble animation in `loadTrack()` (see repo memory for the
      general gotcha). No git repo exists for this project yet (see repo
      memory), so "commit" is skipped.

### Phase 3b — Cozy scene dressing: table, books, prop & background variety

Goal: the turntable currently floats in a void. Ground it on a proper
tabletop scene with hand-authored/procedural clutter (books, trinkets) that
varies per load, and let the backdrop itself vary per-song/randomize
instead of always being the night-island diorama — building a content bank
now so future songs' dioramas can each pick a fitting backdrop + book set
rather than reusing one look. Settings menu lets a listener browse/lock in
a look instead of only getting whatever loads.

- [x] **3.6 Brainstorm: book title/cover content bank** — a reusable pool
      of procedurally-assignable book spines/covers for the tabletop stack,
      split into three fitting families (mixable in the same stack):

      **Welsh mythology (Mabinogion-flavoured)**
      - "The Mabinogion, Retold by Firelight"
      - "Branwen's Ravens: A Study in Grief and Wings"
      - "Pwyll, Lord of Annwn (Abridged)"
      - "The Four Branches, Annotated by a Sleepy Monk"
      - "Rhiannon's Birds: On Songs That Wake the Dead"
      - "Blodeuwedd: A Treatise on Flowers That Should Not Have Opinions"
      - "Bran the Blessed and His Very Large Problems"
      - "Culhwch and Olwen: A Very Long To-Do List"
      - "The Lady of the Lake's Household Tips"
      - "Gwyn ap Nudd: Correspondence with the Otherworld"

      **Alchemical / classical, punned cozy**
      - "Aurum Vulgari: Or, Why My Cauldron Won't Stop Singing"
      - "The Emerald Tablet (Coffee-Stained Edition)"
      - "Paracelsus's Kitchen Remedies"
      - "On the Transmutation of Leftover Stew"
      - "The Alchemist's Guide to Not Exploding the Cottage"
      - "Nine Herbs Charm: A Gardener's Companion"
      - "The Philosopher's Stone Soup (Recipe Included)"
      - "Hermetica for the Terminally Curious"
      - "A Treatise on Quicksilver and Regret"
      - "The Compleat Distiller's Almanack"

      **Homely / quirky**
      - "101 Uses for a Stubborn Kettle"
      - "The Hearth-Keeper's Yearbook"
      - "Knitting Charms for Beginners (Some Side Effects)"
      - "A Field Guide to Grumpy Garden Gnomes"
      - "The Innkeeper's Book of Small Miracles"
      - "Turntable Maintenance for the Reluctantly Magical"
      - "Moss, Mushrooms, and Other Polite Company"
      - "The Lonely Lighthouse Keeper's Diary"
      - "Tea Leaves Don't Lie (Usually)"
      - "A Sailor's Lament, Bound in Driftwood"

      **Children's books (cozy/cute)**
      - "Draig Y Cwtsh: A Welsh Dragon's Cuddles"
      - "Stars and Seas"
      - "The Sleepy Selkie's Bedtime"
      - "Cwtch Me If You Can"
      - "Bramble the Brave Little Sheepdog"
      - "The Moon's Very Small Boat"
      - "Nos Da, Little Dragon"
      - "A Hedgehog's Guide to Hugs"
      - "The Puffin Who Lost Her Song"
      - "Where the Bluebells Whisper"

      Cover styling per family (procedural, not hand-drawn art): leather/
      cloth-bound base colour + a small embossed emblem (raven, moon,
      flask, dragon, harp) + foil title band — myth = deep green/gold,
      alchemy = maroon/brass, homely = warm brown/cream, children's =
      bright pastel cloth (rose/sky-blue/butter-yellow) with a simple
      rounded-emblem woodcut style (dragon curled in a cwtch, star, wave)
      and a friendly rounded typeface band. List should keep growing as
      new song lyrics suggest more entries.

- [x] **3.7 Brainstorm: background/backdrop variety concepts** — swappable
      environment presets (lighting + sky/particles + palette), each its
      own lightweight module reusing the shared bloom/shadow pipeline so a
      diorama can be dropped into any of them:
      1. **Moonlit isle** (current) — night, cool moonlight + warm
         bell-glow contrast, animated sea
      2. **Summer meadow day** — pastel sky, soft sun key light, slow
         low-poly cloud billboards drifting, warm grass/meadow palette
      3. **Cottage hearth nook** — dim warm interior, crackling hearth
         glow (ember particles), timber-beam ceiling silhouette, optional
         rain-streaked window
      4. **Misty highland moor at dawn** — cool grey-lavender fog bank,
         distant standing-stone silhouettes, soft rim light
      5. **Starlit sea voyage** — ship-deck framing, gentle swell, lantern
         glow, faint aurora-like colour bands
      6. **Autumn harvest evening** — amber/orange palette, falling-leaf
         particles, distant bonfire glow
      7. **Snowbound winter cabin** — falling snow particles, cool
         moonlight vs. warm window-glow contrast
      8. **Enchanted forest clearing** — firefly bloom-particles, deep
         green canopy silhouette, dappled light shafts
      9. **Old library archive** — dust motes in a window light-shaft,
         tall bookshelf silhouettes
      10. **Tidal cave grotto** — bioluminescent teal water glow, dripping
          stalactites, cool palette
      Each song's diorama config (Phase 3.2) picks one of these as its
      default backdrop; the settings menu (3.13) can override/randomize.

- [x] **3.8 Brainstorm: tabletop prop inventory** — small procedural/
      simple-geometry clutter items that can scatter around the record
      player besides the book stack, picked a few at a time per load:
      - Brass telescope + small compass
      - Teacup and saucer with a shader steam wisp
      - Lit candle in a tarnished holder (flicker point light)
      - Potted fern / small moss terrarium
      - Pocket watch with draped chain
      - Inkwell + quill
      - Small dragon-shaped paperweight
      - Seashell cluster / driftwood piece
      - Folded reading glasses
      - Half-unrolled parchment/map with a wax seal
      - Small jar of glowing "fireflies" (bloom particles)
      - Worn tarot card or two, fanned at a corner
      - Dried flower sprig used as a bookmark, poking from a book
      - Small brass gear/cog trinket (nods to the alchemy shelf)
      - Mug of tea/mulled cider with steam

- [x] **3.9 Procedural table build** — low-poly round or rectangular wood
      table the turntable rests on, procedural plank/wood-grain texture
      (noise-based grain + knots + per-plank colour variance, no external
      texture files), worn/scuffed edge highlighting; optional woven
      doily/runner under the turntable base. DONE: added
      `src/engine/proceduralTexture.ts` (`createWoodGrainTexture` +
      `createWovenRunnerTexture`, both pure canvas-drawing, no image
      assets) and a static table (rounded-rectangle tabletop via a custom
      `createRoundedSlabGeometry` extrude helper + 4 tapered-cylinder legs
      + a woven runner disc) added directly to `scene` in `main.ts` (not
      `turntableGroup`, so it stays fixed while the turntable spins above
      it), positioned flush under the plinth, sized wide-and-shallow with
      the turntable/runner comfortably inset from every edge. Iterated
      per user feedback: fixed an initial scale bug (table smaller than
      the runner), reshaped from square to wide/shallow rectangular,
      rounded the tabletop's corners (faceted, low `curveSegments`, not
      smooth) for a hand-built look, and reworked the wood-grain algorithm
      from streak-lines to a per-pixel sine-based "wood rings" pattern
      with quantized colour banding (learned from a user-supplied
      reference POC at `POCs/wood-teturesfor_table_and_low_poly_fire.html`
      — also added `flatShading: true` to the table/leg materials per
      that POC's low-poly recommendation). Verified via Playwright
      screenshots after each iteration.
- [x] **3.10 Procedural book stack generator** — picks 2-5 entries from the
      3.6 content bank per load (mixable across families), generates each
      cover procedurally (base colour + emblem + title band drawn to a
      canvas texture, per 3.6 styling rules), stacks them with slight
      position/rotation jitter so it reads as a believable messy pile,
      not a neat catalog. DONE: split into `src/content/bookTitles.ts`
      (game-specific data — the full 3.6 title list + per-family
      `BOOK_FAMILY_STYLES`: cover colours, accent/foil colour, candidate
      emblems) and `src/engine/bookStack.ts` (generic engine module, no
      book-specific imports — draws a canvas cover texture per book with a
      hand-drawn emblem silhouette (moon/star/flask/harp/raven/dragon/
      wave/heart) + a foil title band with wrapped text, then
      `createBookStack()` picks N random non-repeating titles and stacks
      them as jittered `THREE.Mesh` boxes; `createBookStand()` instead
      arranges books standing upright side by side on a small wooden
      plinth+ledge, front covers facing forward, for legible close-up
      display). Wired into `main.ts` using `createBookStand()`: two small
      stands placed near the front corners of the table (closer to the
      camera than the turntable, `z≈3.0-3.4`) and angled inward
      (`rotationY` ±0.35) so the title art and text are actually readable
      on screen — replaced an earlier flat lying-down-pile version per
      feedback that titles were unreadable from the default camera angle.
      Verified via Playwright screenshot.
      FIX: first cut of `createBookStand()` spaced neighbouring books by
      their thin spine `depth` (~0.2) instead of their much wider front
      `width` (~0.85-1.05), so the wide cover faces overlapped/clipped
      into each other — titles were unreadable. Fixed by spacing along X
      using `dims.width + gap` (and summing widths for the plinth size),
      shrunk book dimensions slightly for a more compact row, and dropped
      the small per-book Y-rotation jitter (it re-introduced clipping at
      this tight spacing). Re-verified via Playwright screenshot — all
      six displayed titles are now fully legible with no overlap.
- [x] **3.10b Interactive book reader** — click any book in a table pile
      to pick it up, hold it up in front of the (static) camera with a
      gentle bob, open it to a two-page procedurally-written spread
      (`src/content/bookPages.ts`, keyed by title/family), click a page
      to flip forward/back with a curling page-turn animation, press
      `Escape` (or click elsewhere) to close and put it back down in its
      original table slot. DONE: added `src/engine/bookReader.ts` (generic
      engine module — pickup/open/flip/putdown state machine, zero opinion
      on page content) wired into `main.ts` alongside the two
      `createBookStack()` piles via `createBookReaderSystem({ scene,
      camera, domElement, stackGroups, getPages })`, ticked each frame via
      `bookReader.update(dt)`. Fixed two bugs found via Playwright
      screenshot verification: (1) page-flip only updated the *visible*
      static page's texture on the far side of the turn, never the
      near/under page, causing content desync after a flip — fixed by
      having `finishFlip()` also re-texture the page revealed under the
      just-finished flip leaf; (2) flip rotation direction swept the page
      away from the camera instead of toward it — fixed by removing an
      erroneous sign negation on the pivot's Z-rotation angle.
      Also hit and fixed a genuine linear-algebra bug in the held-book
      orientation (`computeHeldQuaternion`): building a camera-facing
      basis via `Matrix4.makeBasis(right, back, up)` (camera's own right/
      back/up axes reordered) has determinant -1 — an improper reflection,
      not a rotation — which `setFromRotationMatrix` silently turned into
      a degenerate quaternion, making the held book render lying flat
      (cover facing world-up) instead of facing the camera. Root-caused by
      writing a standalone `node -e` script against the project's actual
      `three` package to compute the basis, print its determinant, and map
      sample local points to world space — confirmed via that script (not
      just screenshots) before touching the render. Fixed by using `down`
      (negated camera-up) as the third basis vector instead of `up`,
      restoring determinant +1 while keeping width→screen-right and
      length→screen-up unmirrored. Verified end-to-end via Playwright:
      pickup, open, flip forward, flip backward, and putdown (book returns
      to its exact table position/rotation, scene fully resets) all work
      with no visible regressions.
- [x] **3.11 Background variety system** — new `src/backdrops/` module:
      `types.ts` defines the `BackdropHandle` (`update(assembleClock, dt,
      audioLevel)` / `dispose()`) and `BackdropFactory` (`(scene) =>
      BackdropHandle`) contract, deliberately parallel to but separate
      from `DioramaSceneHandle`/`SceneFactory` (`src/scenes/types.ts`) —
      a backdrop owns the surrounding "world" (sky/background colour,
      ambient/hemisphere/key lighting, fixed-in-world-space set dressing)
      added directly to `scene`, while a diorama scene owns the per-song
      voxel content added to `dioramaGroup`; the two are composed
      independently per track load rather than one owning the other, so
      a future settings menu (3.13) can eventually swap either
      independently.
      - Extracted the existing "moonlit isle" lighting recipe (ambient +
        hemisphere + key + shadow-casting moon light with its "rises in"
        build animation) verbatim out of `src/scenes/bellsOfLyonesse.ts`
        into `src/backdrops/moonlitIsle.ts`; that scene module no longer
        adds any lighting of its own (removed the now-dead lighting
        block + its `dispose()` cleanup) — verified via Playwright
        screenshot that the diorama renders pixel-identically after the
        extraction.
      - Implemented `summerMeadowDay.ts`: pastel sky (`scene.background`),
        soft warm sun key light + bright ambient/hemisphere fill, and 6
        low-poly cloud "billboards" (jittered icosahedron clusters) that
        fade/scale in on load and drift slowly across the sky, wrapping
        around. Hit and fixed a real bug here: an initial bright pastel
        sky colour (`0xbfe3ff`, luma ≈0.86) blew the *entire* background
        out to white through `UnrealBloomPass` (threshold 0.65 treats
        `scene.background` as part of the lit scene) — fixed by picking
        a sky colour under the bloom threshold (`0x5f8fc2`, luma ≈0.52)
        and trimming ambient/hemisphere intensity to match; confirmed via
        screenshot that the sky, table, and diorama are all clearly
        readable now.
      - Implemented `cottageHearthNook.ts`: dim warm ambient/hemisphere,
        a flickering hearth `PointLight` (layered sine + jitter for a
        crackling feel) with a small emissive ember-bed mesh as its
        visible source, a handful of timber-beam silhouette boxes
        overhead, and a looping ember-particle `Points` system that
        drifts upward from the hearth and recycles. Rain-streaked window
        from the 3.7 brainstorm intentionally deferred — out of scope for
        this first pass, noted in the module's own doc comment.
      - `src/backdrops/index.ts` registers all 10 of 3.7's presets in one
        `backdropPresets` map: the 3 implemented ones above carry a
        `factory`, the remaining 7 (misty highland moor, starlit sea
        voyage, autumn harvest evening, snowbound winter cabin, enchanted
        forest clearing, old library archive, tidal cave grotto) are
        documented stub entries (id/label/description only, no factory)
        so the future settings menu can list all ten and detect
        "not implemented yet" without a separate list to keep in sync.
        Also exports `sceneDefaultBackdrops` (currently just
        `bellsOfLyonesse: 'moonlitIsle'`) mapping a track's `scene` id to
        its default backdrop, and a `DEFAULT_BACKDROP_ID` fallback.
      - Wired into `main.ts`: `loadTrack()` now disposes/creates a
        `currentBackdrop` alongside `currentScene` (backdrop first, using
        the scene's `sceneDefaultBackdrops` entry, falling back to
        `moonlitIsle` for any unmapped/stub id), and `animate()` ticks
        `currentBackdrop.update(assembleClock, dt, smoothedAudioLevel)`
        every frame alongside the existing scene update. Verified all 3
        implemented presets end-to-end via Playwright screenshots
        (temporarily overriding `sceneDefaultBackdrops` to preview each
        one, then reverting to `moonlitIsle`) and confirmed a clean
        `tsc --noEmit && vite build`.
- [x] **3.12 Tabletop prop variety** — implement a first pass of ~5-6 props
      from the 3.8 inventory as simple procedural meshes, randomly
      scatter 2-4 per load around the table's edges
      - New `src/engine/tabletopProps.ts` (pure engine module, no
        song/scene imports): 4 procedural props built from primitives —
        brass telescope, teacup with a continuous steam-wisp rig, candle
        in a tarnished holder with a flickering `PointLight` (same
        layered sine+jitter recipe as the hearth light in
        `cottageHearthNook.ts`), and a potted fern (compound arching
        fronds built segment-by-segment with paired leaflets, not just
        cones). `createTabletopProps(surfaceY)` randomly picks 2-4 of the
        4 each load and returns a group + `update(dt, elapsed)`.
      - Wired into `main.ts`: instantiated right after the book stacks
        and added to `tableGroup`; `animate()` ticks
        `tabletopProps.update(dt, assembleClock)` alongside the other
        per-frame updates.
      - Anchor slots are fixed points in `tableGroup` local space, kept
        clear of the woven runner (radius 4.0) and the two book stacks.
        First-pass slot placement put 3 of 6 slots off-screen (verified
        by projecting each slot's world position through the fixed
        camera — they landed at ~106-110% screen height, below the
        visible viewport) and all props read far too small; fixed by
        re-deriving slots to stay within the camera's visible range (z
        roughly `[-4.2, 2.0]`) and applying a uniform 2.2x scale to every
        prop.
      - User feedback pass: dropped the pocket watch and firefly jar
        (kept telescope/teacup/candle/fern only), removed the telescope's
        compass accessory, fixed a z-fighting "glitching earth" flicker
        in the fern's pot (soil disc and rim lip were coincident with the
        pot's top cap face — reworked the three surfaces to sit in
        distinct, non-overlapping y-planes), moved the teacup's slot off
        of an overlap with `bookStackOne`, and replaced the teacup's
        synchronized-recycle steam particles (which all reset/popped
        together, reading as a single obvious loop) with a per-particle
        independent rise-cycle (randomized length + phase offset per
        particle) that fades in/out via a custom vertex-alpha shader, so
        recycling is continuous and invisible. Verified via Playwright
        screenshots (including a temporary force-all debug pass) that
        every remaining prop renders on-screen, well-separated, with
        working candle flicker/steam animations, before reverting to the
        random 2-4 scatter and confirming a clean `get_errors`.
- [x] **3.13 Settings menu** — small circular gear-icon button tucked in a
      screen corner; click unfolds a hamburger-style panel (glass/blur,
      purple-accent theme matching the transport bar/header) with:
      background picker (list of 3.11's implemented presets +
      "Randomize"), book-set reroll button, prop reroll button
      - The gear button + panel + "Background Scene" picker list were
        already built in an earlier pass; this pass added the remaining
        pieces: a "🎲 Randomize background" button (picks a random
        *implemented* preset, excluding the current one when more than
        one is available) and a new "Tabletop" section with "🔀 Reroll
        book stacks" and "🔀 Reroll tabletop props" buttons.
      - Book-stack reroll keeps `bookStackOne`/`bookStackTwo`'s `THREE.
        Group` object identity (disposes old book meshes' geometry/
        materials, then re-populates the same group with a fresh
        `createBookStack()` pick) so `bookReader`'s `stackGroups`
        references don't need to be re-wired. Prop reroll replaces the
        whole `tabletopProps` handle/group (its flicker/steam rigs live
        in the closure `update()` captures, so the handle itself needs
        rebuilding, not just its children).
      - Verified live via Playwright: opened the settings menu, clicked
        each new button in sequence (props reroll → books reroll →
        randomize background) without a page reload, confirmed the menu
        stays open between reroll clicks (repeatable actions) while
        background selection still closes it (a "pick and go" action),
        and confirmed a clean `get_errors` + `tsc --noEmit && vite build`.
- [x] **3.14 Wire settings to scene** — selecting a background/reroll
      swaps the live scene (either immediately with a light transition,
      or applied on next track load — decide once 3.11-3.13 are in)
      - All three settings actions (background pick, background
        randomize, book/prop reroll) apply immediately in place against
        the still-running scene — no track reload or transition needed,
        since `applyBackdrop()` and the reroll functions just swap
        Three.js content directly.
- [x] **3.15 Verify + commit** — clean `tsc --noEmit && vite build`, all of
      Phase 3b verified live via Playwright across this session's rounds
      (table/books/props/backdrops/reroll/randomize), committed and pushed
      to `origin/music-visualizer` (`22cbfb9`, `f69a5cd`).

## Phase 4 — Polish

- [x] **4.0 Track header typography pass** — split the combined
      album/artist line into three distinct elements with a real type
      hierarchy: title largest (Cormorant Garamond italic, ~34px), album
      beneath it a bit smaller (same serif, ~16px), artist smallest
      (Inter, uppercase, letter-spaced, ~11px), separated by a thin
      gradient divider under the title, with a subtle fade-in on load
- [x] **4.1 Responsive layout** — verify at a few common viewport sizes
      - Found and fixed a real bug: `index.html` had no
        `<meta name="viewport">` tag at all, so mobile browsers would
        render the page at their ~980px default virtual viewport and
        require pinch-zoom rather than sizing to the actual device
        width. Added `width=device-width, initial-scale=1,
        maximum-scale=1`.
      - `src/main.ts`'s existing `onResize()` (recomputes
        `camera.aspect`, `renderer.setSize`, `composer.setSize` from
        `window.innerWidth/innerHeight` on every `resize` event) was
        already correct for the 3D layer — confirmed via code review,
        no changes needed there.
      - For the DOM/CSS overlay layer: added `clamp()`-based responsive
        sizing to `#trackHeader`'s title/album/artist font sizes (was
        fixed 34/16/11px, could crowd/overflow a narrow phone width)
        plus a `max-width: 92vw` cap; widened the transport bar's
        shrink allowance (`min(520px, 86vw)` → `92vw`); added two
        breakpoints (`max-width: 480px` tightens transport bar
        gaps/padding, shrinks the time labels/volume slider, and caps
        the lyrics overlay/menus to `88vw`; `max-width: 360px` hides
        the volume slider entirely to keep the transport bar from
        overflowing on very narrow phones). The seek bar already had
        `flex: 1 1 auto; min-width: 0`, so it correctly absorbs
        remaining space rather than overflowing.
      - Verification note: this sandbox's shared/attached browser tab
        is pinned to one real OS window size — `page.setViewportSize()`
        and CDP `Emulation.setDeviceMetricsOverride` don't reliably
        re-render multiple breakpoints in this environment (confirmed
        via `window.innerWidth`/canvas-size probes; CDP overrides also
        left the screenshot pipeline capturing stale/partial frames
        after repeated overrides — a tooling artifact, not an app bug,
        resolved by clearing the override and reloading). Verified the
        real-size render is unaffected by these changes (`screenshot_page`
        after a plain reload matches the pre-change layout pixel-for-
        pixel in composition) and confirmed the CSS/meta changes via
        code review + a clean `tsc --noEmit && vite build`, rather than
        live screenshots at every breakpoint.
- [x] **4.2 Loading state** — while meta/lyrics/audio are fetching
      - Added `#loadingOverlay` (full-screen glass-dark panel, spinner +
        "Loading…" text, matching the app's purple/dark theme) shown by
        default in `index.html`, hidden via a `.hidden` class (opacity
        fade) in `main.ts` once the initial `loadTracks()` → `loadTrack(0)`
        chain resolves. Also wired a `.catch()` on that chain so a failed
        fetch swaps the text to an error message instead of spinning
        forever. Verified via Playwright: the overlay is present
        (unhidden) immediately after reload, and gets the `hidden` class
        (opacity 0) once the first track finishes loading — on this local
        dev server the fetches resolve in well under 100ms, so the fade is
        brief but confirmed correct via DOM class/computed-style checks
        rather than trying to catch the exact visual mid-fade frame.
        Scoped to initial page load only (not per-track-switch), matching
        the TODO wording and the already-verified smooth track-switch UX
        from Phase 3.5/3.14.
- [x] **4.3 Basic automated checks** — at minimum keep `tsc --noEmit` clean;
      consider a small Vitest suite for pure logic (`engine/audio.ts`,
      `engine/lyrics.ts`) if not already covered
      - Added `vitest` as a dev dependency and `npm test`/`npm run
        test:watch` scripts. Wrote `src/engine/audio.test.ts` (19 total
        tests across both files) covering `overallAmplitude` (empty/
        silent/full-scale/mixed buffers), `bandEnergy` (even/uneven
        bucket splits, empty buffer), and `BeatDetector` (no false
        positive before a running average forms, fires on a real spike,
        respects its cooldown); and `src/engine/lyrics.test.ts` covering
        `activeLyricLine` (in-range, gaps, before/after, inclusive
        boundaries) and `fadeProgress` (boundary values, fully-faded-in
        middle, linear fade-in/out ramps, clamped to ≤1). All 19 tests
        pass; `tsc --noEmit && vite build` still clean (test files aren't
        pulled into the app bundle since nothing imports them from
        `main.ts`).

## Phase 5 — "Welsh Night Street" backdrop

Goal: a new swappable backdrop preset (`welshNightStreet`, alongside
`moonlitIsle`/`summerMeadowDay`/`cottageHearthNook` — **not** replacing
`moonlitIsle` as the default) depicting a night-time South Welsh terraced
street, matching a concept-art reference exactly.

**Revised approach (2026-07-23)**: the original plan below (a hand-built
procedural 3D scene: terraced houses, moon, hills, animated fox, etc.)
was implemented as a first pass but repeatedly failed to match the
concept art's actual perspective/composition, and a follow-up rendering
bug (scene reporting all-correct geometry/camera state yet rendering
solid black, root cause never found) made it clear this route wasn't
worth continuing. Scrapped entirely per direction, in favour of a much
simpler solution that guarantees a perfect match: the user's own concept
art was turned into a loopable video
(`public/video/welsh-night-street-bg-loop.mp4`), and `welshNightStreet.ts`
now just plays that video as a `THREE.VideoTexture` assigned directly to
`scene.background` (plus a simple ambient/hemisphere/key light fill so the
table/diorama in front still reads). Like every other backdrop's solid
`THREE.Color` sky, a 2D texture background is camera-orientation-
independent — it doesn't pan/rotate with `OrbitControls` — so no camera
changes were needed anywhere in `main.ts`.

Implemented:
- [x] **5.1 Scaffold module** — `src/backdrops/welshNightStreet.ts`
      implements `BackdropFactory`/`BackdropHandle`; registered in
      `src/backdrops/index.ts`'s `backdropPresets` map.
- [x] **5.2 Video background** — a hidden (but real, in-viewport, non-
      zero-opacity) `<video>` element loops
      `/video/welsh-night-street-bg-loop.mp4`, muted/autoplay/playsInline,
      feeding a `THREE.VideoTexture` set as `scene.background`. Autoplay
      is retried on the first pointer/keyboard interaction as a fallback
      for browsers that block muted-video autoplay. (Note: a
      Chromium "video-only background media was paused to save power"
      autoplay block was seen while testing via Playwright — traced to
      the automated tab reporting `document.visibilityState === 'hidden'`,
      i.e. a testing-environment artifact from the browser window not
      being focused/visible to the OS, not an issue for real focused
      tabs.)
- [x] **5.3 Lighting pass** — modest cool ambient/hemisphere/key fill
      (same recipe pattern as `moonlitIsle.ts`) so the tabletop diorama
      still has visible shape in front of the video.
- [x] **5.4 Verify build** — `tsc --noEmit && vite build` clean.
- [ ] **5.5 Commit**

Abandoned/superseded plan (kept only for historical record — **do not
implement**, the video-background approach above is final):

<details>
<summary>Original procedural-3D plan (scrapped)</summary>

Brainstormed from a concept-art reference (aerial-ish view over a curving
Welsh terraced street: warm-lit windows, black slate roofs, chimneys,
streetlamps, a fox mid-stride on the road, low-poly faceted clouds, a
large moon, stars, distant hills, and a lake/bay with a distant lit town
— the lake/bay excluded per direction below). Design approved
2026-07-23, then abandoned the same day after repeated perspective
mismatches and an unresolved black-screen rendering bug.

Decisions that had been locked in during brainstorming:
- Additional preset, not default — `moonlitIsle` stays the app's default.
- No water anywhere — hills close off the background instead.
- Hills + faint distant lights for depth.
- Street runs diagonally, entering from a front corner and receding
  toward the hills.
- Moon/moonlight reuses `moonlitIsle`'s recipe.
- Fox gets a proper 4-leg trot-cycle gait, not simple bobbing.

Layer breakdown that had been planned (L0 sky/moon/clouds, L1 hills +
distant lights, L2 street/lamps/walls, L3 terraced houses, L4 foreground
hedges, L5 fox with trot-cycle animation, L6 lighting integration) and
the corresponding task list (scaffold, sky/moon/clouds, hills, street,
houses, hedges, fox, lighting, visual verification, commit) were never
completed past an initial blockout that didn't match the reference image
and then hit the unexplained black-screen bug — none of it should be
revisited; the video-background implementation above fully replaces it.

</details>

## Notes

- This project intentionally forked techniques from Bloom's main app but
  has no ongoing code dependency on it, and is never merged into bloom's
  main branch/app.
- No subagent-driven-development for this project — work executed directly,
  in this session, task by task.

