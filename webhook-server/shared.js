// shared.js
// Shared singletons: supabase client, anthropic client, HTTP agents, CUSTOMER_CARE_PHONE

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const http = require('http');
const https = require('https');

// ─────────────────────────────────────────────────────────────
// HTTP KEEP-ALIVE AGENTS
// Reuse TCP+TLS connections across requests. Saves ~80-120ms
// per call by avoiding repeated TLS handshakes to Meta, NIM, etc.
// ─────────────────────────────────────────────────────────────
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 20 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 20 });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const CUSTOMER_CARE_PHONE = process.env.CUSTOMER_CARE_PHONE || '+977-9851069717';

module.exports = { supabase, anthropic, CUSTOMER_CARE_PHONE, httpAgent, httpsAgent };
