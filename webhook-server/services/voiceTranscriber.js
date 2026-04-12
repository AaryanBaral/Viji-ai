const fs = require('fs');
const path = require('path');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TIMEOUT_MS = 10000;

/**
 * Transcribe audio using Groq Whisper (primary, ~0.5s) with OpenAI Whisper fallback (~5-7s).
 * Groq runs the same whisper-large-v3 model on specialized hardware — 10x faster.
 *
 * @param {string|Buffer} filePathOrBuffer - Path to audio file, or Buffer of audio data
 * @param {string} [ext='.ogg'] - File extension (used for MIME type when passing Buffer)
 * @returns {string} Transcript text
 */
async function transcribeAudio(filePathOrBuffer, ext) {
  const start = Date.now();
  const isBuffer = Buffer.isBuffer(filePathOrBuffer);
  const fileBuffer = isBuffer ? filePathOrBuffer : fs.readFileSync(filePathOrBuffer);
  const fileExt = ext || (isBuffer ? '.ogg' : path.extname(filePathOrBuffer).toLowerCase());
  const fileName = 'audio' + fileExt;
  const mimeType = fileExt === '.webm' ? 'audio/webm' : fileExt === '.mp3' ? 'audio/mpeg' : 'audio/ogg';

  // Try Groq first (sub-second), fall back to OpenAI (5-7s)
  if (GROQ_API_KEY) {
    try {
      const transcript = await callWhisperAPI(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        GROQ_API_KEY,
        'whisper-large-v3',
        fileBuffer, fileName, mimeType
      );
      console.log(`[stt] Groq Whisper in ${Date.now() - start}ms: "${transcript.substring(0, 80)}"`);
      return transcript;
    } catch (err) {
      console.warn(`[stt] Groq failed (${Date.now() - start}ms): ${err.message} — falling back to OpenAI`);
    }
  }

  // Fallback: OpenAI Whisper
  if (OPENAI_API_KEY) {
    const transcript = await callWhisperAPI(
      'https://api.openai.com/v1/audio/transcriptions',
      OPENAI_API_KEY,
      'whisper-1',
      fileBuffer, fileName, mimeType
    );
    console.log(`[stt] OpenAI Whisper in ${Date.now() - start}ms: "${transcript.substring(0, 80)}"`);
    return transcript;
  }

  throw new Error('No STT API key configured (GROQ_API_KEY or OPENAI_API_KEY)');
}

async function callWhisperAPI(url, apiKey, model, fileBuffer, fileName, mimeType) {
  const blob = new Blob([fileBuffer], { type: mimeType });
  const formData = new FormData();
  formData.append('file', blob, fileName);
  formData.append('model', model);
  // Language hint for better Hindi/Nepali/English accuracy
  // Whisper auto-detects, but hinting reduces errors on short clips
  formData.append('language', 'en');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey },
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`STT ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return data.text || '';
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error(`STT timeout after ${TIMEOUT_MS}ms`);
    }
    throw error;
  }
}

module.exports = { transcribeAudio };
