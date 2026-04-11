// productService.js
// Product and workshop search functions

const { supabase } = require('../shared');
const { getEmbedding } = require('../db/embeddingService');
const { lookupKnowledge, extractQuantityFromMessage } = require('../db/knowledgeBase');

// Known Mahindra model names — used in smart search fallback to strip model from query
const MAHINDRA_MODELS = [
  'bolero neo', 'scorpio classic', 'scorpio n', 'xuv 700', 'xuv 500', 'xuv 400', 'xuv 300',
  'kuv 100', 'pik up', '475 di', '575 di', 'mahindra 600',
  'scorpio', 'bolero', 'thar', 'xuv700', 'xuv500', 'xuv400', 'xuv300',
  'xylo', 'marazzo', 'alturas', 'kuv100', 'verito', 'quanto', 'genio',
  'maxximo', 'supro', 'alfa', 'jeeto', 'imperio', 'tourister',
  'e2o', 'treo', 'di', 'arjun', 'jivo', 'novo'
];

async function searchProducts(params = {}, session = null) {
  const _tSearch = Date.now();
  try {
    let { vehicle_make, vehicle_model, category, product_code, keyword, brand, oem_number, segment } = params;
    console.log('🔍 Searching products with:', params);

    // Workshop segment filter: apply when caller is a workshop and didn't explicitly specify a segment
    const applyWorkshopSegmentFilter = session?.isWorkshop && session?.workshopSegment && !segment;
    if (applyWorkshopSegmentFilter) {
      console.log(`🏭 Workshop segment filter: ${session.workshopSegment} | MUV/PC`);
    }

    // Customer segment for result ranking (from customer profile, e.g. HCV/LCV/MUV/PC)
    const customerSegment = session?.customer?.segment || null;

    // --- STEP 0: Input normalization & type detection ---
    const rawSearchTerm = keyword || oem_number || product_code || '';
    const trimmed = rawSearchTerm.trim();
    // Strip all non-alphanumeric chars (hyphens, spaces, slashes, dots, brackets, commas)
    const normalized = trimmed.replace(/[^a-zA-Z0-9]/g, '');

    // Detect input type:
    //   PURE_NUMERIC  — only digits (e.g. '1024', '0830', '0809291')
    //   ALPHANUMERIC  — mix of letters + digits (e.g. 'BTH1024', '0703AAK00370N')
    //   TEXT          — all letters or multi-word phrase (e.g. 'clutch plate', 'bolero')
    let inputType = 'TEXT';
    if (normalized.length >= 3) {
      if (/^[0-9]+$/.test(normalized)) {
        inputType = 'PURE_NUMERIC';
      } else if (/[a-zA-Z]/.test(normalized) && /[0-9]/.test(normalized)) {
        inputType = 'ALPHANUMERIC';
      }
    }
    if (trimmed) console.log(`[search] Input: "${trimmed}" | Normalized: "${normalized}" | Type: ${inputType}`);

    // Helper: apply segment-aware ranking + movement sort + dedup + map to response shape
    function applyRankingAndDedup(products) {
      let ranked = [...products];
      if (customerSegment) {
        // Matching-segment products first; within each group sort by movement
        const movOrder = { 'F': 0, 'M': 1, 'S': 2 };
        ranked.sort((a, b) => {
          const aSegMatch = (a.segment === customerSegment) ? 0 : 1;
          const bSegMatch = (b.segment === customerSegment) ? 0 : 1;
          if (aSegMatch !== bSegMatch) return aSegMatch - bSegMatch;
          return (movOrder[a.movement] ?? 3) - (movOrder[b.movement] ?? 3);
        });
      } else {
        ranked = sortByMovement(ranked);
      }
      return deduplicateResults(ranked.map(product => ({
        ...product,
        availability: getAvailabilityStatus(product.stock_quantity),
        stock_quantity: undefined
      })));
    }

    // --- STEP 1: Exact match on part number columns ---
    // Try both original trimmed input and normalized (symbols stripped) form
    if (trimmed && inputType !== 'TEXT') {
      const exactCandidates = [trimmed];
      if (normalized !== trimmed && normalized.length >= 3) exactCandidates.push(normalized);

      for (const candidate of exactCandidates) {
        const _tExact = Date.now();
        const { data: exactData, error: exactError } = await supabase
          .from('products').select('*').eq('is_active', true)
          .or(`product_code.ilike.${candidate},alt_part_no.ilike.${candidate},oem_number.ilike.${candidate}`)
          .limit(10);
        console.log('[PERF] search.exact:', (Date.now() - _tExact) + 'ms');
        if (!exactError && exactData && exactData.length > 0) {
          console.log(`[search] Found via: step1-exact (candidate: "${candidate}") → ${exactData.length} results`);
          console.log('[PERF] search.total:', (Date.now() - _tSearch) + 'ms');
          return applyRankingAndDedup(exactData);
        }
      }
    }

    // --- STEP 2: Smart partial match based on input type ---
    if (inputType === 'PURE_NUMERIC' || inputType === 'ALPHANUMERIC') {
      const isPureNumericShort = inputType === 'PURE_NUMERIC' && normalized.length <= 4;
      const isPureNumericLong  = inputType === 'PURE_NUMERIC' && normalized.length >= 5;

      // Pure numeric 3–4 digits: substring match — '0830' finds '0703AAK00830N'
      if (isPureNumericShort) {
        const _tNum = Date.now();
        const { data: numData, error: numError } = await supabase
          .from('products').select('*').eq('is_active', true)
          .or(`product_code.ilike.%${normalized}%,alt_part_no.ilike.%${normalized}%,oem_number.ilike.%${normalized}%`)
          .limit(20);
        console.log('[PERF] search.numeric-partial:', (Date.now() - _tNum) + 'ms');
        if (!numError && numData && numData.length > 0) {
          console.log(`[search] Found via: step2-numeric (${normalized}) → ${numData.length} results`);
          console.log('[PERF] search.total:', (Date.now() - _tSearch) + 'ms');
          return applyRankingAndDedup(numData);
        }
      }

      // Alphanumeric or pure numeric 5+: try normalized, then original trimmed (if different),
      // then numeric suffix (last 4+ digits stripped of leading alpha prefix, e.g. 'bth1024' → '1024')
      if (inputType === 'ALPHANUMERIC' || isPureNumericLong) {
        const partialCandidates = new Set([normalized]);
        if (trimmed !== normalized && trimmed.length >= 3) partialCandidates.add(trimmed);
        const numericSuffix = normalized.replace(/^[a-zA-Z]+/, '');
        if (numericSuffix && numericSuffix.length >= 4 && numericSuffix !== normalized) {
          partialCandidates.add(numericSuffix);
        }

        for (const term of partialCandidates) {
          const _tAlpha = Date.now();
          const { data: alphaData, error: alphaError } = await supabase
            .from('products').select('*').eq('is_active', true)
            .or(`product_code.ilike.%${term}%,alt_part_no.ilike.%${term}%,oem_number.ilike.%${term}%`)
            .limit(20);
          console.log('[PERF] search.alpha-partial:', (Date.now() - _tAlpha) + 'ms');
          if (!alphaError && alphaData && alphaData.length > 0) {
            console.log(`[search] Found via: step2-alpha (term: "${term}") → ${alphaData.length} results`);
            console.log('[PERF] search.total:', (Date.now() - _tSearch) + 'ms');
            return applyRankingAndDedup(alphaData);
          }
        }
      }
    }

    // --- STEP 3: Knowledge base lookup (translate local terms / fix typos) ---
    if (trimmed) {
      const knowledgeMatches = await lookupKnowledge(trimmed);
      if (knowledgeMatches && knowledgeMatches.length > 0) {
        const bestMatch = knowledgeMatches[0];
        console.log(`📚 Knowledge mapping: "${trimmed}" → "${bestMatch.mapped_to}"`);
        if (keyword) keyword = bestMatch.mapped_to;
        else if (oem_number) oem_number = bestMatch.mapped_to;
        else if (product_code) product_code = bestMatch.mapped_to;
      }
    }

    // Build query text for embedding
    const queryParts = [keyword, brand, vehicle_make, vehicle_model, category, product_code, oem_number]
      .filter(Boolean)
      .join(' ');

    // --- STEPS 4+5: Vector + keyword search IN PARALLEL ---
    // Both run concurrently; we prefer vector results, fall back to keyword.
    const _tParallel = Date.now();

    const vectorPromise = queryParts ? (async () => {
      try {
        const _tVec = Date.now();
        const queryEmbedding = await getEmbedding(queryParts);
        const { data, error } = await supabase.rpc('match_products_nim', {
          query_embedding: queryEmbedding,
          match_threshold: 0.3,
          match_count: 10
        });
        console.log('[PERF] search.vector:', (Date.now() - _tVec) + 'ms');
        if (error || !data) return [];
        return data;
      } catch (e) {
        console.error('⚠️ Vector search failed:', e.message);
        return [];
      }
    })() : Promise.resolve([]);

    const keywordPromise = (async () => {
      const _tKw = Date.now();
      let query = supabase.from('products').select('*').eq('is_active', true);
      if (vehicle_make) query = query.ilike('vehicle_make', `%${vehicle_make}%`);
      if (vehicle_model) query = query.ilike('vehicle_model', `%${vehicle_model}%`);
      if (category) query = query.ilike('category', `%${category}%`);
      if (product_code) query = query.or(`product_code.ilike.%${product_code}%,alt_part_no.ilike.%${product_code}%`);
      if (brand) query = query.ilike('brand', `%${brand}%`);
      if (oem_number) query = query.or(`oem_number.ilike.%${oem_number}%,product_code.ilike.%${oem_number}%,alt_part_no.ilike.%${oem_number}%`);
      if (keyword) query = query.or(`product_code.ilike.%${keyword}%,alt_part_no.ilike.%${keyword}%,oem_number.ilike.%${keyword}%,name.ilike.%${keyword}%`);
      if (segment) query = query.eq('segment', segment);
      else if (applyWorkshopSegmentFilter) query = query.or(`segment.eq.${session.workshopSegment},segment.eq.MUV/PC`);
      query = query.limit(10);
      const { data, error } = await query;
      console.log('[PERF] search.keyword:', (Date.now() - _tKw) + 'ms');
      if (error) { console.error('⚠️ Keyword search error:', error.message); return []; }
      return data || [];
    })();

    const [vectorResults, keywordResults] = await Promise.all([vectorPromise, keywordPromise]);
    console.log('[PERF] search.parallel:', (Date.now() - _tParallel) + 'ms');

    // Prefer vector results
    if (vectorResults.length > 0) {
      let filtered = [...vectorResults];
      if (applyWorkshopSegmentFilter) {
        filtered = filtered.filter(p => p.segment === session?.workshopSegment || p.segment === 'MUV/PC');
      }
      if (filtered.length > 0) {
        console.log(`[search] Found via: vector → ${filtered.length} results`);
        console.log('[PERF] search.total:', (Date.now() - _tSearch) + 'ms');
        return applyRankingAndDedup(filtered);
      }
    }

    // Fall back to keyword
    let result = applyRankingAndDedup(keywordResults);
    console.log(`[search] Found via: keyword → ${result.length} results`);

    // --- Smart fallback: strip Mahindra model name and retry with broad keyword ---
    if (result.length === 0 && keyword) {
      const lowerKeyword = keyword.toLowerCase();
      const sortedModels = [...MAHINDRA_MODELS].sort((a, b) => b.length - a.length);
      let foundModel = null;
      let broadKeyword = lowerKeyword;

      for (const model of sortedModels) {
        if (lowerKeyword.includes(model)) {
          foundModel = model;
          broadKeyword = lowerKeyword.replace(model, '').replace(/\s+/g, ' ').trim();
          break;
        }
      }

      if (foundModel && broadKeyword) {
        console.log(`🔄 Smart fallback: stripped model "${foundModel}", broad search for "${broadKeyword}"`);

        // Try vector broad search
        try {
          const broadEmbedding = await getEmbedding(broadKeyword);
          const { data: broadVectorData, error: broadVectorError } = await supabase
            .rpc('match_products_nim', {
              query_embedding: broadEmbedding,
              match_threshold: 0.3,
              match_count: 10
            });
          if (!broadVectorError && broadVectorData && broadVectorData.length > 0) {
            const broadResult = broadVectorData.map(p => ({
              ...p,
              broadSearch: true,
              modelHint: foundModel
            }));
            console.log(`[search] Found via: broad-vector (modelHint: ${foundModel}) → ${broadResult.length} results`);
            console.log('[PERF] search.total:', (Date.now() - _tSearch) + 'ms');
            return applyRankingAndDedup(broadResult);
          }
        } catch (e) {
          console.error('⚠️ Broad vector search failed:', e.message);
        }

        // Keyword broad search fallback
        const { data: broadData, error: broadError } = await supabase
          .from('products').select('*').eq('is_active', true)
          .or(`product_code.ilike.%${broadKeyword}%,alt_part_no.ilike.%${broadKeyword}%,oem_number.ilike.%${broadKeyword}%,name.ilike.%${broadKeyword}%`)
          .limit(10);
        if (!broadError && broadData && broadData.length > 0) {
          console.log(`[search] Found via: broad-keyword (modelHint: ${foundModel}) → ${broadData.length} results`);
          console.log('[PERF] search.total:', (Date.now() - _tSearch) + 'ms');
          return applyRankingAndDedup(broadData.map(p => ({
            ...p,
            broadSearch: true,
            modelHint: foundModel
          })));
        }

        console.log(`❌ Broad search also returned 0 results for "${broadKeyword}"`);
      }
    }

    console.log('[PERF] search.total:', (Date.now() - _tSearch) + 'ms');
    return result;
  } catch (error) {
    console.error('❌ Error in searchProducts:', error);
    return [];
  }
}

