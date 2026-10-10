// Inlines style.css, sim.js and ui.js into shell.html -> dist/kith.html (the published single-file prototype),
// and style.css into welcome.html -> dist/welcome.html (what the server shows signed-out visitors).
// Both get app-head.html, which makes the site installable: dist/ also gets its manifest, icons and sw.js.
const fs = require('fs'), path = require('path');
const { kithIcon } = require('./icon.js');
const d = __dirname, out = f => path.join(d, 'dist', f);
const read = f => fs.readFileSync(path.join(d, f), 'utf8');
// The page background in light and dark mode, the first two in style.css.
const [bg, bgDark] = [...read('style.css').matchAll(/--bg:(#[0-9a-f]{6})/g)].map(m => m[1]);
const head = read('app-head.html').replace('/*BG*/', bg).replace('/*BG_DARK*/', bgDark);
const page = h => h.replace('/*STYLE*/', () => read('style.css')).replace('<!--APP-->', () => head);
const icons = [
  { src: '/icon-192.png', size: 192, fill: 0.95 },
  { src: '/icon-512.png', size: 512, fill: 0.95 },
  // Launchers may crop a maskable icon to a circle 80% of its width.
  { src: '/icon-maskable-512.png', size: 512, fill: 0.75, background: bg, purpose: 'maskable' }
];
fs.mkdirSync(path.join(d, 'dist'), { recursive: true });
fs.writeFileSync(out('kith.html'), page(read('shell.html')).replace('/*SIM*/', () => read('sim.js')).replace('/*UI*/', () => read('ui.js')));
fs.writeFileSync(out('welcome.html'), page(read('welcome.html')));
for (const i of icons) fs.writeFileSync(out(i.src.slice(1)), kithIcon(i.size, i));
fs.writeFileSync(out('apple-touch-icon.png'), kithIcon(180, { fill: 0.8, background: bg }));
fs.writeFileSync(out('manifest.webmanifest'), JSON.stringify({
  name: 'Kith', short_name: 'Kith', start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait',
  theme_color: bg, background_color: bg,
  icons: icons.map(i => ({ src: i.src, sizes: `${i.size}x${i.size}`, type: 'image/png', ...(i.purpose && { purpose: i.purpose }) }))
}, null, 2));
fs.copyFileSync(path.join(d, 'sw.js'), out('sw.js'));
console.log('wrote dist/kith.html, dist/welcome.html and the installable-app files');
