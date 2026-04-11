'use strict';

// Mock fetch globally before requiring the module
const mockFetch = jest.fn();
global.fetch = mockFetch;

const { getEmbedding, embCache } = require('../db/embeddingService');

const FAKE_VECTOR = [0.1, 0.2, 0.3];

function mockNIMResponse(embeddings) {
  return {
    ok: true,
    json: () => Promise.resolve({
      data: embeddings.map((e, i) => ({ index: i, embedding: e }))
    })
  };
}

describe('getEmbedding() cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    embCache.clear();
    mockFetch.mockResolvedValue(mockNIMResponse([FAKE_VECTOR]));
  });

  test('first call → cache miss, hits NIM', async () => {
    const result = await getEmbedding('brake pad');

    expect(result).toEqual(FAKE_VECTOR);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(embCache.size).toBe(1);
  });

  test('second call with same query → cache hit, no NIM call', async () => {
    await getEmbedding('brake pad');
    mockFetch.mockClear();

    const result = await getEmbedding('brake pad');

    expect(result).toEqual(FAKE_VECTOR);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('array input cached as joined key', async () => {
    const vectors = [[0.1, 0.2], [0.3, 0.4]];
    mockFetch.mockResolvedValue(mockNIMResponse(vectors));

    const result1 = await getEmbedding(['brake pad', 'oil filter']);
    expect(result1).toEqual(vectors);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockClear();
    const result2 = await getEmbedding(['brake pad', 'oil filter']);
    expect(result2).toEqual(vectors);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('1001 unique queries → oldest entry evicted (LRU)', async () => {
    // Fill cache to 1000
    for (let i = 0; i < 1000; i++) {
      embCache.set(`query-${i}`, { value: [i], ts: Date.now() });
    }
    expect(embCache.size).toBe(1000);

    // Add one more via getEmbedding — should evict oldest
    await getEmbedding('new-query');

    expect(embCache.size).toBe(1000);
    // query-0 should be evicted (was the oldest / first inserted)
    expect(embCache.has('query-0')).toBe(false);
    // Cache key is normalized: 'new-query' → 'newquery'
    expect(embCache.has('newquery')).toBe(true);
  });

  test('expired entry → cache miss, re-fetched', async () => {
    // Seed with expired entry (2 hours ago)
    embCache.set('brake pad', { value: [9, 9, 9], ts: Date.now() - 2 * 60 * 60 * 1000 });

    const result = await getEmbedding('brake pad');

    expect(result).toEqual(FAKE_VECTOR);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
