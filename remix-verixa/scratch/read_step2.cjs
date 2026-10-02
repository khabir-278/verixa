const fs = require('fs');
const readline = require('readline');

const transcriptPath = 'C:\\Users\\syedk\\.gemini\\antigravity\\brain\\6e2fcc2e-e314-4e2f-9f7c-8800b4550261\\.system_generated\\logs\\transcript.jsonl';
const rl = readline.createInterface({ input: fs.createReadStream(transcriptPath) });
rl.on('line', (line) => {
  try {
    const obj = JSON.parse(line);
    if (obj.step_index >= 10155 && obj.step_index <= 10175) {
      if (obj.content && obj.content.includes('test_auditor')) {
        console.log(`=== Content Step ${obj.step_index} ===`);
        console.log(obj.content.slice(0, 400));
      }
      if (obj.tool_calls) {
        console.log(`=== Tool Calls Step ${obj.step_index} ===`);
        console.log(JSON.stringify(obj.tool_calls).slice(0, 400));
      }
    }
  } catch {}
});
