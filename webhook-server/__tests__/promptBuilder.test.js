'use strict';

const { createSupabaseMock } = require('./mocks/supabase');

let mockSupabase = createSupabaseMock();
jest.mock('../shared', () => ({
  supabase: mockSupabase,
  anthropic: { messages: { create: jest.fn() } },
  CUSTOMER_CARE_PHONE: '+977-9851069717'
}));

// orderService uses shared too — mock it to avoid side effects
jest.mock('../services/orderService', () => ({
  calculateCartTotal: jest.fn(() => ({
    itemCount: 0, subtotal: 0, discount: 0, discountPercentage: 0, total: 0, estimatedDeliveryDays: null
  }))
}));

const { isTechnicalQuery, claudeTools, buildSystemPrompt } = require('../ai/promptBuilder');
const shared = require('../shared');

function resetSupabase(opts = {}) {
  const fresh = createSupabaseMock(opts);
  shared.supabase.from = fresh.from;
  shared.supabase.rpc  = fresh.rpc;
  return shared.supabase;
}

// ─────────────────────────────────────────────
describe('isTechnicalQuery()', () => {
  test('"engine overheating" → true', () => {
    expect(isTechnicalQuery('engine overheating')).toBe(true);
  });

  test('"Bolero water pump price" → false (product search, not technical)', () => {
    // "price" and "water pump" are not in technical keywords list
    expect(isTechnicalQuery('Bolero water pump price')).toBe(false);
  });

  test('"brake noise problem" → true', () => {
    expect(isTechnicalQuery('brake noise problem')).toBe(true);
  });

  test('"P0301 code" → true (OBD code)', () => {
    expect(isTechnicalQuery('P0301 code')).toBe(true);
  });

  test('"hello" → false', () => {
    expect(isTechnicalQuery('hello')).toBe(false);
  });

  test('"order status" → false', () => {
    expect(isTechnicalQuery('order status')).toBe(false);
  });

  test('Nepali "बिग्रेको" → true', () => {
    expect(isTechnicalQuery('बिग्रेको')).toBe(true);
  });

  test('"kharab" → true', () => {
    expect(isTechnicalQuery('kharab')).toBe(true);
  });

  test('empty string → false', () => {
    expect(isTechnicalQuery('')).toBe(false);
  });
});

// ─────────────────────────────────────────────
describe('claudeTools', () => {
  test('is an array of 10+ tool definitions', () => {
    expect(Array.isArray(claudeTools)).toBe(true);
    expect(claudeTools.length).toBeGreaterThanOrEqual(10);
  });

  test('each tool has name, description, input_schema', () => {
    claudeTools.forEach(tool => {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('input_schema');
    });
  });

  test('search_products tool exists with query parameter (keyword)', () => {
    const tool = claudeTools.find(t => t.name === 'search_products');
    expect(tool).toBeDefined();
    expect(tool.input_schema.properties).toHaveProperty('keyword');
  });

  test('place_order tool exists', () => {
    const tool = claudeTools.find(t => t.name === 'place_order');
    expect(tool).toBeDefined();
  });
});

