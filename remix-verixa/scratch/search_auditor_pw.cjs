const fs = require('fs');
const readline = require('readline');

const transcriptPath = 'C:\\Users\\syedk\\.gemini\\antigravity\\brain\\6e2fcc2e-e314-4e2f-9f7c-8800b4550261\\.system_generated\\logs\\transcript.jsonl';
const rl = readline.createInterface({ input: fs.createReadStream(transcriptPath) });
rl.on('line', (line) => {
  if (line.includes('test_auditor@verixa.com')) {
    try {
      const obj = JSON.parse(line);
      console.log(`Step ${obj.step_index} (${obj.type}):`);
      const s = JSON.stringify(obj);
      // find index of test_auditor@verixa.com
      let idx = s.indexOf('test_auditor@verixa.com');
      console.log(s.substring(Math.max(0, idx - 150), Math.min(s.length, idx + 250)));
    } catch {}
  }
});
