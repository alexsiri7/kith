// Inlines style.css, sim.js and ui.js into shell.html -> dist/kith.html (the published single-file prototype),
// and style.css into welcome.html -> dist/welcome.html (what the server shows signed-out visitors)
const fs = require('fs'), path = require('path');
const d = __dirname;
const read = f => fs.readFileSync(path.join(d, f), 'utf8');
const style = h => h.replace('/*STYLE*/', () => read('style.css'));
fs.mkdirSync(path.join(d, 'dist'), { recursive: true });
fs.writeFileSync(path.join(d, 'dist', 'kith.html'), style(read('shell.html')).replace('/*SIM*/', () => read('sim.js')).replace('/*UI*/', () => read('ui.js')));
fs.writeFileSync(path.join(d, 'dist', 'welcome.html'), style(read('welcome.html')));
console.log('wrote dist/kith.html and dist/welcome.html');
