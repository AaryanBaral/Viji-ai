'use strict';

/**
 * Flexible Supabase mock factory.
 * Creates a chainable mock where every method returns the chain itself,
 * and the chain is thenable (awaitable directly) as well as via .single()/.limit().
 *
 * Usage in a test:
 *   const { createSupabaseMock } = require('./mocks/supabase');
 *   const mockSupa = createSupabaseMock({
 *     fromResults: {
 *       products: { data: [{ id: 1 }], error: null },
 *       bot_config: { data: [], error: null },
 *     },
 *     rpcResult: { data: someArray, error: null },
 *   });
 */

function createChain(result) {
  const chain = {};
  ['select', 'eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in', 'ilike', 'or',
   'like', 'order', 'not', 'update', 'upsert', 'filter'].forEach(method => {
    chain[method] = jest.fn(() => chain);
  });
  chain.limit  = jest.fn(() => Promise.resolve(result));
  chain.single = jest.fn(() => Promise.resolve(result));
  chain.maybeSingle = jest.fn(() => Promise.resolve(result));
  chain.insert = jest.fn(() => ({
    select: jest.fn(() => ({
      single: jest.fn(() => Promise.resolve(result))
    }))
  }));
  // Make the chain itself awaitable
  chain.then  = (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected);
  chain.catch = fn => Promise.resolve(result).catch(fn);
  return chain;
}

function createSupabaseMock({ fromResults = {}, rpcResult = null } = {}) {
  return {
    from: jest.fn(tableName => createChain(
      fromResults[tableName] !== undefined
        ? fromResults[tableName]
        : { data: null, error: null }
    )),
    rpc: jest.fn(() => Promise.resolve(rpcResult || { data: null, error: null })),
  };
}

module.exports = { createSupabaseMock, createChain };
