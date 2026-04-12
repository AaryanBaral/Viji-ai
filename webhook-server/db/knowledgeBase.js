// knowledgeBase.js
// Self-learning knowledge base for local language terms, typos, and partial part numbers
//
// ============================================================
// Supabase table: product_knowledge
// ============================================================
// Run this SQL in Supabase SQL Editor to create the table:
//
// CREATE TABLE product_knowledge (
//   id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   type        TEXT NOT NULL CHECK (type IN ('local_term', 'typo_pattern', 'partial_match')),
//   input_term  TEXT NOT NULL,
//   mapped_to   TEXT NOT NULL,
//   product_id  UUID NULLABLE REFERENCES products(id) ON DELETE SET NULL,
//   region      TEXT NULLABLE,
//   language    TEXT NULLABLE,
//   confidence  INTEGER NOT NULL DEFAULT 1,
//   created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
//   updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
//   created_by  TEXT NULLABLE
// );
//
// CREATE INDEX idx_product_knowledge_input_term ON product_knowledge(input_term);
// CREATE INDEX idx_product_knowledge_type ON product_knowledge(type);
// ============================================================

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Look up a term in the product_knowledge table.
 * Checks for exact match first, then partial match.
 * Returns matches sorted by confidence desc.
 * @param {string} term - The customer's search term (will be lowercased)
 * @returns {Promise<Array>} Array of knowledge entries
 */
async function lookupKnowledge(term) {
  if (!term || typeof term !== 'string') return [];
  const lowerTerm = term.toLowerCase().trim();
  if (!lowerTerm) return [];

  try {
    // Exact match first (faster)
    const { data: exactData, error: exactError } = await supabase
      .from('product_knowledge')
      .select('*')
      .ilike('input_term', lowerTerm)
      .order('confidence', { ascending: false })
      .limit(5);

    if (!exactError && exactData && exactData.length > 0) {
      console.log(`📚 Knowledge exact match for "${lowerTerm}": ${exactData.length} result(s)`);
      return exactData;
    }

    // Partial match: input_term contains the term OR term contains input_term
    const { data: partialData, error: partialError } = await supabase
      .from('product_knowledge')
      .select('*')
      .or(`input_term.ilike.%${lowerTerm}%`)
      .order('confidence', { ascending: false })
      .limit(5);

    if (!partialError && partialData && partialData.length > 0) {
      console.log(`📚 Knowledge partial match for "${lowerTerm}": ${partialData.length} result(s)`);
      return partialData;
    }

    return [];
  } catch (err) {
    console.error('❌ lookupKnowledge error:', err.message);
    return [];
  }
}

/**
 * Save a new knowledge entry. If same input_term + mapped_to already exists,
 * increments confidence and updates updated_at instead of creating a duplicate.
 * @param {Object} params
 * @param {string} params.type - 'local_term' | 'typo_pattern' | 'partial_match'
 * @param {string} params.inputTerm - What the customer typed (will be lowercased)
 * @param {string} params.mappedTo - The correct product name, part number, or standard term
 * @param {string} [params.productId] - Product UUID if directly linked
 * @param {string} [params.region] - e.g., 'nepal', 'india_tamil', 'india_bengal', 'india_hindi', 'sri_lanka'
 * @param {string} [params.language] - e.g., 'nepali', 'tamil', 'bengali', 'hindi', 'sinhala'
 * @param {string} [params.createdBy] - e.g., 'bot_learned', 'admin_added'
 * @returns {Promise<Object>} The saved or updated entry
 */
