const fs = require('fs');
const readline = require('readline');

const fullTranscriptPath = 'C:\\Users\\syedk\\.gemini\\antigravity\\brain\\6e2fcc2e-e314-4e2f-9f7c-8800b4550261\\.system_generated\\logs\\transcript_full.jsonl';
const rl = readline.createInterface({ input: fs.createReadStream(fullTranscriptPath) });
rl.on('line', (line) => {
  try {
    const obj = JSON.parse(line);
    if (obj.step_index >= 10186 && obj.step_index <= 10230) {
      const s = JSON.stringify(obj);
      if (s.includes('test_auditor') || s.includes('doc_auditor') || s.includes('auth.signIn') || s.includes('signUp')) {
        console.log(`=== Step ${obj.step_index} (${obj.source}) ===`);
        console.log(s.slice(0, 400));
      }
    }
  } catch {}
});
