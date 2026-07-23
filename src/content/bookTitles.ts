/**
 * Book title/cover content bank (Phase 3b, 3.6/3.10) — game-specific data
 * consumed by the generic `src/engine/bookStack.ts` generator. Titles are
 * split into four mixable families; each family has its own cover-styling
 * rules (colours + emblem set) matching the TODO.md brainstorm.
 */
import type { BookFamilyStyle, EmblemType } from '../engine/bookStack';

export type BookFamily = 'welsh' | 'alchemy' | 'homely' | 'childrens';

export interface BookTitleEntry {
  title: string;
  family: BookFamily;
}

export const BOOK_TITLE_BANK: BookTitleEntry[] = [
  // Welsh mythology (Mabinogion-flavoured)
  { title: 'The Mabinogion, Retold by Firelight', family: 'welsh' },
  { title: "Branwen's Ravens: A Study in Grief and Wings", family: 'welsh' },
  { title: 'Pwyll, Lord of Annwn (Abridged)', family: 'welsh' },
  { title: 'The Four Branches, Annotated by a Sleepy Monk', family: 'welsh' },
  { title: "Rhiannon's Birds: On Songs That Wake the Dead", family: 'welsh' },
  { title: 'Blodeuwedd: A Treatise on Flowers That Should Not Have Opinions', family: 'welsh' },
  { title: 'Bran the Blessed and His Very Large Problems', family: 'welsh' },
  { title: 'Culhwch and Olwen: A Very Long To-Do List', family: 'welsh' },
  { title: "The Lady of the Lake's Household Tips", family: 'welsh' },
  { title: 'Gwyn ap Nudd: Correspondence with the Otherworld', family: 'welsh' },

  // Alchemical / classical, punned cozy
  { title: "Aurum Vulgari: Or, Why My Cauldron Won't Stop Singing", family: 'alchemy' },
  { title: 'The Emerald Tablet (Coffee-Stained Edition)', family: 'alchemy' },
  { title: "Paracelsus's Kitchen Remedies", family: 'alchemy' },
  { title: 'On the Transmutation of Leftover Stew', family: 'alchemy' },
  { title: "The Alchemist's Guide to Not Exploding the Cottage", family: 'alchemy' },
  { title: "Nine Herbs Charm: A Gardener's Companion", family: 'alchemy' },
  { title: "The Philosopher's Stone Soup (Recipe Included)", family: 'alchemy' },
  { title: 'Hermetica for the Terminally Curious', family: 'alchemy' },
  { title: 'A Treatise on Quicksilver and Regret', family: 'alchemy' },
  { title: "The Compleat Distiller's Almanack", family: 'alchemy' },

  // Homely / quirky
  { title: '101 Uses for a Stubborn Kettle', family: 'homely' },
  { title: "The Hearth-Keeper's Yearbook", family: 'homely' },
  { title: 'Knitting Charms for Beginners (Some Side Effects)', family: 'homely' },
  { title: 'A Field Guide to Grumpy Garden Gnomes', family: 'homely' },
  { title: "The Innkeeper's Book of Small Miracles", family: 'homely' },
  { title: 'Turntable Maintenance for the Reluctantly Magical', family: 'homely' },
  { title: 'Moss, Mushrooms, and Other Polite Company', family: 'homely' },
  { title: "The Lonely Lighthouse Keeper's Diary", family: 'homely' },
  { title: "Tea Leaves Don't Lie (Usually)", family: 'homely' },
  { title: "A Sailor's Lament, Bound in Driftwood", family: 'homely' },

  // Children's books (cozy/cute)
  { title: "Draig Y Cwtsh: A Welsh Dragon's Cuddles", family: 'childrens' },
  { title: 'Stars and Seas', family: 'childrens' },
  { title: "The Sleepy Selkie's Bedtime", family: 'childrens' },
  { title: 'Cwtch Me If You Can', family: 'childrens' },
  { title: 'Bramble the Brave Little Sheepdog', family: 'childrens' },
  { title: "The Moon's Very Small Boat", family: 'childrens' },
  { title: 'Nos Da, Little Dragon', family: 'childrens' },
  { title: "A Hedgehog's Guide to Hugs", family: 'childrens' },
  { title: 'The Puffin Who Lost Her Song', family: 'childrens' },
  { title: 'Where the Bluebells Whisper', family: 'childrens' },
];

export type { EmblemType, BookFamilyStyle } from '../engine/bookStack';

export const BOOK_FAMILY_STYLES: Record<BookFamily, BookFamilyStyle> = {
  welsh: {
    coverColors: ['#1f4d3a', '#234634', '#1a4030'],
    accentColor: '#c9a227',
    emblems: ['raven', 'moon', 'harp'],
  },
  alchemy: {
    coverColors: ['#5c1f28', '#63232c', '#4d1a22'],
    accentColor: '#b5834a',
    emblems: ['flask', 'star'],
  },
  homely: {
    coverColors: ['#5a3d28', '#4d3320', '#6b4a30'],
    accentColor: '#e8d9b5',
    emblems: ['heart', 'wave', 'moon'],
  },
  childrens: {
    coverColors: ['#dd8296', '#84b3d6', '#eec457'],
    accentColor: '#ffffff',
    emblems: ['dragon', 'star', 'wave'],
  },
};
