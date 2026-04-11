// otpService.js — Aakash SMS OTP service
// Aakash SMS API: POST https://sms.aakashsms.com/sms/v3/send
// WE generate the OTP, store it, send it, and verify it — Aakash is plain SMS only.

const OTP_EXPIRY_MS = 5 * 60 * 1000;   // 5 minutes
const OTP_COOLDOWN_MS = 60 * 1000;      // 1 minute between resends
const MAX_OTP_ATTEMPTS = 3;             // brute-force protection

// In-memory OTP store (single server — fine for now)
// Key: 10-digit phone, Value: { otp, expiresAt, attempts, lastSentAt }
const otpStore = new Map();

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Normalize phone to 10-digit Nepal format for Aakash SMS
// Aakash expects bare 10-digit: "9766560722"
function normalizeForAakash(phone) {
  if (!phone) throw new Error('Phone number is required');
  const digits = String(phone).replace(/\D/g, '');

  // Strip 977 country code → 10 digits
  if (digits.startsWith('977') && digits.length === 13) return digits.slice(3);
  if (digits.startsWith('977') && digits.length === 12) return digits.slice(3);

  // Already 10 digits
  if (digits.length === 10) return digits;

  // Strip leading 00977
  if (digits.startsWith('00977') && digits.length === 15) return digits.slice(5);

  throw new Error('Unsupported phone format for Aakash SMS: ' + phone);
}

async function sendOTP(phone) {
  let phone10;
  try {
    phone10 = normalizeForAakash(phone);
  } catch (e) {
    throw new Error(e.message);
  }

  const now = Date.now();
  const existing = otpStore.get(phone10);

  // Cooldown check
  if (existing && existing.lastSentAt && (now - existing.lastSentAt) < OTP_COOLDOWN_MS) {
    const waitSec = Math.ceil((OTP_COOLDOWN_MS - (now - existing.lastSentAt)) / 1000);
    throw new Error('Please wait ' + waitSec + ' seconds before requesting a new OTP.');
  }

  const otp = generateOTP();
  otpStore.set(phone10, {
    otp,
    expiresAt: now + OTP_EXPIRY_MS,
    attempts: 0,
    lastSentAt: now
  });

  const authToken = process.env.AAKASH_SMS_AUTH_TOKEN;
  if (!authToken) throw new Error('AAKASH_SMS_AUTH_TOKEN not configured');

  const text = 'Your ViJJI login code is: ' + otp + '. Valid for 5 minutes. Do not share this code.';

  const params = new URLSearchParams();
  params.append('auth_token', authToken);
  params.append('to', phone10);
  params.append('text', text);

  const response = await fetch('https://sms.aakashsms.com/sms/v3/send', {
    method: 'POST',
    body: params
  });

  let result;
  try {
    result = await response.json();
  } catch (e) {
    throw new Error('Aakash SMS returned non-JSON response (status ' + response.status + ')');
  }

  if (result.error) {
    // Clean up stored OTP on send failure
    otpStore.delete(phone10);
    throw new Error('SMS send failed: ' + (result.message || 'Unknown error'));
  }

  console.log('[otp] OTP sent to ' + phone10.slice(0, 4) + '******' + ' | queued: ' + (result.message || 'ok'));
  return { success: true, message: 'OTP sent' };
}

function verifyOTP(phone, inputOtp) {
  let phone10;
  try {
    phone10 = normalizeForAakash(phone);
  } catch (e) {
    return { success: false, error: e.message };
  }

  const record = otpStore.get(phone10);

  if (!record) {
    return { success: false, error: 'No OTP found. Please request a new one.' };
  }

  const now = Date.now();

  if (now > record.expiresAt) {
    otpStore.delete(phone10);
    return { success: false, error: 'OTP expired. Please request a new one.' };
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    otpStore.delete(phone10);
    return { success: false, error: 'Too many incorrect attempts. Please request a new OTP.' };
  }

  if (String(inputOtp).trim() !== record.otp) {
    record.attempts += 1;
    const left = MAX_OTP_ATTEMPTS - record.attempts;
    return { success: false, error: 'Incorrect OTP.' + (left > 0 ? ' ' + left + ' attempt(s) remaining.' : ' Please request a new OTP.') };
  }

  // Correct — delete and return success
  otpStore.delete(phone10);
  console.log('[otp] OTP verified for ' + phone10.slice(0, 4) + '******');
  return { success: true };
}

// Clean up expired OTPs every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [phone, data] of otpStore) {
    if (now > data.expiresAt) otpStore.delete(phone);
  }
}, 10 * 60 * 1000);

module.exports = { sendOTP, verifyOTP, normalizeForAakash };
