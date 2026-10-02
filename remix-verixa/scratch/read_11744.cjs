const fs = require('fs');
const readline = require('readline');

const transcriptPath = 'C:\\Users\\syedk\\.gemini\\antigravity\\brain\\6e2fcc2e-e314-4e2f-9f7c-8800b4550261\\.system_generated\\logs\\transcript.jsonl';
const rl = readline.createInterface({ input: fs.createReadStream(transcriptPath) });
rl.on('line', (line) => {
  try {
    const obj = JSON.parse(line);
    if (obj.step_index === 11744) {
      console.log(JSON.stringify(obj, null, 2));
    }
  } catch {}
});
