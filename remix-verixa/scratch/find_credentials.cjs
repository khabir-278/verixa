const fs = require('fs');
const readline = require('readline');

const transcriptPath = 'C:\\Users\\syedk\\.gemini\\antigravity\\brain\\6e2fcc2e-e314-4e2f-9f7c-8800b4550261\\.system_generated\\logs\\transcript.jsonl';
if (!fs.existsSync(transcriptPath)) {
  console.log('Transcript not found');
  process.exit(0);
}

const rl = readline.createInterface({ input: fs.createReadStream(transcriptPath) });
rl.on('line', (line) => {
  if (line.includes('test_auditor') || line.includes('doc_auditor')) {
    try {
      const obj = JSON.parse(line);
      const text = obj.content || (obj.tool_calls ? JSON.stringify(obj.tool_calls) : '') || '';
      if (text.toLowerCase().includes('password') || text.includes('Pass') || text.includes('secret')) {
        console.log(`Step ${obj.step_index}:`, text.slice(0, 500));
      }
    } catch {}
  }
});
