/**
 * Shared type definitions for the Phase 8 reviews explorer and Phase 9
 * artists / tagged-list islands. Both render outside Astro's content layer
 * so they consume plain JSON-serialized payloads, not `CollectionEntry<>`s.
 */

export type ReviewTier = 'π' | 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface Post {
  name: string;
  link: string;
  abslink: string;
  author: string;
  review: ReviewTier;
  weight: number;
  /** ISO-8601 date string. */
  date: string;
  tags: string[];
  links: { name: string; link: string }[];
  sentence: string;
  description: string;
  /** Pre-lowercased "author name search_terms" for cheap substring matching. */
  search_term: string;
  /** Pre-resolved cover URL (already optimized to webp by `getImage`). */
  img: string;
  video?: string;
}
