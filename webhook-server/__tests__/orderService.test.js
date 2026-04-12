'use strict';

const { createSupabaseMock } = require('./mocks/supabase');

let mockSupabase = createSupabaseMock();
jest.mock('../shared', () => ({
  supabase: mockSupabase,
  anthropic: { messages: { create: jest.fn() } },
  CUSTOMER_CARE_PHONE: '+977-9851069717'
}));

const { addToCart, calculateCartTotal } = require('../services/orderService');
const shared = require('../shared');

function resetSupabase(opts = {}) {
  const fresh = createSupabaseMock(opts);
  shared.supabase.from = fresh.from;
  shared.supabase.rpc  = fresh.rpc;
  return shared.supabase;
}

// ─────────────────────────────────────────────
describe('addToCart()', () => {
  beforeEach(() => jest.clearAllMocks());

  test('add new item → cart has 1 item with correct fields', async () => {
    const product = {
      id: 'uuid-1', product_code: 'BP001', name: 'Brake Pad',
      brand: 'Bosch', oem_number: 'OEM001', mrp_inr: 500,
      stock_quantity: 10, min_order_quantity: 1, expected_delivery_days: 3
    };
    resetSupabase({ fromResults: { products: { data: product, error: null } } });

    const cart = await addToCart([], 'BP001', 1);
    expect(cart).toHaveLength(1);
    expect(cart[0].product_code).toBe('BP001');
    expect(cart[0].quantity).toBe(1);
    expect(cart[0].mrp_inr).toBe(500);
    expect(cart[0].name).toBe('Brake Pad');
  });

  test('add same item again → quantity increments', async () => {
    const product = {
      id: 'uuid-1', product_code: 'BP001', name: 'Brake Pad',
      brand: 'Bosch', oem_number: 'OEM001', mrp_inr: 500,
      stock_quantity: 10, min_order_quantity: 1
    };
    resetSupabase({ fromResults: { products: { data: product, error: null } } });

    let cart = [];
    cart = await addToCart(cart, 'BP001', 1);
    cart = await addToCart(cart, 'BP001', 2);
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(3);
  });

  test('add item that does not exist in DB → throws error', async () => {
    resetSupabase({ fromResults: { products: { data: null, error: { message: 'Not found' } } } });

    await expect(addToCart([], 'NOTEXIST', 1)).rejects.toThrow('Product not found');
  });

  test('quantity below min_order_quantity → throws error', async () => {
    const product = {
      id: 'uuid-2', product_code: 'BP002', name: 'Clutch Plate',
      mrp_inr: 800, stock_quantity: 5, min_order_quantity: 3
    };
    resetSupabase({ fromResults: { products: { data: product, error: null } } });

    await expect(addToCart([], 'BP002', 1)).rejects.toThrow(/minimum order quantity/i);
  });

  test('out-of-stock item (stock_quantity === 0) → throws error', async () => {
    const product = {
      id: 'uuid-3', product_code: 'BP003', name: 'Oil Filter',
      mrp_inr: 200, stock_quantity: 0, min_order_quantity: 1
    };
    resetSupabase({ fromResults: { products: { data: product, error: null } } });

    await expect(addToCart([], 'BP003', 1)).rejects.toThrow(/not in stock/i);
  });
});

// ─────────────────────────────────────────────
describe('calculateCartTotal()', () => {
  test('2 items, 40% discount → correct subtotal, discount, total', () => {
    const cart = [
      { product_code: 'BP001', name: 'Brake Pad', mrp_inr: 500, quantity: 2 },
      { product_code: 'OF002', name: 'Oil Filter', mrp_inr: 200, quantity: 1 }
    ];
    const result = calculateCartTotal(cart, 40);
    expect(result.subtotal).toBe(1200);   // 500*2 + 200*1
    expect(result.discount).toBe(480);    // 1200 * 40%
    expect(result.total).toBe(720);       // 1200 - 480
    expect(result.itemCount).toBe(2);
  });

  test('empty cart → returns 0 totals', () => {
    const result = calculateCartTotal([], 40);
    expect(result.subtotal).toBe(0);
    expect(result.discount).toBe(0);
    expect(result.total).toBe(0);
    expect(result.itemCount).toBe(0);
  });

  test('cart with no discount → total equals subtotal', () => {
    const cart = [{ product_code: 'WP001', name: 'Water Pump', mrp_inr: 1000, quantity: 1 }];
    const result = calculateCartTotal(cart, 0);
    expect(result.discount).toBe(0);
    expect(result.total).toBe(result.subtotal);
    expect(result.total).toBe(1000);
  });
});

// ─────────────────────────────────────────────
describe('VAT calculation math', () => {
  // Admin dashboard uses: price_excl_vat = mrp / 1.13, vat_amount = mrp - price_excl_vat

  function calcVAT(mrp) {
    const priceExclVat = mrp / 1.13;
    const vatAmount = mrp - priceExclVat;
    return {
      price_excl_vat: Math.round(priceExclVat * 100) / 100,
      vat_amount: Math.round(vatAmount * 100) / 100
    };
  }

  test('mrp 1130 → price_excl_vat ≈ 1000, vat_amount ≈ 130', () => {
    const { price_excl_vat, vat_amount } = calcVAT(1130);
    expect(price_excl_vat).toBeCloseTo(1000, 1);
    expect(vat_amount).toBeCloseTo(130, 1);
  });

  test('mrp 2148 → price_excl_vat ≈ 1900.88, vat_amount ≈ 247.12', () => {
    const { price_excl_vat, vat_amount } = calcVAT(2148);
    expect(price_excl_vat).toBeCloseTo(1900.88, 1);
    expect(vat_amount).toBeCloseTo(247.12, 1);
  });
});
