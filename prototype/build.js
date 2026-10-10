// Inlines style.css, sim.js and ui.js into shell.html -> dist/kith.html (the published single-file prototype),
// and style.css into welcome.html -> dist/welcome.html (what the server shows signed-out visitors).
// Both get app-head.html, which makes the site installable: dist/ also gets its manifest, icons and sw.js,
// and app-files.json naming them, which is the list of files the server serves beside the pages.
const fs = require('fs'), path = require('path');
const { kithIcon } = require('./icon.js');
const d = __dirname, out = f => path.join(d, 'dist', f);
const read = f => fs.readFileSync(path.join(d, f), 'utf8');
const style = read('style.css');
const pageBackground = selector => {
  const m = style.match(new RegExp(selector.replace(/[[\]"]/g, '\\$&') + '\\{[^}]*--bg:(#[0-9a-f]{6})'));
  if (!m) throw new Error(`style.css has no --bg in a ${selector} rule`);
  return m[1];
};
const bg = pageBackground(':root'), bgDark = pageBackground(':root[data-theme="dark"]');
const head = read('app-head.html').replace('/*BG*/', bg).replace('/*BG_DARK*/', bgDark);
const page = h => h.replace('/*STYLE*/', () => style).replace('<!--APP-->', () => head);
const icons = [
  { src: '/icon-192.png', size: 192, fill: 0.95 },
  { src: '/icon-512.png', size: 512, fill: 0.95 },
  // Launchers may crop a maskable icon to a circle 80% of its width.
  { src: '/icon-maskable-512.png', size: 512, fill: 0.75, background: bg, purpose: 'maskable' }
];
const appFiles = [];
const writeAppFile = (name, data) => { fs.writeFileSync(out(name), data); appFiles.push(name); };
fs.mkdirSync(path.join(d, 'dist'), { recursive: true });
fs.writeFileSync(out('kith.html'), page(read('shell.html')).replace('/*SIM*/', () => read('sim.js')).replace('/*UI*/', () => read('ui.js')));
fs.writeFileSync(out('welcome.html'), page(read('welcome.html')));
for (const i of icons) writeAppFile(i.src.slice(1), kithIcon(i.size, i));
writeAppFile('apple-touch-icon.png', kithIcon(180, { fill: 0.8, background: bg }));
writeAppFile('manifest.webmanifest', JSON.stringify({
  name: 'Kith', short_name: 'Kith', start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait',
  theme_color: bg, background_color: bg,
  icons: icons.map(i => ({ src: i.src, sizes: `${i.size}x${i.size}`, type: 'image/png', ...(i.purpose && { purpose: i.purpose }) }))
}, null, 2));
writeAppFile('sw.js', read('sw.js'));
fs.writeFileSync(out('app-files.json'), JSON.stringify(appFiles));
console.log('wrote dist/kith.html, dist/welcome.html and the installable-app files');
