// handleConversation.js
// Main conversation handler — calls LLM via gateway with tools

const { supabase, CUSTOMER_CARE_PHONE } = require('../shared');
const { callLLM, callLLMStream } = require('./llmGateway');
const { buildSystemPrompt, claudeTools, isTechnicalQuery, trackTokenUsage, loadConfig } = require('./promptBuilder');
const { processToolCall, resolveOrderingCustomer } = require('../tools/toolHandlers');

// ─────────────────────────────────────────────────────────────
// PRE-SEARCH: Detect product queries and run search BEFORE
// calling the LLM, so we can inject results and skip LLM call #1.
// Saves ~2-3s per product query by eliminating a round-trip.
// ─────────────────────────────────────────────────────────────
const PRESEARCH_PRODUCT_RE = /\b(pump|filter|brake|clutch|bearing|gasket|belt|seal|pad|disc|drum|rotor|injector|valve|ring|piston|alternator|starter|radiator|sensor|spring|shock|bushing|kit|assembly|coolant|wiper|cable|chain|sprocket|headlight|mirror|horn|tyre|tire|wheel|hub|oil|engine|suspension|spare)\b/i;
const PRESEARCH_BLOCK_RE = /\b(add|cart|order|checkout|confirm|cancel|status|place|book|done|buy|purchase|history|my orders|remove|delete|image|photo|picture)\b/i;
const PRESEARCH_VEHICLE_RE = /\b(bolero|scorpio|thar|xuv\s*\d*|nexon|swift|baleno|brezza|innova|fortuner|creta|venue|i20|i10|alto|dzire|ertiga|vitara|ecosport|duster|kwid|ciaz|ignis|wagon\s*r|seltos|sonet|punch|harrier|safari|altroz|tigor|tiago|marazzo|xylo|kuv|pik.?up)\b/i;
const PRESEARCH_STOP_RE = /\b(show|me|find|search|look|looking|for|my|the|a|an|i|need|want|get|please|can|you|with|in|of|do|have|some|give|list|all|display|check|see|any|good|best|about|also|too)\b/gi;

function extractProductSearches(message) {
  if (!PRESEARCH_PRODUCT_RE.test(message)) return null;
  if (PRESEARCH_BLOCK_RE.test(message)) return null;

  const vehicleMatch = message.match(PRESEARCH_VEHICLE_RE);
  const vehicleModel = vehicleMatch ? vehicleMatch[0] : null;

  let cleaned = message;
  if (vehicleModel) {
    cleaned = cleaned.replace(new RegExp(`\\b${vehicleModel}\\b`, 'gi'), '');
  }

  const parts = cleaned.split(/\band\b|,/)
    .map(p => p.replace(PRESEARCH_STOP_RE, '').replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 1);

  if (parts.length === 0) return null;
  return { parts, vehicleModel };
}

