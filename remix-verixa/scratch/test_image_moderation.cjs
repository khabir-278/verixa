const { GoogleGenAI, Type } = require('@google/genai');
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

// 1x1 transparent PNG
const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function testImageModeration() {
  const systemInstruction = `You are VERIXA's Deep Vision & Synthetic Media Safety Engine.
Perform rigorous, multi-dimensional safety inspection on user-uploaded visual media.
Evaluate:
1. NSFW / Adult Content
2. Nudity
3. Sexual Content
4. Violence
5. Blood / Gore
6. Weapons
7. Deepfake Risk
8. Text Toxicity

Return ONLY a valid JSON object matching the requested schema.`;

  try {
    const res = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: {
        parts: [
          {
            inlineData: {
              data: samplePngBase64,
              mimeType: 'image/png',
            },
          },
          { text: 'Analyze this image.' },
        ],
      },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            safe: { type: Type.BOOLEAN },
            overall_risk_score: { type: Type.INTEGER },
            nsfw_score: { type: Type.INTEGER },
            violence_score: { type: Type.INTEGER },
            weapons_score: { type: Type.INTEGER },
            deepfake_risk_score: { type: Type.INTEGER },
            embedded_text_toxicity_score: { type: Type.INTEGER },
            labels: { type: Type.ARRAY, items: { type: Type.STRING } },
            reason: { type: Type.STRING },
          },
          required: ['safe', 'overall_risk_score', 'nsfw_score', 'violence_score', 'weapons_score', 'deepfake_risk_score', 'embedded_text_toxicity_score', 'labels', 'reason'],
        },
      },
    });

    console.log('Gemini Image Moderation SUCCESS:');
    console.log(res.text);
  } catch (err) {
    console.error('Gemini Image Moderation FAILED:', err);
  }
}

testImageModeration();
