const { GoogleGenAI } = require('@google/genai');
const dotenv = require('dotenv');
const fs = require('fs');

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local', override: true });
} else {
  dotenv.config();
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function testModel(modelName) {
  try {
    console.log(`Testing model: ${modelName}...`);
    const res = await ai.models.generateContent({
      model: modelName,
      contents: 'Ping. Reply with "pong".',
    });
    console.log(`Model ${modelName} SUCCESS:`, res.text?.trim());
    return true;
  } catch (err) {
    console.log(`Model ${modelName} FAILED:`, err.message);
    return false;
  }
}

async function run() {
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-1.5-flash'];
  for (const m of models) {
    await testModel(m);
  }
}

run();
