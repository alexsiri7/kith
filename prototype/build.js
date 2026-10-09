// Inlines sim.js and ui.js into shell.html -> dist/kith.html (the published single-file prototype)
const fs = require('fs'), path = require('path');
const d = __dirname;
let h = fs.readFileSync(path.join(d, 'shell.html'), 'utf8');
h = h.replace('/*SIM*/', () => fs.readFileSync(path.join(d, 'sim.js'), 'utf8')).replace('/*UI*/', () => fs.readFileSync(path.join(d, 'ui.js'), 'utf8'));
fs.mkdirSync(path.join(d, 'dist'), { recursive: true });
fs.writeFileSync(path.join(d, 'dist', 'kith.html'), h);
console.log('wrote dist/kith.html');
