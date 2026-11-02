const fs = require('fs');
const c = fs.readFileSync('js/views/settings.js', 'utf8');
let b = 0;
for (const ch of c) { if (ch === '`') b++; }
console.log('settings.js backticks:', b);
const lines = c.split('\n');
for (let i = 0; i < lines.length; i++) {
  let cnt = 0;
  for (const ch of lines[i]) if (ch === '`') cnt++;
  if (cnt > 0) console.log((i+1) + ': ' + cnt + ' backticks');
}