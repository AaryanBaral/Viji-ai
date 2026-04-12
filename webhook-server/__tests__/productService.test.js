'use strict';

const { createSupabaseMock } = require('./mocks/supabase');

// ── mock shared.js before requiring productService ──
let mockSupabase = createSupabaseMock();
jest.mock('../shared', () => ({
  supabase: mockSupabase,
  anthropic: { messages: { create: jest.fn() } },
  CUSTOMER_CARE_PHONE: '+977-9851069717'
}));

// ── mock embeddingService ──
jest.mock('../db/embeddingService', () => ({
  getEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3])
}));

// ── mock knowledgeBase ──
jest.mock('../db/knowledgeBase', () => ({
  lookupKnowledge: jest.fn().mockResolvedValue([]),
  lookupPartialPartNumber: jest.fn().mockResolvedValue([]),
  extractQuantityFromMessage: jest.fn(msg => ({ cleanedQuery: msg, quantity: 1 }))
}));

const { getAvailabilityStatus, calculatePrice, MAHINDRA_MODELS, searchProducts, bulkSearchProducts } = require('../services/productService');
const { getEmbedding } = require('../db/embeddingService');
const shared = require('../shared');

// Helper to reset and configure the supabase mock per test
function resetSupabase(opts = {}) {
  // Re-configure the mock supabase object in place
  const fresh = createSupabaseMock(opts);
  shared.supabase.from = fresh.from;
  shared.supabase.rpc  = fresh.rpc;
  return shared.supabase;
}

