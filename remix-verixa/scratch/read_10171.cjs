const fs = require('fs');
const readline = require('readline');

const fullTranscriptPath = 'C:\\Users\\syedk\\.gemini\\antigravity\\brain\\6e2fcc2e-e314-4e2f-9f7c-8800b4550261\\.system_generated\\logs\\transcript_full.jsonl';
const rl = readline.createInterface({ input: fs.createReadStream(fullTranscriptPath) });
rl.on('line', (line) => {
  try {
    const obj = JSON.parse(line);
    if (obj.step_index >= 10171 && obj.step_index <= 10185) {
      console.log(`=== Step ${obj.step_index} (${obj.source}) ===`);
      console.log(obj.content ? obj.content.slice(0, 300) : JSON.stringify(obj.tool_calls || {}));
    }
  } catch {}
});
