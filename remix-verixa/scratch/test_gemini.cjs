const { GoogleGenAI } = require('@google/genai');
require('dotenv').config({ path: '.env.local' });

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
});

async function test() {
  const models = [
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
  ];
  for (const m of models) {
    try {
      console.log('Testing', m);
      const res = await ai.models.generateContent({ model: m, contents: 'Say hi' });
      console.log('SUCCESS for model:', m, res.text ? res.text.trim() : 'OK');
    } catch (e) {
      console.log('FAIL for model:', m, e.message);
    }
  }
}

test();