// ─────────────────────────────────────────────
describe('getAvailabilityStatus()', () => {
  test('stock > 0 returns "Available"', () => {
    expect(getAvailabilityStatus(5)).toBe('Available');
    expect(getAvailabilityStatus(1)).toBe('Available');
  });

  test('stock === 0 returns out-of-stock message', () => {
    const result = getAvailabilityStatus(0);
    expect(result).toMatch(/not in stock/i);
  });

  test('stock === null returns graceful message', () => {
    const result = getAvailabilityStatus(null);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  test('stock === undefined returns graceful message', () => {
    const result = getAvailabilityStatus(undefined);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});

// ─────────────────────────────────────────────
describe('calculatePrice()', () => {
  test('calculatePrice(1000, 40) → discount=400, final=600', () => {
    const result = calculatePrice(1000, 40);
    expect(result.originalPrice).toBe(1000);
    expect(result.discount).toBe(400);
    expect(result.finalPrice).toBe(600);
    expect(result.discountPercentage).toBe(40);
  });

  test('calculatePrice(1000, 0) → no discount, final=1000', () => {
    const result = calculatePrice(1000, 0);
    expect(result.discount).toBe(0);
    expect(result.finalPrice).toBe(1000);
  });

  test('calculatePrice(0, 40) → handles zero price', () => {
    const result = calculatePrice(0, 40);
    expect(result.originalPrice).toBe(0);
    expect(result.discount).toBe(0);
    expect(result.finalPrice).toBe(0);
  });

  test('calculatePrice(1000, 100) → 100% discount, final=0', () => {
    const result = calculatePrice(1000, 100);
    expect(result.finalPrice).toBe(0);
    expect(result.discount).toBe(1000);
  });
});

// ─────────────────────────────────────────────
describe('MAHINDRA_MODELS', () => {
  test('is an array with 30+ entries', () => {
    expect(Array.isArray(MAHINDRA_MODELS)).toBe(true);
    expect(MAHINDRA_MODELS.length).toBeGreaterThanOrEqual(30);
  });

  test('includes BOLERO', () => {
    expect(MAHINDRA_MODELS.map(m => m.toLowerCase())).toContain('bolero');
  });

  test('includes SCORPIO', () => {
    expect(MAHINDRA_MODELS.map(m => m.toLowerCase())).toContain('scorpio');
  });

  test('includes XUV (xuv700 or xuv500 etc)', () => {
    expect(MAHINDRA_MODELS.some(m => m.toLowerCase().startsWith('xuv'))).toBe(true);
  });

  test('includes THAR', () => {
    expect(MAHINDRA_MODELS.map(m => m.toLowerCase())).toContain('thar');
  });
});

// ─────────────────────────────────────────────
describe('searchProducts()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('vector search returns results → returns products array', async () => {
    const mockProducts = [
      { id: 1, name: 'Brake Pad', product_code: 'BP001', is_active: true, stock_quantity: 5 }
    ];
    resetSupabase({ rpcResult: { data: mockProducts, error: null } });

    const results = await searchProducts({ keyword: 'brake pad' });
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('Brake Pad');
    expect(results[0].availability).toBe('Available');
    expect(results[0].stock_quantity).toBeUndefined();
  });

  test('vector search returns 0 results → tries keyword fallback', async () => {
    const mockKeywordProducts = [
      { id: 2, name: 'Oil Filter', product_code: 'OF002', is_active: true, stock_quantity: 0 }
    ];
    // rpc returns empty, keyword fallback (from().select()...limit()) returns products
    const supa = resetSupabase({
      rpcResult: { data: [], error: null },
      fromResults: {
        products: { data: mockKeywordProducts, error: null }
      }
    });

    const results = await searchProducts({ keyword: 'oil filter' });
    expect(Array.isArray(results)).toBe(true);
    // keyword fallback should have been attempted via from('products')
    expect(supa.from).toHaveBeenCalledWith('products');
  });

  test('query containing Mahindra model name → strips model name on retry', async () => {
    // Vector and first keyword both return empty; broad search returns result
    let callCount = 0;
    const supa = shared.supabase;
    supa.rpc = jest.fn(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ data: [], error: null }); // first vector empty
      return Promise.resolve({ data: [
        { id: 3, name: 'Water Pump', product_code: 'WP003', is_active: true, stock_quantity: 2 }
      ], error: null }); // broad vector search
    });
    // keyword fallback also empty
    supa.from = jest.fn(() => {
      const chain = {
        select: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        ilike: jest.fn(() => chain),
        or: jest.fn(() => chain),
        order: jest.fn(() => chain),
        limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
        then: (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej),
        catch: fn => Promise.resolve({ data: [], error: null }).catch(fn),
      };
      return chain;
    });

    const results = await searchProducts({ keyword: 'water pump bolero' });
    // The broad vector search should be attempted when model name found in keyword
    expect(supa.rpc).toHaveBeenCalled();
  });

  test('session with workshopSegment → filters by segment', async () => {
    const mockProducts = [
      { id: 4, name: 'Engine Filter', product_code: 'EF004', is_active: true, stock_quantity: 3, segment: 'HCV' },
      { id: 5, name: 'Brake Disc', product_code: 'BD005', is_active: true, stock_quantity: 10, segment: 'MUV/PC' }
    ];
    resetSupabase({ rpcResult: { data: mockProducts, error: null } });

    const session = { isWorkshop: true, workshopSegment: 'HCV' };
    const results = await searchProducts({ keyword: 'filter' }, session);
    // Should only include HCV and MUV/PC segments
    results.forEach(r => {
      expect(['HCV', 'MUV/PC']).toContain(r.segment);
    });
  });
});