// Deduplicate results: remove products with same normalized product_code
// OR same product name + same price (handles variants like BTH-1024-AE vs BTH-1024 AE)
function deduplicateResults(results) {
  const seenCodes = new Set();
  const seenNamePrice = new Set();
  return results.filter(product => {
    const normCode = (product.product_code || '').toLowerCase().replace(/[-\s]/g, '');
    if (normCode && seenCodes.has(normCode)) return false;

    const nameKey = (product.name || '').toLowerCase().trim();
    const priceVal = product.mrp_inr || product.mrp_npr || '';
    const namePriceKey = nameKey + '|' + priceVal;
    if (nameKey && priceVal && seenNamePrice.has(namePriceKey)) return false;

    if (normCode) seenCodes.add(normCode);
    if (nameKey && priceVal) seenNamePrice.add(namePriceKey);
    return true;
  });
}

// Sort products by movement: F (fast) > M (medium) > S (slow) > null
function sortByMovement(products) {
  const movementOrder = { 'F': 0, 'M': 1, 'S': 2 };
  return [...products].sort((a, b) => {
    const aOrder = movementOrder[a.movement] ?? 3;
    const bOrder = movementOrder[b.movement] ?? 3;
    return aOrder - bOrder;
  });
}

function getAvailabilityStatus(stockQty) {
  if (stockQty === null || stockQty === undefined) return 'Check with us for availability';
  if (stockQty > 0) return 'Available';
  return 'Not in stock - we can check from the market and get back to you';
}

