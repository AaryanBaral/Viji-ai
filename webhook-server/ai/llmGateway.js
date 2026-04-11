// llmGateway.js
// Provider-agnostic LLM gateway for ViJJI.
// Claude message format is canonical for all internal message history.

const Anthropic = require('@anthropic-ai/sdk');
const { supabase, httpsAgent } = require('../shared');

// ─────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────
const CONFIG = {
  provider: process.env.LLM_PROVIDER || 'claude',
  fallback: process.env.LLM_FALLBACK || null,
  shadowMode: process.env.LLM_SHADOW_MODE === 'true',
  shadowProvider: process.env.LLM_SHADOW_PROVIDER || null,

  models: {
    claude: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
    gemini: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    openai: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    groq:   process.env.GROQ_MODEL   || 'llama-3.3-70b-versatile',
  },

  // Cost per million tokens [inputUSD, outputUSD]
  costs: {
    claude: [3.0,   15.0],
    gemini: [0.075,  0.30],
    openai: [0.15,   0.60],
    groq:   [0.59,   0.79],
  }
};

// ─────────────────────────────────────────────────────────────
// TOOL TRANSLATION: Claude input_schema → OpenAI function parameters
// ─────────────────────────────────────────────────────────────
function convertToolsToOpenAI(tools) {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema
    }
  }));
}