// ─────────────────────────────────────────────
describe('buildSystemPrompt()', () => {
  const baseSession = {
    customer: null,
    context: { cart: [] },
    phoneNumber: '',
    isWorkshop: false,
    workshopName: null,
    workshopSegment: null,
    workshopGrade: null,
    workshopMonthlyServicing: null,
    isNewCustomer: true,
    isEmployee: false,
    actingForCustomer: null
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default config response from bot_config
    resetSupabase({
      fromResults: {
        bot_config: { data: [
          { config_key: 'prompt_company_info', config_value: 'You are ViJJI assistant.', config_type: 'string' }
        ], error: null },
        customer_token_usage: { data: null, error: { code: 'PGRST116' } }
      }
    });
  });

  test('Nepal customer (+977) → prompt includes NPR pricing rules', async () => {
    const session = {
      ...baseSession,
      customer: {
        id: 'cust-1', name: 'Ram', phone: '+9779851069717',
        customer_code: 'C001', city: 'KTM', customer_grade: 'BASIC',
        base_discount_percentage: 0, credit_limit: 10000, balance_lcy: 0
      },
      phoneNumber: '+9779851069717'
    };
    const prompt = await buildSystemPrompt(session, []);
    expect(prompt).toMatch(/NPR/);
    expect(prompt).toMatch(/Nepal/i);
  });

  test('India customer (+91) → prompt includes INR pricing rules', async () => {
    const session = {
      ...baseSession,
      customer: {
        id: 'cust-2', name: 'Raj', phone: '+919876543210',
        customer_code: 'C002', city: 'Delhi', customer_grade: 'BASIC',
        base_discount_percentage: 0, credit_limit: 5000, balance_lcy: 0
      },
      phoneNumber: '+919876543210'
    };
    const prompt = await buildSystemPrompt(session, []);
    expect(prompt).toMatch(/India/i);
    expect(prompt).toMatch(/INR/i);
  });

  test('Workshop PLATINUM session → prompt includes full technical support', async () => {
    const session = {
      ...baseSession,
      customer: {
        id: 'cust-3', name: 'Workshop A', phone: '+9779800000001',
        customer_code: 'W001', city: 'KTM', customer_grade: 'PLATINUM',
        base_discount_percentage: 40, credit_limit: 100000, balance_lcy: 0
      },
      phoneNumber: '+9779800000001',
      isWorkshop: true,
      workshopName: 'Sharma Workshop',
      workshopGrade: 'PLATINUM',
      workshopSegment: 'MUV/PC',
      isEmployee: false
    };
    // token usage returns 0 (under limit)
    resetSupabase({
      fromResults: {
        bot_config: { data: [
          { config_key: 'prompt_company_info', config_value: 'You are ViJJI.', config_type: 'string' }
        ], error: null },
        customer_token_usage: { data: { estimated_cost_npr: '0' }, error: null }
      }
    });

    const prompt = await buildSystemPrompt(session, []);
    expect(prompt).toMatch(/PLATINUM/i);
    expect(prompt).toMatch(/full technical support|no (usage )?limits/i);
  });

  test('Workshop STANDARD (BASIC) with cost > 50 NPR → prompt mentions customer care redirect', async () => {
    const session = {
      ...baseSession,
      customer: {
        id: 'cust-4', name: 'Workshop B', phone: '+9779800000002',
        customer_code: 'W002', city: 'Pokhara', customer_grade: 'BASIC',
        base_discount_percentage: 25, credit_limit: 10000, balance_lcy: 0
      },
      phoneNumber: '+9779800000002',
      isWorkshop: true,
      workshopName: 'Bhandari Workshop',
      workshopGrade: 'BASIC',
      workshopSegment: 'HCV',
      isEmployee: false
    };
    resetSupabase({
      fromResults: {
        bot_config: { data: [
          { config_key: 'prompt_company_info', config_value: 'You are ViJJI.', config_type: 'string' }
        ], error: null },
        customer_token_usage: { data: { estimated_cost_npr: '100' }, error: null }
      }
    });

    const prompt = await buildSystemPrompt(session, []);
    expect(prompt).toMatch(/customer care/i);
    expect(prompt).toMatch(/\+977-9851069717/);
  });

  test('Workshop STANDARD with cost < 50 NPR → prompt includes remaining budget', async () => {
    const session = {
      ...baseSession,
      customer: {
        id: 'cust-5', name: 'Workshop C', phone: '+9779800000003',
        customer_code: 'W003', city: 'Chitwan', customer_grade: 'BASIC',
        base_discount_percentage: 25, credit_limit: 10000, balance_lcy: 0
      },
      phoneNumber: '+9779800000003',
      isWorkshop: true,
      workshopName: 'Thapa Workshop',
      workshopGrade: 'BASIC',
      workshopSegment: 'MUV/PC',
      isEmployee: false
    };
    resetSupabase({
      fromResults: {
        bot_config: { data: [
          { config_key: 'prompt_company_info', config_value: 'You are ViJJI.', config_type: 'string' }
        ], error: null },
        customer_token_usage: { data: { estimated_cost_npr: '20' }, error: null }
      }
    });

    const prompt = await buildSystemPrompt(session, []);
    expect(prompt).toMatch(/Budget remaining|budget remaining/i);
  });

  test('Prompt always includes CUSTOMER_CARE_PHONE value', async () => {
    const session = {
      ...baseSession,
      phoneNumber: '+9779851069717',
      customer: null,
      isNewCustomer: true
    };
    const prompt = await buildSystemPrompt(session, []);
    expect(prompt).toMatch(/9851069717/);
  });
});

// ─────────────────────────────────────────────
describe('getCachedMonthlyUsage()', () => {
  const { getCachedMonthlyUsage, usageCache } = require('../ai/promptBuilder');

  beforeEach(() => {
    jest.clearAllMocks();
    usageCache.clear();
  });

  test('first call → DB query, value cached', async () => {
    resetSupabase({
      fromResults: {
        customer_token_usage: { data: { estimated_cost_npr: '25.50' }, error: null }
      }
    });

    const result = await getCachedMonthlyUsage('cust-1', '2026-04');

    expect(result).toBe(25.5);
    expect(usageCache.has('cust-1:2026-04')).toBe(true);
    expect(shared.supabase.from).toHaveBeenCalledWith('customer_token_usage');
  });

  test('second call within 5 min → cache hit, no DB query', async () => {
    // Seed the cache
    usageCache.set('cust-1:2026-04', { value: 25.5, ts: Date.now() });

    resetSupabase(); // fresh mock — should NOT be called
    const result = await getCachedMonthlyUsage('cust-1', '2026-04');

    expect(result).toBe(25.5);
    expect(shared.supabase.from).not.toHaveBeenCalled();
  });

  test('after 5+ minutes → cache miss, DB queried again', async () => {
    // Seed cache with stale entry (6 min ago)
    usageCache.set('cust-1:2026-04', { value: 10, ts: Date.now() - 6 * 60 * 1000 });

    resetSupabase({
      fromResults: {
        customer_token_usage: { data: { estimated_cost_npr: '42.00' }, error: null }
      }
    });

    const result = await getCachedMonthlyUsage('cust-1', '2026-04');

    expect(result).toBe(42);
    expect(shared.supabase.from).toHaveBeenCalledWith('customer_token_usage');
    expect(usageCache.get('cust-1:2026-04').value).toBe(42);
  });

  test('DB returns null → caches 0', async () => {
    resetSupabase({
      fromResults: {
        customer_token_usage: { data: null, error: { code: 'PGRST116', message: 'no rows' } }
      }
    });

    const result = await getCachedMonthlyUsage('cust-new', '2026-04');

    expect(result).toBe(0);
    expect(usageCache.get('cust-new:2026-04').value).toBe(0);
  });
});