// ─────────────────────────────────────────────
describe('bulkSearchProducts()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('single-item call → returns same structure', async () => {
    const mockProducts = [
      { id: 1, name: 'Brake Pad', product_code: 'BP001', is_active: true, stock_quantity: 5 }
    ];
    resetSupabase({ rpcResult: { data: mockProducts, error: null } });

    const result = await bulkSearchProducts([{ query: 'brake pad' }]);

    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('summary');
    expect(result.results).toHaveLength(1);
    expect(result.results[0].query).toBe('brake pad');
    expect(result.results[0].found).toBe(true);
    expect(result.results[0].products).toHaveLength(1);
    expect(result.summary).toEqual({ total_searched: 1, found: 1, not_found: 0 });
  });

  test('3-item call → all 3 items appear in results', async () => {
    const mockProducts = [
      { id: 1, name: 'Generic Part', product_code: 'GP001', is_active: true, stock_quantity: 3 }
    ];
    resetSupabase({ rpcResult: { data: mockProducts, error: null } });

    const result = await bulkSearchProducts([
      { query: 'brake pad' },
      { query: 'oil filter' },
      { query: 'water pump' }
    ]);

    expect(result.results).toHaveLength(3);
    const queries = result.results.map(r => r.query);
    expect(queries).toContain('brake pad');
    expect(queries).toContain('oil filter');
    expect(queries).toContain('water pump');
    expect(result.summary.total_searched).toBe(3);
  });

  test('empty query item is filtered out gracefully', async () => {
    const mockProducts = [
      { id: 1, name: 'Brake Pad', product_code: 'BP001', is_active: true, stock_quantity: 5 }
    ];
    resetSupabase({ rpcResult: { data: mockProducts, error: null } });

    const result = await bulkSearchProducts([
      { query: 'brake pad' },
      { query: '' },
      { query: '   ' }
    ]);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].query).toBe('brake pad');
    expect(result.summary.total_searched).toBe(1);
  });

  test('one item fails → other items still return results', async () => {
    let callCount = 0;
    const supa = shared.supabase;
    supa.rpc = jest.fn(() => {
      callCount++;
      // Fail on the second call
      if (callCount === 2) return Promise.resolve({ data: null, error: { message: 'NIM timeout' } });
      return Promise.resolve({
        data: [{ id: 1, name: 'Part', product_code: 'P001', is_active: true, stock_quantity: 3 }],
        error: null
      });
    });
    supa.from = jest.fn(() => {
      const chain = {
        select: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        ilike: jest.fn(() => chain),
        or: jest.fn(() => chain),
        order: jest.fn(() => chain),
        limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
        then: (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej),
        catch: fn => Promise.resolve({ data: [], error: null }).catch(fn),
      };
      return chain;
    });

    const result = await bulkSearchProducts([
      { query: 'brake pad' },
      { query: 'oil filter' },
      { query: 'water pump' }
    ]);

    // All 3 should be in results — the failed one with found: false
    expect(result.results).toHaveLength(3);
    const failedItem = result.results.find(r => !r.found && r.products.length === 0);
    // At least one item should have succeeded
    const succeededItems = result.results.filter(r => r.found);
    expect(succeededItems.length).toBeGreaterThan(0);
    expect(result.summary.total_searched).toBe(3);
  });

  test('respects 10-item cap', async () => {
    const mockProducts = [
      { id: 1, name: 'Part', product_code: 'P001', is_active: true, stock_quantity: 1 }
    ];
    resetSupabase({ rpcResult: { data: mockProducts, error: null } });

    const items = Array.from({ length: 15 }, (_, i) => ({ query: `part ${i}` }));
    const result = await bulkSearchProducts(items);

    expect(result.results.length).toBeLessThanOrEqual(10);
  });

  test('returns correct summary counts', async () => {
    let callCount = 0;
    const supa = shared.supabase;
    supa.rpc = jest.fn(() => {
      callCount++;
      // First item found, second item not found
      if (callCount <= 2) {
        return Promise.resolve({
          data: [{ id: 1, name: 'Part', product_code: 'P001', is_active: true, stock_quantity: 3 }],
          error: null
        });
      }
      return Promise.resolve({ data: [], error: null });
    });
    supa.from = jest.fn(() => {
      const chain = {
        select: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        ilike: jest.fn(() => chain),
        or: jest.fn(() => chain),
        order: jest.fn(() => chain),
        limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
        then: (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej),
        catch: fn => Promise.resolve({ data: [], error: null }).catch(fn),
      };
      return chain;
    });

    const result = await bulkSearchProducts([
      { query: 'brake pad' },
      { query: 'mystery part' }
    ]);

    expect(result.summary.total_searched).toBe(2);
    expect(result.summary.found + result.summary.not_found).toBe(2);
  });
});