// ─────────────────────────────────────────────────────────────
// MESSAGE TRANSLATION: Claude canonical format → OpenAI format
// ─────────────────────────────────────────────────────────────
function convertMessagesToOpenAI(messages, systemPrompt) {
  const result = [];

  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        result.push({ role: 'user', content: msg.content });
      } else if (Array.isArray(msg.content)) {
        const toolResults = msg.content.filter(b => b.type === 'tool_result');
        const textBlocks  = msg.content.filter(b => b.type === 'text');

        // tool_result blocks → individual role:'tool' messages
        for (const tr of toolResults) {
          result.push({
            role: 'tool',
            tool_call_id: tr.tool_use_id,
            content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content)
          });
        }

        if (textBlocks.length > 0) {
          result.push({ role: 'user', content: textBlocks.map(b => b.text).join('\n') });
        }
      }
    } else if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        result.push({ role: 'assistant', content: msg.content });
      } else if (Array.isArray(msg.content)) {
        const textBlocks    = msg.content.filter(b => b.type === 'text');
        const toolUseBlocks = msg.content.filter(b => b.type === 'tool_use');

        const assistantMsg = { role: 'assistant' };
        assistantMsg.content = textBlocks.length > 0
          ? textBlocks.map(b => b.text).join('\n')
          : null;

        if (toolUseBlocks.length > 0) {
          assistantMsg.tool_calls = toolUseBlocks.map(tu => ({
            id: tu.id,
            type: 'function',
            function: {
              name: tu.name,
              arguments: JSON.stringify(tu.input)
            }
          }));
        }

        result.push(assistantMsg);
      }
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// COST CALCULATION
// ─────────────────────────────────────────────────────────────
function calculateCost(provider, inputTokens, outputTokens) {
  const [inputRate, outputRate] = CONFIG.costs[provider] || [0, 0];
  return (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;
}

// ─────────────────────────────────────────────────────────────
// CLAUDE PROVIDER (via @anthropic-ai/sdk)
// ─────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

async function callClaude(systemPrompt, messages, tools, { maxTokens } = {}) {
  const start = Date.now();
  const response = await anthropic.messages.create({
    model: CONFIG.models.claude,
    max_tokens: maxTokens || 1024,
    stream: false,
    system: systemPrompt,
    tools,
    messages
  });
  const latencyMs = Date.now() - start;

  const inputTokens  = response.usage?.input_tokens  || 0;
  const outputTokens = response.usage?.output_tokens || 0;

  const toolCalls = response.content
    .filter(b => b.type === 'tool_use')
    .map(b => ({ id: b.id, name: b.name, input: b.input }));

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n\n');

  return {
    text,
    toolCalls,
    usage: { inputTokens, outputTokens },
    stopReason: response.stop_reason,
    rawContent: response.content, // Already Claude format — reuse directly for message history
    meta: {
      provider: 'claude',
      costUSD: calculateCost('claude', inputTokens, outputTokens),
      latencyMs
    }
  };
}

// ─────────────────────────────────────────────────────────────
// OPENAI-COMPATIBLE PROVIDERS (OpenAI / Gemini / Groq via fetch)
// ─────────────────────────────────────────────────────────────
function getOpenAICompatConfig(provider) {
  switch (provider) {
    case 'gemini':
      return {
        url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        apiKey: process.env.GEMINI_API_KEY,
        model: CONFIG.models.gemini
      };
    case 'openai':
      return {
        url: 'https://api.openai.com/v1/chat/completions',
        apiKey: process.env.OPENAI_API_KEY,
        model: CONFIG.models.openai
      };
    case 'groq':
      return {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        apiKey: process.env.GROQ_API_KEY,
        model: CONFIG.models.groq
      };
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// Reconstruct Claude-format content array from a parsed OpenAI response message.
// This keeps message history in canonical Claude format regardless of provider.
function buildClaudeContent(text, toolCalls) {
  const content = [];
  if (text) content.push({ type: 'text', text });
  for (const tc of toolCalls) {
    content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
  }
  return content;
}

async function callOpenAICompat(provider, systemPrompt, messages, claudeTools) {
  const start = Date.now();
  const { url, apiKey, model } = getOpenAICompatConfig(provider);

  const openAIMessages = convertMessagesToOpenAI(messages, systemPrompt);
  const openAITools = claudeTools && claudeTools.length > 0
    ? convertToolsToOpenAI(claudeTools)
    : undefined;

  const body = {
    model,
    max_tokens: 1024,
    messages: openAIMessages,
    ...(openAITools ? { tools: openAITools, tool_choice: 'auto' } : {})
  };

  const TIMEOUT_MS = 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error(`[llmGateway] ${provider} timeout after ${TIMEOUT_MS / 1000}s`);
      throw new Error(`[llmGateway] ${provider} request timed out after ${TIMEOUT_MS / 1000}s`);
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${provider} API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const latencyMs = Date.now() - start;

  const choice   = data.choices?.[0];
  const message  = choice?.message;
  const inputTokens  = data.usage?.prompt_tokens     || 0;
  const outputTokens = data.usage?.completion_tokens || 0;

  // Convert OpenAI tool_calls → Claude canonical format
  const toolCalls = (message?.tool_calls || []).map(tc => ({
    id: tc.id,
    name: tc.function.name,
    input: (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })()
  }));

  const stopReason = choice?.finish_reason === 'tool_calls' ? 'tool_use'
    : choice?.finish_reason === 'stop' ? 'end_turn'
    : choice?.finish_reason || 'end_turn';

  const text = message?.content || '';

  return {
    text,
    toolCalls,
    usage: { inputTokens, outputTokens },
    stopReason,
    rawContent: buildClaudeContent(text, toolCalls), // Stored as Claude format for history
    meta: {
      provider,
      costUSD: calculateCost(provider, inputTokens, outputTokens),
      latencyMs
    }
  };
}

// ─────────────────────────────────────────────────────────────
// INTERNAL DISPATCH
// ─────────────────────────────────────────────────────────────
async function dispatchToProvider(provider, systemPrompt, messages, tools, opts = {}) {
  if (provider === 'claude') {
    return callClaude(systemPrompt, messages, tools, opts);
  }
  return callOpenAICompat(provider, systemPrompt, messages, tools);
}

// ─────────────────────────────────────────────────────────────
// LOGGING
// ─────────────────────────────────────────────────────────────
async function logLLMCall({ provider, originalProvider, wasFallback, inputTokens, outputTokens,
  costUSD, latencyMs, toolCalls, sessionId, phoneNumber }) {
  try {
    await supabase.from('llm_usage_logs').insert({
      provider,
      original_provider: originalProvider || provider,
      was_fallback: wasFallback || false,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUSD,
      latency_ms: latencyMs,
      tool_calls: toolCalls?.length > 0 ? toolCalls : null,
      session_id: sessionId || null,
      phone_number: phoneNumber || null
    });
  } catch (err) {
    console.warn('⚠️ logLLMCall failed (non-fatal):', err.message);
  }
}

async function logShadowComparison({ primaryProvider, shadowProvider, primaryText, shadowText,
  primaryToolCalls, shadowToolCalls, primaryLatencyMs, shadowLatencyMs, primaryCostUsd, shadowCostUsd, sessionId }) {
  try {
    const toolCallsMatch =
      JSON.stringify((primaryToolCalls || []).map(t => t.name).sort()) ===
      JSON.stringify((shadowToolCalls  || []).map(t => t.name).sort());

    await supabase.from('llm_shadow_logs').insert({
      primary_provider:    primaryProvider,
      shadow_provider:     shadowProvider,
      primary_text:        primaryText?.substring(0, 2000)  || null,
      shadow_text:         shadowText?.substring(0, 2000)   || null,
      primary_tool_calls:  primaryToolCalls?.length  > 0 ? primaryToolCalls  : null,
      shadow_tool_calls:   shadowToolCalls?.length   > 0 ? shadowToolCalls   : null,
      primary_latency_ms:  primaryLatencyMs,
      shadow_latency_ms:   shadowLatencyMs,
      primary_cost_usd:    primaryCostUsd || null,
      shadow_cost_usd:     shadowCostUsd  || null,
      tool_calls_match:    toolCallsMatch,
      session_id:          sessionId || null
    });
  } catch (err) {
    console.warn('⚠️ logShadowComparison failed (non-fatal):', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// PUBLIC ENTRY POINT
// Returns a normalized object:
// { text, toolCalls, usage: {inputTokens, outputTokens}, stopReason, rawContent, meta }
// rawContent is always in Claude canonical format for message history.
// ─────────────────────────────────────────────────────────────
async function callLLM(systemPrompt, messages, tools, { sessionId, phoneNumber, maxTokens } = {}) {
  const primaryProvider = CONFIG.provider;
  const originalProvider = primaryProvider;
  let normalized;
  let wasFallback = false;

  try {
    normalized = await dispatchToProvider(primaryProvider, systemPrompt, messages, tools, { maxTokens });
  } catch (primaryErr) {
    console.error(`❌ Primary LLM provider (${primaryProvider}) failed:`, primaryErr.message);

    if (CONFIG.fallback && CONFIG.fallback !== primaryProvider) {
      console.log(`🔄 Falling back to ${CONFIG.fallback}...`);
      try {
        normalized = await dispatchToProvider(CONFIG.fallback, systemPrompt, messages, tools, { maxTokens });
        wasFallback = true;
        normalized.meta.provider = CONFIG.fallback;
      } catch (fallbackErr) {
        console.error(`❌ Fallback LLM provider (${CONFIG.fallback}) also failed:`, fallbackErr.message);
        throw primaryErr;
      }
    } else {
      throw primaryErr;
    }
  }

  // Fire-and-forget usage logging
  logLLMCall({
    provider: normalized.meta.provider,
    originalProvider,
    wasFallback,
    inputTokens: normalized.usage.inputTokens,
    outputTokens: normalized.usage.outputTokens,
    costUSD: normalized.meta.costUSD,
    latencyMs: normalized.meta.latencyMs,
    toolCalls: normalized.toolCalls,
    sessionId,
    phoneNumber
  });

  // Shadow mode: run asynchronously, never blocks primary response
  if (CONFIG.shadowMode && CONFIG.shadowProvider && CONFIG.shadowProvider !== primaryProvider) {
    (async () => {
      try {
        const shadow = await dispatchToProvider(CONFIG.shadowProvider, systemPrompt, messages, tools);
        logShadowComparison({
          primaryProvider: normalized.meta.provider,
          shadowProvider:  CONFIG.shadowProvider,
          primaryText:     normalized.text,
          shadowText:      shadow.text,
          primaryToolCalls: normalized.toolCalls,
          shadowToolCalls:  shadow.toolCalls,
          primaryLatencyMs: normalized.meta.latencyMs,
          shadowLatencyMs:  shadow.meta.latencyMs,
          primaryCostUsd:   normalized.meta.costUSD,
          shadowCostUsd:    shadow.meta.costUSD,
          sessionId
        });
      } catch (shadowErr) {
        console.warn(`⚠️ Shadow provider (${CONFIG.shadowProvider}) failed:`, shadowErr.message);
      }
    })();
  }

  return normalized;
}

// ─────────────────────────────────────────────────────────────
// STREAMING CLAUDE PROVIDER
// Uses anthropic.messages.stream() — calls onTextDelta for each
// text chunk, then returns the same normalized result as callClaude.
// ─────────────────────────────────────────────────────────────
async function callClaudeStream(systemPrompt, messages, tools, { maxTokens } = {}, onTextDelta) {
  const start = Date.now();
  const stream = anthropic.messages.stream({
    model: CONFIG.models.claude,
    max_tokens: maxTokens || 1024,
    system: systemPrompt,
    tools,
    messages
  });

  let fullText = '';
  stream.on('text', (text) => {
    fullText += text;
    if (onTextDelta) onTextDelta(text);
  });

  const response = await stream.finalMessage();
  const latencyMs = Date.now() - start;

  const inputTokens  = response.usage?.input_tokens  || 0;
  const outputTokens = response.usage?.output_tokens || 0;

  const toolCalls = response.content
    .filter(b => b.type === 'tool_use')
    .map(b => ({ id: b.id, name: b.name, input: b.input }));

  return {
    text: fullText || response.content.filter(b => b.type === 'text').map(b => b.text).join('\n\n'),
    toolCalls,
    usage: { inputTokens, outputTokens },
    stopReason: response.stop_reason,
    rawContent: response.content,
    meta: {
      provider: 'claude',
      costUSD: calculateCost('claude', inputTokens, outputTokens),
      latencyMs
    }
  };
}

// ─────────────────────────────────────────────────────────────
// PUBLIC STREAMING ENTRY POINT
// Same contract as callLLM but calls onTextDelta(text) for each
// text chunk as it arrives. Non-Claude providers fall back to
// non-streaming and emit the full text as a single callback.
// ─────────────────────────────────────────────────────────────
async function callLLMStream(systemPrompt, messages, tools, { sessionId, phoneNumber, maxTokens } = {}, onTextDelta) {
  const primaryProvider = CONFIG.provider;
  const originalProvider = primaryProvider;
  let normalized;
  let wasFallback = false;

  try {
    if (primaryProvider === 'claude') {
      normalized = await callClaudeStream(systemPrompt, messages, tools, { maxTokens }, onTextDelta);
    } else {
      normalized = await callOpenAICompat(primaryProvider, systemPrompt, messages, tools);
      if (onTextDelta && normalized.text) onTextDelta(normalized.text);
    }
  } catch (primaryErr) {
    console.error(`❌ Primary LLM provider (${primaryProvider}) failed (stream):`, primaryErr.message);

    if (CONFIG.fallback && CONFIG.fallback !== primaryProvider) {
      console.log(`🔄 Falling back to ${CONFIG.fallback} (stream)...`);
      try {
        normalized = await dispatchToProvider(CONFIG.fallback, systemPrompt, messages, tools);
        wasFallback = true;
        normalized.meta.provider = CONFIG.fallback;
        if (onTextDelta && normalized.text) onTextDelta(normalized.text);
      } catch (fallbackErr) {
        console.error(`❌ Fallback LLM provider (${CONFIG.fallback}) also failed (stream):`, fallbackErr.message);
        throw primaryErr;
      }
    } else {
      throw primaryErr;
    }
  }

  // Fire-and-forget usage logging
  logLLMCall({
    provider: normalized.meta.provider,
    originalProvider,
    wasFallback,
    inputTokens: normalized.usage.inputTokens,
    outputTokens: normalized.usage.outputTokens,
    costUSD: normalized.meta.costUSD,
    latencyMs: normalized.meta.latencyMs,
    toolCalls: normalized.toolCalls,
    sessionId,
    phoneNumber
  });

  return normalized;
}

module.exports = { callLLM, callLLMStream, convertToolsToOpenAI, CONFIG };
