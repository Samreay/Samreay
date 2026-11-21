import manifestation from './magnet-covers/manifestation';
import carlOriginal from './magnet-covers/carl-original';
import carlPrint from './magnet-covers/carl-print';
import warformed from './magnet-covers/warformed';
import wanderingInn from './magnet-covers/wandering-inn';
import wanderingInnSplit from './magnet-covers/wandering-inn-split';

interface CoverSet {
  id: string;
  series: string;
  author: string;
  edition?: string;
  /** Reuse the first volume's existing selection ID and review ranking, when available. */
  reviewId?: string;
  books: { volume: number; part?: number; title: string; author?: string; cover: string }[];
}

export const coverSets: CoverSet[] = [
  manifestation, carlOriginal, carlPrint, warformed, wanderingInn, wanderingInnSplit,
];
