// utils/classifier.js
// Shared message classification logic for AI routing
// Used by both index.js (routeMessage) and routes/chatRoutes.js (test endpoint)

const SIMPLE_GREETINGS = /^(hi|hello|hey|namaste|namaskar|thanks|thank you|thankyou|dhanyabad|dhanyavaad|bye|goodbye|ok|okay|yes|no|good morning|good evening|good night|good afternoon|shuva prabhat|ram ram|jai shree ram)\s*[.!?]*$/i;
const SIMPLE_QUESTIONS = /^(who are you|what do you do|what is your name|what's your name|your name|hours|opening hours|contact|phone|phone number|address|location|where are you|help|how can you help)\s*[.!?]*$/i;
const COMPLEX_KEYWORDS = /\b(search|find|look|looking|show|order|buy|add|checkout|confirm|cancel|status|delivery|stock|available|price|cost|rate|brake|filter|engine|oil|tyre|tire|suspension|workshop|garage|mechanic|oem|part number|part|parts|product|products|vehicle|car|bike|motorcycle|truck|toyota|honda|hyundai|suzuki|yamaha|bajaj|tata|mahindra|maruti|hero|ktm|royal enfield|spare|spares|my orders|order history|place order|book it|done ordering)\b/i;
const PRODUCT_CODE_PATTERN = /[A-Z]{2,3}[-]?\d{3,}/;
const DEVANAGARI_PATTERN = /[\u0900-\u097F]/;

// Fast-path product search matchers
// Covers all product types with 100+ items in DB (209K products, 573 water pumps, etc.)
const PRODUCT_PART_KEYWORDS = /\b(pump|filter|brake|clutch|bearing|gasket|belt|seal|pad|disc|drum|rotor|injector|nozzle|valve|ring|piston|alternator|starter|radiator|thermostat|sensor|relay|switch|lamp|bulb|fuse|spring|shock|strut|bushing|kit|set|assembly|assy|coolant|wiper|cable|chain|sprocket|carburetor|headlight|taillight|mirror|horn|tyre|tire|wheel|hub|hose|cover|panel|pipe|shaft|bracket|plate|gear|steering|bumper|door|fender|wiring|harness|clamp|connector|regulator|handle|latch|lock|window|glass|windshield|body|chassis|fuel|air|cabin|battery|washer|bolt|nut|rubber|muffler|exhaust|cylinder|compressor|condenser|silencer|lever|arm|mount|axle|caliper|flywheel|turbo|manifold|camshaft|crankshaft|stud)s?\b/i;
const VEHICLE_MODEL_KEYWORDS = /\b(bolero|scorpio|thar|xuv|nexon|swift|baleno|brezza|innova|fortuner|creta|venue|i20|i10|alto|dzire|ertiga|vitara|ecosport|duster|kwid|triber|ciaz|ignis|wagon\s*r|seltos|sonet|punch|harrier|safari|altroz|tigor|tiago|hexa|marazzo|xylo|kuv|pik.?up)\b/i;
// Block queries that need LLM reasoning (orders, troubleshooting, comparisons).
// Removed "do you", "can", "does" — these commonly precede product requests:
//   "do you have water pump", "can I get a filter", "does this come in stock"
const FAST_PATH_BLOCKERS = /\b(order|cart|status|problem|fix|repair|diagnos|issue|how|what|why|when|which|recommend|suggest|help|compare|difference|between|best|cheap|discount|catalog|history|my orders|payment|install|replace|broken|not working)\b/i;

// Common conversational prefixes that precede product requests.
// Stripped before fast-path matching AND before sending to vector search.
const CONVERSATIONAL_PREFIX = /^(do you have|have you got|do you sell|do you stock|do you carry|can i get|can i have|can i see|can i buy|can i order|can you show me|can you show|can you find me|can you find|can you get me|can you get|can you search|could you show me|could you show|could you find me|could you find|i want|i need|i am looking for|i'm looking for|looking for|show me|give me|get me|find me|search for|look for|look up|please show me|please show|please find me|please find|please get me|please get|please search|pls show|pls find|let me see|make me see|display|mai chahiye|mujhe chahiye|chahiye|dedo|de do|dikhao|dikha do|batao|bata do)\s+/i;

// Strip conversational prefix from a query, returning the product-focused part
function stripPrefix(text) {
  const t = text.trim().replace(/[?!.]+$/, '').trim();  // also strip trailing punctuation
  return t.replace(CONVERSATIONAL_PREFIX, '').trim() || t;
}

// Returns true for short product discovery queries (1-8 words, no question/order intent)
// These get a fast vector search response without any LLM involvement.
function isSimpleProductQuery(text) {
  const t = text.trim();
  const wordCount = t.split(/\s+/).length;
  if (wordCount < 1 || wordCount > 8) return false;
  // Strip prefix + trailing punctuation for matching
  const cleaned = stripPrefix(t);
  if (FAST_PATH_BLOCKERS.test(cleaned)) return false;
  // Allow Devanagari through if it also contains English product keywords
  // (common in voice: "वाटर pump", "brake pad चाहियो", etc.)
  if (DEVANAGARI_PATTERN.test(cleaned) && !PRODUCT_PART_KEYWORDS.test(cleaned)) return false;
  if (PRODUCT_CODE_PATTERN.test(cleaned)) return false;  // product codes → Claude for cart ops
  return PRODUCT_PART_KEYWORDS.test(cleaned) || VEHICLE_MODEL_KEYWORDS.test(cleaned);
}

// Shared AI router stats counter
const aiStats = { ollama_english: 0, ollama_nepali: 0, claude: 0, fallbacks: 0, fast_search: 0 };

function classifyMessage(messageText, session) {
  const text = messageText.trim();
  const hasCart = session.context?.cart?.length > 0;
  const hasDevanagari = DEVANAGARI_PATTERN.test(text);
  const hasComplexKeyword = COMPLEX_KEYWORDS.test(text);
  const hasProductCode = PRODUCT_CODE_PATTERN.test(text);
  const isLong = text.length > 100;

  if (hasComplexKeyword || hasProductCode || hasCart || isLong) {
    return {
      route: 'claude',
      model: 'claude-sonnet-4-6',
      reason: hasCart ? 'cart_active' : hasProductCode ? 'product_code' : hasComplexKeyword ? 'complex_keyword' : 'long_message'
    };
  }
  if (hasDevanagari) return { route: 'ollama', model: 'qwen2.5:3b', reason: 'devanagari_simple' };
  if (SIMPLE_GREETINGS.test(text) || SIMPLE_QUESTIONS.test(text)) return { route: 'ollama', model: 'qwen2.5:3b', reason: 'simple_english' };
  return { route: 'claude', model: 'claude-sonnet-4-6', reason: 'default' };
}

module.exports = { classifyMessage, isSimpleProductQuery, stripPrefix, aiStats, DEVANAGARI_PATTERN };
