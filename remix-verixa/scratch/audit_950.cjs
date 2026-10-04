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
const elements = [];

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (/(purple|indigo|blue|emerald|rose|amber)-950/.test(line)) {
      elements.push(`${f}:${idx+1} -> ${line.trim()}`);
    }
  });
});

let out = `Total 950 elements: ${elements.length}\n`;
elements.forEach(e => { out += e + '\n'; });
fs.writeFileSync('scratch/colored_950_report.txt', out, 'utf8');
console.log(`Written ${elements.length} items to scratch/colored_950_report.txt`);
