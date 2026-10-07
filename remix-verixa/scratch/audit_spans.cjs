const fs = require('fs');
const path = require('path');

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(full));
    } else if (full.endsWith('.tsx')) {
      results.push(full);
    }
  });
  return results;
}

const files = getFiles('./src');
const spans = [];

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if ((line.includes('<span') || line.includes('<label') || line.includes('<p') || line.includes('<div')) && 
        (line.includes('bg-slate-950') || line.includes('bg-slate-900') || line.includes('bg-slate-800') || line.includes('bg-black/'))) {
      if (line.includes('rounded-full') || line.includes('rounded-md') || line.includes('rounded-lg') || line.includes('rounded-xl') || line.includes('rounded-2xl')) {
        spans.push(`${f}:${idx+1} -> ${line.trim()}`);
      }
    }
  });
});

let out = `Total dark rounded badges/pills/elements: ${spans.length}\n`;
spans.forEach(s => { out += s + '\n'; });
fs.writeFileSync('scratch/dark_elements_report.txt', out, 'utf8');
console.log(`Audited ${spans.length} elements to scratch/dark_elements_report.txt`);
