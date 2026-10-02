const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\syedk\\.gemini\\antigravity\\brain\\6e2fcc2e-e314-4e2f-9f7c-8800b4550261\\scratch';
if (fs.existsSync(dir)) {
  const files = fs.readdirSync(dir);
  console.log('Files in brain scratch:');
  for (const f of files) {
    if (f.endsWith('.cjs') || f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.json')) {
      console.log('--- File:', f);
      const content = fs.readFileSync(path.join(dir, f), 'utf-8');
      console.log(content.slice(0, 300));
    }
  }
}
