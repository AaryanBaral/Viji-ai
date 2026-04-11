// In-memory LRU cache for embedding vectors.
// 1000 entries max, 1-hour TTL. Resets on server restart (acceptable).
const EMB_CACHE_MAX = 1000;
const EMB_CACHE_TTL = 60 * 60 * 1000;
const embCache = new Map();

function embCacheGet(key) {
  const entry = embCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > EMB_CACHE_TTL) {
    embCache.delete(key);
    return undefined;
  }
  // Move to end (most-recently used) for LRU ordering
  embCache.delete(key);
  embCache.set(key, entry);
  return entry.value;
}

function embCacheSet(key, value) {
  // Evict oldest entry if at capacity
  if (embCache.size >= EMB_CACHE_MAX && !embCache.has(key)) {
    const oldest = embCache.keys().next().value;
    embCache.delete(oldest);
  }
  embCache.set(key, { value, ts: Date.now() });
}

// Normalize cache key: lowercase, collapse whitespace, sort words.
// "Brake Pad Swift" and "swift brake pad" hit the same cache entry.
function normalizeCacheKey(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).sort().join(' ');
}

async function getEmbedding(text) {
    const raw = Array.isArray(text) ? text.join('|') : text;
    const key = normalizeCacheKey(raw);
    const cached = embCacheGet(key);
    if (cached) {
      console.log('[emb] cache hit:', key.slice(0, 30));
      return cached;
    }

    const _t0 = Date.now();
    const response = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'nvidia/nv-embedqa-e5-v5',
            input: Array.isArray(text) ? text : [text],
            input_type: 'query'
        })
    });
    if (!response.ok) {
        throw new Error(`NIM embedding error: ${response.status}`);
    }
    const data = await response.json();
    try { console.log('[PERF] embedding:', (Date.now() - _t0) + 'ms'); } catch(e) {}

    const result = Array.isArray(text) ? data.data.map(d => d.embedding) : data.data[0].embedding;
    embCacheSet(key, result);
    console.log('[emb] cache miss:', raw.slice(0, 30));
    return result;
}

module.exports = { getEmbedding, embCache };
