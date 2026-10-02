const fs = require('fs');
const readline = require('readline');

const fullTranscriptPath = 'C:\\Users\\syedk\\.gemini\\antigravity\\brain\\6e2fcc2e-e314-4e2f-9f7c-8800b4550261\\.system_generated\\logs\\transcript_full.jsonl';
if (!fs.existsSync(fullTranscriptPath)) {
  console.log('full transcript not found');
  process.exit(1);
}

const rl = readline.createInterface({ input: fs.createReadStream(fullTranscriptPath) });
rl.on('line', (line) => {
  try {
    const obj = JSON.parse(line);
    if ([10145, 10151, 10168, 10170].includes(obj.step_index)) {
      console.log(`=== Full Step ${obj.step_index} ===`);
      console.log(JSON.stringify(obj, null, 2));
    }
  } catch {}
});
