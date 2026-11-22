import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stringify } from 'yaml';
import { loadMagnetCatalogue } from '../src/data/magnet-covers.ts';

function fixture() {
  return {
    series: 'Test series', author: 'Author', reviewId: 'series_review',
    editions: [{
      id: 'new-edition', idPrefix: 'saved_prefix', sources: { Publisher: 'https://example.org/books' },
      books: [
        { volume: 1, title: 'First', cover: 'edition/1.webp' },
        { volume: 2, title: 'Second', cover: 'edition/2.webp', rankedReviewId: 'second_review' },
      ],
    }],
  };
}

function catalogue(series) {
  return loadMagnetCatalogue({ 'test.yaml': stringify(series) },
    new Set(['edition/1.webp', 'edition/2.webp']), new Set(['series_review', 'second_review']));
}

test('legacy IDs, book-specific ranked reviews and inherited provenance', () => {
  const series = fixture();
  series.editions[0].books[1].sources = { Publisher: 'https://example.org/books/second' };
  const [first, second] = catalogue(series);
  assert.deepEqual([first.id, first.reviewId], ['saved_prefix-1', 'series_review']);
  assert.deepEqual([second.id, second.reviewId], ['second_review', 'second_review']);
  assert.deepEqual(second.sources, [['Publisher', 'https://example.org/books'], ['Publisher', 'https://example.org/books/second']]);
});

for (const [description, change, expected] of [
  ['misplaced edition field', s => { s.editions[0].omnibus = true; }, /editions.0.*omnibus/],
  ['unknown review', s => { s.reviewId = 'unknown'; }, /unknown review unknown/],
  ['duplicate selection ID', s => { s.editions[0].books[0].rankedReviewId = 'second_review'; }, /duplicate selection ID/],
  ['missing artwork', s => { s.editions[0].books[0].cover = 'edition/missing.webp'; }, /missing cover/],
  ['unregistered artwork', s => { s.editions[0].books.pop(); }, /Unregistered magnet cover/],
  ['duplicate cover', s => { s.editions[0].books[1].cover = 'edition/1.webp'; }, /duplicate cover path/],
  ['absent provenance', s => { delete s.editions[0].sources; }, /missing source URL/],
  ['invalid source URL', s => { s.editions[0].sources.Publisher = 'missing-url'; }, /sources.Publisher/],
]) {
  test('catalogue rejects ' + description, () => {
    const series = fixture();
    change(series);
    assert.throws(() => catalogue(series), expected);
  });
}
