'use strict';

const { classifyMessage, isSimpleProductQuery } = require('../ai/classifier');

const emptySession = { context: {} };
const emptyCartSession = { context: { cart: [] } };

describe('classifyMessage()', () => {
  test('"hello" → ollama route (simple greeting)', () => {
    const result = classifyMessage('hello', emptySession);
    expect(result.route).toBe('ollama');
  });

  test('"hi" → ollama route (simple greeting)', () => {
    const result = classifyMessage('hi', emptySession);
    expect(result.route).toBe('ollama');
  });

  test('"I need a water pump for Bolero" → gemini (complex/product keyword)', () => {
    const result = classifyMessage('I need a water pump for Bolero', emptySession);
    expect(result.route).toBe('gemini');
  });

  test('"what is my order status" → gemini (complex)', () => {
    const result = classifyMessage('what is my order status', emptySession);
    expect(result.route).toBe('gemini');
  });

  test('Nepali text "नमस्ते" → ollama (devanagari)', () => {
    const result = classifyMessage('नमस्ते', emptyCartSession);
    expect(result.route).toBe('ollama');
    expect(result.model).toBe('qwen2.5:3b');
  });

  test('"P0301 misfire" → gemini (complex/technical keyword)', () => {
    // "P0301" matches PRODUCT_CODE_PATTERN /[A-Z]{2,3}[-]?\d{3,}/
    const result = classifyMessage('P0301 misfire', emptySession);
    expect(result.route).toBe('gemini');
  });

  test('session with active cart → always routes to gemini', () => {
    const sessionWithCart = { context: { cart: [{ product_code: 'BP001' }] } };
    const result = classifyMessage('ok', sessionWithCart);
    expect(result.route).toBe('gemini');
    expect(result.reason).toBe('cart_active');
  });

  test('"thanks" → ollama (simple greeting)', () => {
    const result = classifyMessage('thanks', emptySession);
    expect(result.route).toBe('ollama');
  });

  test('message with product code → gemini', () => {
    const result = classifyMessage('I need BP0071N', emptySession);
    // BP0071N has 2 letters + digits — matches product code pattern
    expect(result.route).toBe('gemini');
  });
});

describe('isSimpleProductQuery()', () => {
  test('"water pump bolero" → true', () => {
    expect(isSimpleProductQuery('water pump bolero')).toBe(true);
  });

  test('"brake pad" → true', () => {
    expect(isSimpleProductQuery('brake pad')).toBe(true);
  });

  test('"oil filter" → true', () => {
    expect(isSimpleProductQuery('oil filter')).toBe(true);
  });

  test('"what is wrong with my engine" → false', () => {
    expect(isSimpleProductQuery('what is wrong with my engine')).toBe(false);
  });

  test('"order status" → false', () => {
    expect(isSimpleProductQuery('order status')).toBe(false);
  });

  test('"hello" → false (no product keywords)', () => {
    expect(isSimpleProductQuery('hello')).toBe(false);
  });

  test('"water pump?" → true (question mark stripped, product keyword found)', () => {
    expect(isSimpleProductQuery('water pump?')).toBe(true);
  });

  test('"I need brake pads for my Bolero truck now" → false (too many words)', () => {
    expect(isSimpleProductQuery('I need brake pads for my Bolero truck now')).toBe(false);
  });

  test('"WP0071N" → false (product code)', () => {
    expect(isSimpleProductQuery('WP0071N')).toBe(false);
  });

  test('Devanagari "वाटर पंप" → false', () => {
    expect(isSimpleProductQuery('वाटर पंप')).toBe(false);
  });
});
