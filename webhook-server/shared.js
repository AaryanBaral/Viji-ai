// shared.js
// Shared singletons: supabase client, anthropic client, CUSTOMER_CARE_PHONE

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const CUSTOMER_CARE_PHONE = process.env.CUSTOMER_CARE_PHONE || '+977-9851069717';

module.exports = { supabase, anthropic, CUSTOMER_CARE_PHONE };
