const fs = require('fs');

const content = fs.readFileSync('c:\\remix-verixa\\server.ts', 'utf-8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  const match = line.match(/app\.(get|post|put|delete|patch)\(\s*["']([^"']+)["']/);
  if (match) {
    console.log(`L${idx + 1}: ${match[1].toUpperCase()} ${match[2]}`);
  }
});
