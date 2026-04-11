const fs = require('fs');
const path = require('path');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TIMEOUT_MS = 15000;

async function transcribeAudio(filePath) {
  const start = Date.now();
  const ext = path.extname(filePath).toLowerCase();

  // Build multipart form data manually using Node 20 built-in FormData
  const fileBuffer = fs.readFileSync(filePath);
  const fileName = 'audio' + ext;
  const mimeType = ext === '.webm' ? 'audio/webm' : ext === '.mp3' ? 'audio/mpeg' : 'audio/ogg';

  const blob = new Blob([fileBuffer], { type: mimeType });
  const formData = new FormData();
  formData.append('file', blob, fileName);
  formData.append('model', 'whisper-1');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + OPENAI_API_KEY
      },
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error('OpenAI STT ' + response.status + ': ' + errText);
    }

    const data = await response.json();
    const transcript = data.text || '';
    console.log('[stt] OpenAI Whisper in ' + (Date.now()-start) + 'ms: "' + transcript.substring(0,80) + '"');
    return transcript;
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      console.log('[stt] OpenAI timeout after ' + TIMEOUT_MS + 'ms');
      throw new Error('Transcription timeout');
    }
    console.log('[stt] OpenAI error: ' + error.message);
    throw error;
  }
}

module.exports = { transcribeAudio };
