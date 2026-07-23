/**
 * Procedural book "page" text generator (Phase 3b interactive books). Zero
 * hand-written prose per title — instead each family has small pools of
 * templated opener/body/closer sentences (with occasional `{title}`
 * substitution) that get shuffled together per book. A book's title is
 * hashed into a seed so the same title always reads the same way within a
 * session (re-opening a book shows the same pages), without needing to
 * store 40 x N unique hand-written paragraphs.
 */
import type { BookFamily } from './bookTitles';

function hashStringToSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** Mulberry32 — small, fast, deterministic PRNG from a 32-bit seed. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWith<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

interface FamilyPhraseBank {
  openers: string[];
  body: string[];
  closers: string[];
}

const PHRASE_BANKS: Record<BookFamily, FamilyPhraseBank> = {
  welsh: {
    openers: [
      'Long before the lamps were lit, the old stories say {title} began with a single raven crossing the water.',
      'In the misty valleys where the sheep outnumber the people, they still whisper of {title}.',
      'The bard cleared his throat, tuned his harp, and began: this is the tale of {title}.',
    ],
    body: [
      'The ravens circled three times over the hill, which everyone agreed was either a very good omen or a very bad one.',
      'A mist rolled in from the sea, thick as wool, and in it walked someone who was not quite a stranger.',
      'The moon that night hung low and copper-coloured, and the old shepherd swore it winked at him.',
      'There was a harp in the hall that played itself when nobody was watching, and everybody pretended not to notice.',
      'The lake gave up its lady only on nights when the wind came from the west, and never twice to the same fool.',
      'Somewhere between the third hill and the fourth, the path stopped belonging to this world entirely.',
    ],
    closers: [
      'And that, more or less, is how it was told to me — though the harp may have embellished a verse or two.',
      'The ravens have not said whether the tale is finished, so perhaps it is safest to assume it is not.',
      'So ends this telling, until the next fireside asks for it again.',
    ],
  },
  alchemy: {
    openers: [
      'Page one of {title} begins, unhelpfully, with a diagram that looks suspiciously like a teapot.',
      'The author of {title} insists this recipe is perfectly safe, provided one does not breathe, taste, or look directly at it.',
      'Before attempting anything in {title}, the reader is advised to open a window. Several windows, in fact.',
    ],
    body: [
      'Combine the quicksilver with three drops of moonlight and stir gently, or the whole affair turns an alarming shade of green.',
      'The cauldron began to hum a tune nobody recognised, which is generally a sign to step back slowly.',
      'A pinch of stardust, a spoon of patience, and — this part is crucial — do not, under any circumstances, sneeze.',
      'The flask glowed faintly for exactly one week before deciding it was actually just a very fancy nightlight.',
      'Some say the Philosopher\'s Stone is a metaphor. The stew burning on the stove suggests otherwise.',
      'The formula calls for "one part wonder, two parts stubbornness," which explains a great deal about the author.',
    ],
    closers: [
      'In conclusion: it did not turn to gold, but it did make an excellent soup.',
      'The experiment was declared a qualified success, on the grounds that nothing exploded this time.',
      'Further study is required, mainly because nobody can remember what step four was supposed to do.',
    ],
  },
  homely: {
    openers: [
      'This chapter of {title} opens, as all the best ones do, with a kettle already on the boil.',
      'There is nothing {title} cannot fix with a cup of tea and a bit of common sense.',
      'Every cottage has one drawer full of string, candle stubs, and mystery keys — {title} is devoted entirely to that drawer.',
    ],
    body: [
      'The stubborn kettle whistled twice, sulked for a moment, and then finally agreed to boil like a reasonable appliance.',
      'A little moss on the doorstep is not untidiness, the book insists, it is simply the house settling in nicely.',
      'The lighthouse keeper wrote that the sea only ever asked one question, and it was always the same one.',
      'Nobody quite remembers who knitted the first charm into that jumper, but it has kept out the cold for three winters running.',
      'The gnome by the gate looked grumpier than usual, which the almanac says means rain by Tuesday.',
      'Tea leaves rarely lie, though they are occasionally quite rude about it.',
    ],
    closers: [
      'And with that, the kettle was put back on, because no chapter in this house ends without one more cup.',
      'The moral, as ever, was to be kind to gnomes and generous with biscuits.',
      'That was quite enough excitement for one evening; the fire was banked low, and all was well.',
    ],
  },
  childrens: {
    openers: [
      'Once upon a very cosy time, {title} begins with a great big yawn.',
      'Cwtch up close, because {title} is best read wrapped in a warm blanket.',
      'Under a soft, sleepy moon, the story of {title} starts with the gentlest little hush.',
    ],
    body: [
      'The little dragon puffed a tiny smoke ring, curled its tail around itself, and gave the smallest happy sigh.',
      'The stars came out one by one, like someone was very carefully turning on a thousand tiny lamps.',
      'A hedgehog trundled by, far too busy to stop, but not too busy for one quick hug.',
      'The waves said goodnight to the shore in the softest whoosh you ever did hear.',
      'Somewhere a puffin was practising her song, humming it over until it felt just right.',
      'The bluebells nodded together in the breeze, sharing a secret only flowers know.',
    ],
    closers: [
      'And with one more cwtch and one more yawn, everybody drifted off to sleep. Nos da.',
      'The moon pulled the clouds up like a blanket, and the story tucked itself in for the night.',
      'That is the whole tale — safe, warm, and ready for dreaming.',
    ],
  },
};

/** Generates `pageCount` short pages of family-flavoured filler text for a
 * given book title. Deterministic per title (same title -> same pages
 * within this build), always returns an even count so pages pair neatly
 * into left/right spreads. */
export function generateBookPages(title: string, family: BookFamily, pageCount = 6): string[] {
  const count = pageCount % 2 === 0 ? pageCount : pageCount + 1;
  const rand = mulberry32(hashStringToSeed(`${family}:${title}`));
  const bank = PHRASE_BANKS[family];
  const pages: string[] = [];
  for (let i = 0; i < count; i++) {
    const sentences: string[] = [];
    if (i === 0) {
      sentences.push(pickWith(rand, bank.openers).replace('{title}', title));
    }
    const bodyCount = i === 0 || i === count - 1 ? 2 : 3;
    for (let s = 0; s < bodyCount; s++) {
      sentences.push(pickWith(rand, bank.body));
    }
    if (i === count - 1) {
      sentences.push(pickWith(rand, bank.closers));
    }
    pages.push(sentences.join(' '));
  }
  return pages;
}