async function saveKnowledge({ type, inputTerm, mappedTo, productId = null, region = null, language = null, createdBy = 'bot_learned' }) {
  if (!type || !inputTerm || !mappedTo) {
    throw new Error('saveKnowledge: type, inputTerm, and mappedTo are required');
  }

  const lowerInput = inputTerm.toLowerCase().trim();

  try {
    // Check if entry already exists
    const { data: existing, error: checkError } = await supabase
      .from('product_knowledge')
      .select('id, confidence')
      .ilike('input_term', lowerInput)
      .ilike('mapped_to', mappedTo)
      .limit(1)
      .single();

    if (!checkError && existing) {
      // Increment confidence
      const { data: updated, error: updateError } = await supabase
        .from('product_knowledge')
        .update({
          confidence: existing.confidence + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) throw updateError;
      console.log(`📚 Knowledge confidence incremented for "${lowerInput}" → "${mappedTo}" (now: ${updated.confidence})`);
      return updated;
    }

    // Insert new entry
    const { data: inserted, error: insertError } = await supabase
      .from('product_knowledge')
      .insert({
        type,
        input_term: lowerInput,
        mapped_to: mappedTo,
        product_id: productId || null,
        region: region || null,
        language: language || null,
        confidence: 1,
        created_by: createdBy || 'bot_learned',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) throw insertError;
    console.log(`📚 New knowledge saved: "${lowerInput}" → "${mappedTo}" (type: ${type}, region: ${region})`);
    return inserted;
  } catch (err) {
    console.error('❌ saveKnowledge error:', err.message);
    throw err;
  }
}

/**
 * Search products table for a partial part number using ILIKE substring match.
 * Use when customer types a short alphanumeric string (3-6 chars) that could be
 * part of a full part number (e.g., "767" matching "WPA767TRP").
 * @param {string} partialNumber - The partial part number to search for
 * @returns {Promise<Array>} Matching products
 */
async function lookupPartialPartNumber(partialNumber) {
  if (!partialNumber || typeof partialNumber !== 'string') return [];
  const cleaned = partialNumber.trim();
  if (cleaned.length < 3) return [];

  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .or(`product_code.ilike.%${cleaned}%,alt_part_no.ilike.%${cleaned}%,oem_number.ilike.%${cleaned}%`)
      .limit(10);

    if (error) throw error;
    console.log(`🔢 Partial part number "${cleaned}" matched ${(data || []).length} products`);
    return data || [];
  } catch (err) {
    console.error('❌ lookupPartialPartNumber error:', err.message);
    return [];
  }
}

/**
 * Extract quantity from messy customer input and return cleaned query + quantity.
 * Handles patterns like: "2 pc", "2 pcs", "x2", "× 2", "2 nos", "qty:2", "2 wota" etc.
 * Also handles Nepali/Hindi: "2 wota", "2 ota", "2 dana", "2 ta"
 * @param {string} text - Raw customer input
 * @returns {{ cleanedQuery: string, quantity: number }}
 */
function extractQuantityFromMessage(text) {
  if (!text || typeof text !== 'string') return { cleanedQuery: '', quantity: 1 };

  let str = text.trim();
  let quantity = 1;

  // Patterns to detect quantity (order matters — more specific first)
  const qtyPatterns = [
    // "qty:2", "qty 2", "qty=2"
    /\bqty[\s:=]+(\d+)\b/i,
    // "x2", "×2", "x 2", "× 2"
    /[x×]\s*(\d+)\b/i,
    // "2x", "2×"
    /\b(\d+)\s*[x×]\b/i,
    // "2 pcs", "2 pc", "2 pic", "2 pics", "2 piece", "2 pieces"
    /\b(\d+)\s*(?:pcs?|pics?|pieces?)\b/i,
    // "2 nos", "2 no"
    /\b(\d+)\s*nos?\b/i,
    // Nepali/Hindi: "2 wota", "2 ota", "2 dana", "2 ta"
    /\b(\d+)\s*(?:wota|ota|dana|ta)\b/i,
    // "2 number", "2 num"
    /\b(\d+)\s*num(?:ber)?\b/i,
    // Trailing or leading bare number when combined with text (lowest priority)
    // e.g., "767 2" — only match if there's non-numeric content elsewhere
  ];

  for (const pattern of qtyPatterns) {
    const match = str.match(pattern);
    if (match) {
      const parsedQty = parseInt(match[1], 10);
      if (!isNaN(parsedQty) && parsedQty > 0) {
        quantity = parsedQty;
        // Remove the matched quantity phrase from the string
        str = str.replace(match[0], '').trim();
        break;
      }
    }
  }

  // Clean up leftover punctuation/separators
  str = str.replace(/^[-,\s]+|[-,\s]+$/g, '').trim();

  return { cleanedQuery: str, quantity };
}

module.exports = {
  lookupKnowledge,
  saveKnowledge,
  lookupPartialPartNumber,
  extractQuantityFromMessage
};
