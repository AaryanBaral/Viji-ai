'use strict';

// Mock llmGateway
const mockCallLLM = jest.fn();
const mockCallLLMStream = jest.fn();
jest.mock('../ai/llmGateway', () => ({
  callLLM: mockCallLLM,
  callLLMStream: mockCallLLMStream
}));

// Mock promptBuilder
jest.mock('../ai/promptBuilder', () => ({
  buildSystemPrompt: jest.fn().mockResolvedValue('system prompt'),
  claudeTools: [],
  isTechnicalQuery: jest.fn(() => false),
  trackTokenUsage: jest.fn(),
  loadConfig: jest.fn().mockResolvedValue({})
}));

// Mock toolHandlers
jest.mock('../tools/toolHandlers', () => ({
  processToolCall: jest.fn(),
  resolveOrderingCustomer: jest.fn()
}));

// Mock shared
jest.mock('../shared', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn(() => Promise.resolve({ error: null }))
    }))
  },
  CUSTOMER_CARE_PHONE: '+977-9851069717'
}));

const { handleConversationStream } = require('../ai/handleConversation');
const { processToolCall } = require('../tools/toolHandlers');

const baseSession = {
  context: {},
  sessionId: 'sess-1',
  phoneNumber: '+977-9851069717',
  customer: { id: 'cust-1', phone: '+977-9851069717' }
};

describe('handleConversationStream()', () => {
  beforeEach(() => jest.clearAllMocks());

  test('no tool use → emits full text as single chunk', async () => {
    mockCallLLM.mockResolvedValue({
      text: 'Hello! How can I help?',
      toolCalls: [],
      usage: { inputTokens: 50, outputTokens: 10 },
      stopReason: 'end_turn',
      rawContent: [{ type: 'text', text: 'Hello! How can I help?' }],
      meta: { provider: 'claude', costUSD: 0, latencyMs: 200 }
    });

    const chunks = [];
    const onChunk = (text) => chunks.push(text);

    const result = await handleConversationStream('hello', baseSession, [], onChunk);

    expect(result.response).toBe('Hello! How can I help?');
    expect(chunks).toEqual(['Hello! How can I help?']);
    expect(mockCallLLM).toHaveBeenCalledTimes(1);
    expect(mockCallLLMStream).not.toHaveBeenCalled();
  });

  test('product query → pre-search skips LLM call #1, streams final response', async () => {
    // Pre-search runs processToolCall before any LLM call
    processToolCall.mockResolvedValue({
      success: true,
      products: [{ name: 'Brake Pad', product_code: 'BP001' }]
    });

    // Single streaming call to format pre-searched results
    mockCallLLMStream.mockImplementation(async (sys, msgs, tools, opts, onTextDelta) => {
      onTextDelta('Here are ');
      onTextDelta('the results');
      return {
        text: 'Here are the results',
        toolCalls: [],
        usage: { inputTokens: 200, outputTokens: 50 },
        stopReason: 'end_turn',
        rawContent: [{ type: 'text', text: 'Here are the results' }],
        meta: { provider: 'claude', costUSD: 0, latencyMs: 800 }
      };
    });

    const chunks = [];
    const onChunk = (text) => chunks.push(text);

    const result = await handleConversationStream('brake pad', baseSession, [], onChunk);

    expect(result.response).toBe('Here are the results');
    expect(chunks).toEqual(['Here are ', 'the results']);
    // Pre-search path: no callLLM needed, only callLLMStream
    expect(mockCallLLM).not.toHaveBeenCalled();
    expect(mockCallLLMStream).toHaveBeenCalledTimes(1);
    expect(processToolCall).toHaveBeenCalledWith('search_products', { keyword: 'brake pad' }, baseSession);
  });

  test('error → emits error message as chunk', async () => {
    mockCallLLM.mockRejectedValue(new Error('LLM API down'));

    const chunks = [];
    const onChunk = (text) => chunks.push(text);

    const result = await handleConversationStream('hello', baseSession, [], onChunk);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('Sorry');
    expect(result.response).toContain('Sorry');
  });

  test('context and imageResult are returned correctly', async () => {
    mockCallLLM.mockResolvedValue({
      text: '',
      toolCalls: [{ id: 'tool-1', name: 'get_product_image', input: { product_name: 'Brake Pad' } }],
      usage: { inputTokens: 100, outputTokens: 30 },
      stopReason: 'tool_use',
      rawContent: [{ type: 'tool_use', id: 'tool-1', name: 'get_product_image', input: { product_name: 'Brake Pad' } }],
      meta: { provider: 'claude', costUSD: 0, latencyMs: 300 }
    });

    processToolCall.mockResolvedValue({
      success: true,
      image_url: 'https://example.com/brake.jpg',
      product_name: 'Brake Pad'
    });

    mockCallLLMStream.mockImplementation(async (sys, msgs, tools, opts, onTextDelta) => {
      onTextDelta('Here is the image');
      return {
        text: 'Here is the image',
        toolCalls: [],
        usage: { inputTokens: 150, outputTokens: 40 },
        stopReason: 'end_turn',
        rawContent: [{ type: 'text', text: 'Here is the image' }],
        meta: { provider: 'claude', costUSD: 0, latencyMs: 400 }
      };
    });

    const chunks = [];
    const result = await handleConversationStream('show brake pad image', baseSession, [], (t) => chunks.push(t));

    expect(result.imageResult).toEqual({
      success: true,
      image_url: 'https://example.com/brake.jpg',
      product_name: 'Brake Pad'
    });
    expect(result.updatedContext).toBe(baseSession.context);
  });
});
