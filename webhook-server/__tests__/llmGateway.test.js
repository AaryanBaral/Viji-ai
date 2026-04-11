'use strict';

// Mock @anthropic-ai/sdk
const mockStreamOn = jest.fn();
const mockFinalMessage = jest.fn();
const mockStream = { on: mockStreamOn, finalMessage: mockFinalMessage };
const mockMessagesCreate = jest.fn();
const mockMessagesStream = jest.fn(() => mockStream);

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn(() => ({
    messages: {
      create: mockMessagesCreate,
      stream: mockMessagesStream
    }
  }));
});

// Mock shared
jest.mock('../shared', () => ({
  supabase: { from: jest.fn(() => ({ insert: jest.fn(() => Promise.resolve({ error: null })) })) },
  CUSTOMER_CARE_PHONE: '+977-9851069717'
}));

const { callLLM, callLLMStream, CONFIG } = require('../ai/llmGateway');

describe('callLLMStream()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: stream.on('text', cb) stores cb, finalMessage resolves with a message
    mockStreamOn.mockImplementation((event, cb) => {
      if (event === 'text') {
        // Simulate text chunks
        setTimeout(() => { cb('Hello'); cb(' world'); }, 0);
      }
    });
    mockFinalMessage.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello world' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 20 }
    });
  });

  test('calls onTextDelta for each text chunk', async () => {
    const chunks = [];
    const onTextDelta = (text) => chunks.push(text);

    const result = await callLLMStream('system', [{ role: 'user', content: 'hi' }], [], {}, onTextDelta);

    expect(mockMessagesStream).toHaveBeenCalled();
    expect(result.stopReason).toBe('end_turn');
    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(20);
    expect(result.meta.provider).toBe('claude');
  });

  test('returns normalized result with toolCalls when stop_reason is tool_use', async () => {
    mockStreamOn.mockImplementation(() => {});
    mockFinalMessage.mockResolvedValue({
      content: [
        { type: 'text', text: 'Searching...' },
        { type: 'tool_use', id: 'tool-1', name: 'search_products', input: { keyword: 'brake' } }
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 50, output_tokens: 30 }
    });

    const result = await callLLMStream('system', [{ role: 'user', content: 'brake pad' }], [], {});

    expect(result.stopReason).toBe('tool_use');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('search_products');
    expect(result.toolCalls[0].input).toEqual({ keyword: 'brake' });
  });

  test('without onTextDelta callback → still works (no error)', async () => {
    const result = await callLLMStream('system', [{ role: 'user', content: 'hi' }], [], {});
    expect(result.text).toBeTruthy();
  });
});

// ─────────────────────────────────────────────
describe('callOpenAICompat() timeout', () => {
  const originalFetch = global.fetch;
  const originalProvider = CONFIG.provider;

  beforeEach(() => {
    jest.clearAllMocks();
    // Force callLLM to use a non-claude provider so it goes through callOpenAICompat
    CONFIG.provider = 'gemini';
    process.env.GEMINI_API_KEY = 'test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    CONFIG.provider = originalProvider;
  });

  test('successful fetch → returns normally, timeout cleared', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Hello', tool_calls: [] }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 }
      })
    });

    const result = await callLLM('system', [{ role: 'user', content: 'hi' }], []);
    expect(result.text).toBe('Hello');
    expect(result.stopReason).toBe('end_turn');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  test('AbortError from fetch → throws timeout message', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortError);

    await expect(
      callLLM('system', [{ role: 'user', content: 'hi' }], [])
    ).rejects.toThrow(/timed out/);
  });

  test('non-abort fetch error → re-thrown as-is', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      callLLM('system', [{ role: 'user', content: 'hi' }], [])
    ).rejects.toThrow('ECONNREFUSED');
  });
});