function calculatePrice(unitPrice, discountPercentage = 0) {
  const discount = (unitPrice * discountPercentage) / 100;
  return {
    originalPrice: unitPrice,
    discount,
    discountPercentage,
    finalPrice: unitPrice - discount
  };
}

async function searchWorkshops(params = {}) {
  try {
    const { city, district, zone, keyword } = params;
    console.log('🔍 Searching workshops with:', params);

    let query = supabase.from('workshops').select('*').eq('is_active', true);
    if (city) query = query.ilike('city', `%${city}%`);
    if (district) query = query.ilike('district', `%${district}%`);
    if (zone) query = query.ilike('zone', `%${zone}%`);
    if (keyword) query = query.or(`name.ilike.%${keyword}%,address.ilike.%${keyword}%,owner_name.ilike.%${keyword}%`);

    query = query.limit(10);
    const { data, error } = await query;
    if (error) throw error;

    console.log(`✅ Found ${(data || []).length} workshops`);
    return data || [];
  } catch (error) {
    console.error('❌ Error in searchWorkshops:', error);
    return [];
  }
}

async function bulkSearchProducts(items, session = null) {
  const limitedItems = (items || []).slice(0, 10);

  // Pre-process: filter empty queries and extract quantities
  const tasks = [];
  for (const item of limitedItems) {
    const rawQuery = (item.query || '').trim();
    if (!rawQuery) continue;

    const { cleanedQuery, quantity: parsedQty } = extractQuantityFromMessage(rawQuery);
    const effectiveQuery = cleanedQuery || rawQuery;
    const effectiveQty = item.qty || parsedQty || 1;
    tasks.push({ effectiveQuery, effectiveQty });
  }

  const bulkStart = Date.now();

  // Execute all searches concurrently
  const results = await Promise.all(
    tasks.map(({ effectiveQuery, effectiveQty }) =>
      searchProducts({ keyword: effectiveQuery }, session)
        .then(products => {
          const found = products.length > 0;
          const modelHint = found && products[0].modelHint ? products[0].modelHint : null;
          const broadSearch = found && products[0].broadSearch ? true : false;
          return {
            query: effectiveQuery,
            qty: effectiveQty,
            found,
            products,
            modelHint: modelHint || null,
            broadSearch: broadSearch || false
          };
        })
        .catch(err => ({
          query: effectiveQuery,
          qty: effectiveQty,
          found: false,
          products: [],
          error: err.message
        }))
    )
  );

  console.log(`[bulk] ${tasks.length} items in ${Date.now() - bulkStart}ms`);

  const foundCount = results.filter(r => r.found).length;
  return {
    results,
    summary: {
      total_searched: results.length,
      found: foundCount,
      not_found: results.length - foundCount
    }
  };
}

module.exports = { searchProducts, searchWorkshops, bulkSearchProducts, getAvailabilityStatus, calculatePrice, MAHINDRA_MODELS };
