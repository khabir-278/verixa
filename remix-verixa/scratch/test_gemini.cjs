const { GoogleGenAI } = require('@google/genai');
const dotenv = require('dotenv');
const fs = require('fs');

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local', override: true });
} else {
  dotenv.config();
}

console.log('API KEY exists:', !!process.env.GEMINI_API_KEY);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function test() {
  const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
  for (const model of models) {
    try {
      console.log(`Testing model: ${model}...`);
      const start = Date.now();
      const res = await ai.models.generateContent({
        model,
        contents: 'Hello, respond with OK.',
      });
      console.log(`[SUCCESS] ${model} responded in ${Date.now() - start}ms:`, res.text?.trim());
      break;
    } catch (e) {
      console.log(`[FAILED] ${model}:`, e.message);
    }
  }
}

test();
