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
    } else if (full.endsWith('.tsx') || full.endsWith('.ts')) {
      results.push(full);
    }
  });
  return results;
}

const files = getFiles('./src');
const bgSet = new Set();
const gradientBanners = [];

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const matches = content.matchAll(/(bg-[a-zA-Z0-9_\/\[\]#-]+|from-[a-zA-Z0-9_\/\[\]#-]+)/g);
  for (const m of matches) {
    bgSet.add(m[1]);
  }
  
  // Also check for bg-gradient containers
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('bg-gradient') && (line.includes('slate-9') || line.includes('slate-8') || line.includes('purple-950') || line.includes('indigo-950') || line.includes('blue-950') || line.includes('black'))) {
      gradientBanners.push(`${f}:${idx+1} -> ${line.trim()}`);
    }
  });
});

console.log('--- ALL DARK / SLATE / GRAY / BLACK BG CLASSES ---');
const darkBgs = Array.from(bgSet).filter(c => 
  c.includes('slate-7') || c.includes('slate-8') || c.includes('slate-9') ||
  c.includes('gray-7') || c.includes('gray-8') || c.includes('gray-9') ||
  c.includes('black') || c.includes('950') || c.includes('0a0a0f') || c.includes('050507') || c.includes('111215')
).sort();
console.log(darkBgs.join('\n'));

console.log('\n--- DARK GRADIENT CONTAINERS (' + gradientBanners.length + ') ---');
gradientBanners.slice(0, 50).forEach(g => console.log(g));
if (gradientBanners.length > 50) {
  console.log('... and ' + (gradientBanners.length - 50) + ' more');
}