async function runPreSearch(searches, session) {
  const { parts, vehicleModel } = searches;
  try {
    if (parts.length === 1) {
      const result = await processToolCall('search_products', {
        keyword: parts[0],
        ...(vehicleModel ? { vehicle_model: vehicleModel } : {})
      }, session);
      return {
        toolName: 'search_products',
        toolInput: { keyword: parts[0], ...(vehicleModel ? { vehicle_model: vehicleModel } : {}) },
        result
      };
    }
    // Multiple items → parallel bulk search
    const items = parts.map(p => ({ query: vehicleModel ? `${p} ${vehicleModel}` : p }));
    const result = await processToolCall('bulk_search_products', { items }, session);
    return { toolName: 'bulk_search_products', toolInput: { items }, result };
  } catch (err) {
    console.error('[pre-search] failed:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Summarize a tool result into a short human-readable log entry.
// This is stored in conversation_logs so future turns can see
// what product codes were returned (enabling partial number matching).
// Max 200 characters per summary.
// ─────────────────────────────────────────────────────────────
function summarizeToolResult(toolName, toolInput, result) {
  try {
    // Don't log failed calls — they add noise and no useful context
    if (!result.success && !result.awaitingDecision) return null;

    switch (toolName) {
      case 'search_products': {
        const products = result.products || [];
        if (products.length === 0) return '[Results: no products found]';
        const currency = result.price_currency === 'NPR' ? 'NPR' : '₹';
        const items = products.slice(0, 3).map(p => {
          const price = p.final_price != null
            ? `${currency} ${Number(p.final_price).toLocaleString()}`
            : p.mrp_npr ? `NPR ${Number(p.mrp_npr).toLocaleString()}`
            : p.mrp_inr ? `₹${Number(p.mrp_inr).toLocaleString()}` : '';
          const avail = (p.availability || '').startsWith('Available') ? 'Available' : 'Check avail.';
          return `${p.name} (${p.product_code})${price ? ' ' + price : ''} - ${avail}`;
        });
        return `[Results: ${items.join(' | ')}]`.substring(0, 200);
      }

      case 'bulk_search_products': {
        const results = result.results || [];
        if (results.length === 0) return null;
        const items = results.slice(0, 6).map(r => {
          if (!r.found || !r.products?.length) return `${r.query}→not found`;
          return `${r.query}→${r.products[0].product_code}`;
        });
        return `[Bulk results: ${items.join(', ')}]`.substring(0, 200);
      }

      case 'add_to_cart': {
        const cart = result.cart || [];
        if (cart.length === 0) return null;
        // Show the last item added (most recently added is last in array)
        const last = cart[cart.length - 1];
        return `[Added: ${last.name} (${last.product_code}) x${last.quantity}]`.substring(0, 200);
      }

      case 'view_cart': {
        const s = result.summary;
        if (!s || s.itemCount === 0) return '[Cart: empty]';
        return `[Cart: ${s.itemCount} item(s), Total: NPR ${Number(s.total || 0).toLocaleString()}]`;
      }

      case 'place_order': {
        // Partial stock — awaiting customer decision, no order yet
        if (result.awaitingDecision) {
          const d = result.partialDetails;
          return `[Stock check: ${d?.productName} — only ${d?.availableQty} of ${d?.requestedQty} available, awaiting decision]`.substring(0, 200);
        }
        const order = result.order;
        if (!order) return null;
        // createOrder returns { orderNumber, total, ... } — note field is 'total' not 'totalAmount'
        const total = order.total ? `NPR ${Number(order.total).toLocaleString()}` : '';
        return `[Order: ${order.orderNumber}${total ? ' Total ' + total : ''}]`.substring(0, 200);
      }

      case 'check_order_status': {
        const order = result.order;
        if (!order) return '[Order status: not found]';
        return `[Order ${order.orderNumber}: ${order.status}]`.substring(0, 200);
      }

      case 'get_my_orders': {
        const orders = result.orders || [];
        if (orders.length === 0) return '[No recent orders found]';
        const nums = orders.slice(0, 3)
          .map(o => o.order_number || o.orderNumber)
          .filter(Boolean);
        return `[Recent orders: ${nums.join(', ')}]`.substring(0, 200);
      }

      case 'learn_product_term': {
        return `[Saved term: "${toolInput.input_term}" → "${toolInput.mapped_to}"]`.substring(0, 200);
      }

      case 'lookup_knowledge': {
        if (!result.found) return `[Knowledge lookup: "${toolInput.term}" — no match]`.substring(0, 200);
        const match = result.matches?.[0];
        return `[Knowledge: "${toolInput.term}" → "${match?.mapped_to || '?'}"]`.substring(0, 200);
      }

      case 'get_product_image': {
        return result.image_url ? `[Image fetched: ${result.product_name}]`.substring(0, 200) : null;
      }

      default:
        return null;
    }
  } catch (e) {
    // Never let summarization errors surface
    return null;
  }
}

// Fire-and-forget: write a tool result summary to conversation_logs.
// Errors are swallowed — logging must never block the conversation.
function logToolSummary(session, summary) {
  if (!summary || !session.sessionId) return;
  supabase.from('conversation_logs').insert({
    session_id: session.sessionId,
    phone_number: session.phoneNumber,
    customer_id: session.customer?.id || null,
    message_type: 'bot',
    message_text: summary,
    language: 'en'
  }).then(({ error }) => {
    if (error) console.warn('⚠️ logToolSummary failed (non-fatal):', error.message);
  });
}

async function handleConversation(userMessage, session, conversationHistory = [], { maxTokens } = {}) {
  let imageResult = null; // Track image fetch result for WhatsApp delivery
  try {
    // For employee sessions: resolve the customer they're acting for
    if (session.isEmployee && session.customerForEmployee) {
      const resolvedCustomer = await resolveOrderingCustomer(session, supabase);
      if (resolvedCustomer) {
        // Inject as session.customer so all downstream logic works
        session.customer = resolvedCustomer;
        session.actingForCustomer = resolvedCustomer; // keep reference
      }
    }

    console.log('🤖 LLM processing message...');

    // Detect product queries and pre-search in parallel with prompt building
    const searches = extractProductSearches(userMessage);
    const _tPrompt = Date.now();
    const [systemPrompt, preSearch] = await Promise.all([
      buildSystemPrompt(session, conversationHistory),
      searches ? runPreSearch(searches, session) : Promise.resolve(null)
    ]);
    try { console.log('[PERF] prompt+presearch:', (Date.now() - _tPrompt) + 'ms'); } catch(e) {}

    let messages;
    let _llmCall = 0;

    if (preSearch && preSearch.result && preSearch.result.success !== false) {
      // Pre-search hit — inject as pre-filled tool results, skip LLM call #1
      const preId = 'presearch_1';
      messages = [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: [
          { type: 'tool_use', id: preId, name: preSearch.toolName, input: preSearch.toolInput }
        ]},
        { role: 'user', content: [
          { type: 'tool_result', tool_use_id: preId, content: JSON.stringify(preSearch.result) }
        ]}
      ];
      console.log(`[pre-search] Injected ${preSearch.toolName} results, skipping LLM call #1`);
      const summary = summarizeToolResult(preSearch.toolName, preSearch.toolInput, preSearch.result);
      logToolSummary(session, summary);
    } else {
      messages = [{ role: 'user', content: userMessage }];
    }

    const llmOpts = { sessionId: session.sessionId, phoneNumber: session.phoneNumber, maxTokens };

    _llmCall++;
    let normalized = await callLLM(systemPrompt, messages, claudeTools, llmOpts);
    try { console.log(`[PERF] llm#${_llmCall}: ${normalized.meta.latencyMs}ms (model=${normalized.meta.provider}, in=${normalized.usage.inputTokens}, out=${normalized.usage.outputTokens})`); } catch(e) {}

    // Accumulate token usage across all LLM calls in this conversation turn
    let totalInputTokens  = normalized.usage.inputTokens;
    let totalOutputTokens = normalized.usage.outputTokens;

    console.log('📝 LLM response received, stop_reason:', normalized.stopReason);

    while (normalized.stopReason === 'tool_use') {
      console.log(`🔧 LLM wants to use ${normalized.toolCalls.length} tool(s)`);

      // Execute all tool calls in parallel when multiple are requested (saves ~200-500ms)
      const _tTools = Date.now();
      const toolResultsRaw = await Promise.all(normalized.toolCalls.map(async (toolCall) => {
        const _tTool = Date.now();
        const result = await processToolCall(toolCall.name, toolCall.input, session);
        try { console.log(`[PERF] tool(${toolCall.name}): ${Date.now() - _tTool}ms`); } catch(e) {}
        return { toolCall, result };
      }));
      console.log(`[PERF] all tools: ${Date.now() - _tTools}ms`);

      const toolResults = toolResultsRaw.map(({ toolCall, result }) => {
        if (toolCall.name === 'get_product_image' && result.success && result.image_url) {
          imageResult = result;
        }
        const summary = summarizeToolResult(toolCall.name, toolCall.input, result);
        logToolSummary(session, summary);
        return { type: 'tool_result', tool_use_id: toolCall.id, content: JSON.stringify(result) };
      });

      // rawContent is always in Claude canonical format regardless of provider
      messages.push({ role: 'assistant', content: normalized.rawContent });
      messages.push({ role: 'user', content: toolResults });

      _llmCall++;
      normalized = await callLLM(systemPrompt, messages, claudeTools, llmOpts);
      try { console.log(`[PERF] llm#${_llmCall}: ${normalized.meta.latencyMs}ms (model=${normalized.meta.provider}, in=${normalized.usage.inputTokens}, out=${normalized.usage.outputTokens})`); } catch(e) {}
      totalInputTokens  += normalized.usage.inputTokens;
      totalOutputTokens += normalized.usage.outputTokens;
      console.log('📝 LLM response after tool use, stop_reason:', normalized.stopReason);
    }

    const finalResponse = normalized.text;
    console.log('✅ Final response ready');

    // Fire-and-forget token tracking (non-blocking)
    const customerId = session.customer?.id || null;
    const msgIsTechnical = typeof userMessage === 'string' && isTechnicalQuery(userMessage);
    trackTokenUsage(customerId, totalInputTokens, totalOutputTokens, msgIsTechnical);

    return { response: finalResponse, updatedContext: session.context, imageResult };

  } catch (error) {
    console.error('❌ Error in handleConversation:', error);
    let errorMsg = `Sorry, I encountered an error. Please try again or contact us at ${CUSTOMER_CARE_PHONE}.`;
    try { const config = await loadConfig(); errorMsg = config.error_message || errorMsg; } catch(e) {}
    return { response: errorMsg, updatedContext: session.context, imageResult: null };
  }
}

// ─────────────────────────────────────────────────────────────
// STREAMING VARIANT
// Non-streaming for the first call and tool loop.
// Streaming (via callLLMStream + onChunk) for the final text
// response after all tool calls are resolved.
// ─────────────────────────────────────────────────────────────
async function handleConversationStream(userMessage, session, conversationHistory = [], onChunk) {
  let imageResult = null;
  try {
    if (session.isEmployee && session.customerForEmployee) {
      const resolvedCustomer = await resolveOrderingCustomer(session, supabase);
      if (resolvedCustomer) {
        session.customer = resolvedCustomer;
        session.actingForCustomer = resolvedCustomer;
      }
    }

    console.log('🤖 LLM processing message (stream)...');

    // Pre-search in parallel with prompt building
    const searches = extractProductSearches(userMessage);
    const _tPrompt = Date.now();
    const [systemPrompt, preSearch] = await Promise.all([
      buildSystemPrompt(session, conversationHistory),
      searches ? runPreSearch(searches, session) : Promise.resolve(null)
    ]);
    try { console.log('[PERF] prompt+presearch:', (Date.now() - _tPrompt) + 'ms'); } catch(e) {}

    const llmOpts = { sessionId: session.sessionId, phoneNumber: session.phoneNumber };
    let messages;
    let _llmCall = 0;

    if (preSearch && preSearch.result && preSearch.result.success !== false) {
      const preId = 'presearch_1';
      messages = [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: [
          { type: 'tool_use', id: preId, name: preSearch.toolName, input: preSearch.toolInput }
        ]},
        { role: 'user', content: [
          { type: 'tool_result', tool_use_id: preId, content: JSON.stringify(preSearch.result) }
        ]}
      ];
      console.log(`[pre-search] Injected ${preSearch.toolName} results (stream), skipping LLM call #1`);
      const summary = summarizeToolResult(preSearch.toolName, preSearch.toolInput, preSearch.result);
      logToolSummary(session, summary);

      // Stream the final response directly
      _llmCall++;
      let streamedText = '';
      let normalized = await callLLMStream(systemPrompt, messages, claudeTools, llmOpts, (text) => {
        onChunk(text);
        streamedText += text;
      });
      try { console.log(`[PERF] llm#${_llmCall} (stream): ${normalized.meta.latencyMs}ms (model=${normalized.meta.provider}, in=${normalized.usage.inputTokens}, out=${normalized.usage.outputTokens})`); } catch(e) {}
      const customerId = session.customer?.id || null;
      trackTokenUsage(customerId, normalized.usage.inputTokens, normalized.usage.outputTokens, isTechnicalQuery(userMessage));
      return { response: streamedText, updatedContext: session.context, imageResult };
    }

    messages = [{ role: 'user', content: userMessage }];

    // First call: non-streaming (likely tool_use for product queries)
    _llmCall++;
    let normalized = await callLLM(systemPrompt, messages, claudeTools, llmOpts);
    try { console.log(`[PERF] llm#${_llmCall}: ${normalized.meta.latencyMs}ms (model=${normalized.meta.provider}, in=${normalized.usage.inputTokens}, out=${normalized.usage.outputTokens})`); } catch(e) {}

    let totalInputTokens  = normalized.usage.inputTokens;
    let totalOutputTokens = normalized.usage.outputTokens;

    // No tool use — emit full text as single chunk
    if (normalized.stopReason !== 'tool_use') {
      onChunk(normalized.text);
      const customerId = session.customer?.id || null;
      trackTokenUsage(customerId, totalInputTokens, totalOutputTokens, isTechnicalQuery(userMessage));
      return { response: normalized.text, updatedContext: session.context, imageResult };
    }

    // Tool loop: non-streaming for tool-use turns
    while (normalized.stopReason === 'tool_use') {
      console.log(`🔧 LLM wants to use ${normalized.toolCalls.length} tool(s) (stream)`);

      // Execute all tool calls in parallel
      const _tTools = Date.now();
      const toolResultsRaw = await Promise.all(normalized.toolCalls.map(async (toolCall) => {
        const _tTool = Date.now();
        const result = await processToolCall(toolCall.name, toolCall.input, session);
        try { console.log(`[PERF] tool(${toolCall.name}): ${Date.now() - _tTool}ms`); } catch(e) {}
        return { toolCall, result };
      }));
      console.log(`[PERF] all tools (stream): ${Date.now() - _tTools}ms`);

      const toolResults = toolResultsRaw.map(({ toolCall, result }) => {
        if (toolCall.name === 'get_product_image' && result.success && result.image_url) {
          imageResult = result;
        }
        const summary = summarizeToolResult(toolCall.name, toolCall.input, result);
        logToolSummary(session, summary);
        return { type: 'tool_result', tool_use_id: toolCall.id, content: JSON.stringify(result) };
      });

      messages.push({ role: 'assistant', content: normalized.rawContent });
      messages.push({ role: 'user', content: toolResults });

      // Post-tool call: use streaming (likely the final text response)
      _llmCall++;
      let streamedText = '';
      normalized = await callLLMStream(systemPrompt, messages, claudeTools, llmOpts, (text) => {
        onChunk(text);
        streamedText += text;
      });
      try { console.log(`[PERF] llm#${_llmCall} (stream): ${normalized.meta.latencyMs}ms (model=${normalized.meta.provider}, in=${normalized.usage.inputTokens}, out=${normalized.usage.outputTokens})`); } catch(e) {}
      totalInputTokens  += normalized.usage.inputTokens;
      totalOutputTokens += normalized.usage.outputTokens;

      if (normalized.stopReason !== 'tool_use') {
        // Final text was streamed
        const customerId = session.customer?.id || null;
        trackTokenUsage(customerId, totalInputTokens, totalOutputTokens, isTechnicalQuery(userMessage));
        return { response: streamedText, updatedContext: session.context, imageResult };
      }
      // Rare: another tool_use after streaming text — continue loop
    }

  } catch (error) {
    console.error('❌ Error in handleConversationStream:', error);
    let errorMsg = `Sorry, I encountered an error. Please try again or contact us at ${CUSTOMER_CARE_PHONE}.`;
    try { const config = await loadConfig(); errorMsg = config.error_message || errorMsg; } catch(e) {}
    onChunk(errorMsg);
    return { response: errorMsg, updatedContext: session.context, imageResult: null };
  }
}

module.exports = { handleConversation, handleConversationStream };
