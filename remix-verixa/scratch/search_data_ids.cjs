const fs = require('fs');
const path = require('path');
const dataDir = path.join(__dirname, '../data');
const ids = ['a8e20931-a19f-4c70-a788-7ac7a9df2372', '26b84324-80b6-4046-84d9-976a2882f379'];

console.log('Searching all files in data/ ...');
fs.readdirSync(dataDir).forEach(file => {
  if (!file.endsWith('.json')) return;
  const content = fs.readFileSync(path.join(dataDir, file), 'utf8');
  ids.forEach(id => {
    if (content.includes(id)) {
      console.log(`-> Found ${id} in data/${file}`);
    }
  });
});
console.log('Search complete.');
