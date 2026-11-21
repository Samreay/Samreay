import { books, seriesName } from '../books';

export default {
  id: 'manifestation',
  author: 'Samuel Hinton',
  series: seriesName,
  reviewId: 'soul_relic',
  books: books.map(({ name, volume }) => ({
    volume, title: name, cover: `manifestation/${volume}.webp`,
  })),
};
