const { GoogleGenAI, Type } = require('@google/genai');
const dotenv = require('dotenv');
const fs = require('fs');

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local', override: true });
} else {
  dotenv.config();
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testImage() {
  const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const start = Date.now();
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: samplePngBase64,
            },
          },
          {
            text: 'Is this image safe? Return JSON with safe (boolean), reason (string).',
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });
    console.log(`Image response in ${Date.now() - start}ms:`, res.text);
  } catch (err) {
    console.error('Image test error in ' + (Date.now() - start) + 'ms:', err);
  }
}

testImage();
