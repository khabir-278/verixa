const { GoogleGenAI } = require('@google/genai');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local', override: true });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  const pager = await ai.models.list();
  for await (const m of pager) {
    console.log(m.name);
  }
}
run();
