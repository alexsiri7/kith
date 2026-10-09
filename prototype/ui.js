const KEY = 'kith.world.v1';
const $ = s => document.querySelector(s);
let world = null, sample = null, speed = 1, lastFrame = performance.now(), saveAcc = 0;
let camX = 0, panAt = 0, pan = null, skyObjs = { orb: null, clouds: [] }, newsQ = [], newsAt = 0;
let hand = null, handAt = 0, drag = null, particles = [], flash = 0, pending = false, tab = 'care';
let consentOk = false, nightBusy = false, cortexAt = -1e9, conflictAt = -1e9, lastActRef = null;
const THINK = { food: '🥕', ball: '⚽', shelter: '🏠', you: '✋', robot: '🤖', storm: '⛈️', cold: '❄️', sleep: '💤', scared: '❗', happy: '✨', love: '♥', hungry: '🍽️', question: '?', water: '🌊', doll: '🧸', toy: '🪀', bees: '🐝', cactus: '🌵', squirrel: '🐿️', butterfly: '🦋', mushroom: '🍄', honey: '🍯', tree: '🌳', sun: '☀️', moon: '🌙', cloud: '☁️', rain: '🌧️', flower: '🌸', friend: '💞', robot: '🤖', explore: '🔍', sky: '☁️', star: '⭐', music: '🎵', words: '💬', dance: '💃' };
const WANT_ICON = { chase: ['squirrel'], honey: ['honey'], friend: ['friend'], hug: ['doll'], music: ['music'], learn: ['words'], fetch: ['ball', 'you'], dance: ['dance'], explore: ['explore'], watch: ['sky'], sing: ['music'], practice: ['words'], play: ['ball'], cuddle: ['love'] };
const WANT_LABEL = { chase: 'Chase the squirrel or butterflies', honey: 'Get honey (risky)', friend: 'Play with a friend', hug: 'Hug its doll', music: 'Play the music box', learn: 'Use the word board', fetch: 'Bring you the ball', dance: 'Dance', explore: 'Explore', watch: 'Watch the sky', sing: 'Sing', practice: 'Practise words', play: 'Chase the ball', cuddle: 'Snuggle up to you' };
let wishAt = -1e9;
const ACT_THINK = { poke: 'question', social: 'friend', eat: 'food', play: 'ball', rest: 'shelter', approach: 'you', sleep: 'sleep', hug: 'doll' };
const canvas = $('#world'), g = canvas.getContext('2d');
const H = 440;

function load() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function save() { if (!world) return; try { world.lastSeen = Date.now(); world.sel = world.creature.id; localStorage.setItem(KEY, JSON.stringify(world, (k, v) => k === 'creature' ? undefined : v)); } catch (e) {} }
function select(k) { if (!k) return; world.creature = k; world.sel = k.id; panAt = 0; renderRoster(); renderPanel(); renderTalk(); }
function withKith(k, fn) { const prev = world.creature; world.creature = k; try { return fn(); } finally { world.creature = prev; } }
function now() { return Date.now(); }
function present() { return document.visibilityState === 'visible' && !document.querySelector('.overlay:not([hidden])'); }
function ctx() {
  const recent = hand && now() - handAt < 20e3;
  return { present: present(), hand: present() ? (recent ? hand : { x: camX + VIEW / 2, y: GROUND }) : null, live: true };
}

// ---------- time & coins ----------
function coinTick(dtReal) {
  const lp = localParts(world.simTime);
  if (lp.day > world.allowanceDay) {
    const days = Math.min(3, lp.day - world.allowanceDay);
    world.coins += 60 * days; world.allowanceDay = lp.day; toast(`Daily allowance: +${60 * days} coins`);
  }
  if (!present()) return;
  if (world.presenceDay !== lp.day) { world.presenceDay = lp.day; world.presenceCoins = 0; }
  world.presenceMs += dtReal;
  if (world.presenceMs > 60e3) { world.presenceMs = 0; if (world.presenceCoins < 240) { world.coins++; world.presenceCoins++; } }
}

// ---------- rendering ----------
function resize() {
  const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.width * H / VIEW * dpr);
}
function lerpC(a, b, t) {
  const pa = a.match(/\w\w/g).map(h => parseInt(h, 16)), pb = b.match(/\w\w/g).map(h => parseInt(h, 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const SKY = [[0, '141b33'], [5, '1f2a4a'], [7, 'e8b08a'], [9, 'a9cfe0'], [17, 'b4d6e2'], [19.5, 'e39b7b'], [21.5, '2a2f55'], [24, '141b33']];
function skyColor(h, wx) {
  let i = 0; while (i < SKY.length - 2 && SKY[i + 1][0] <= h) i++;
  const [h0, c0] = SKY[i], [h1, c1] = SKY[i + 1];
  let c = lerpC(c0, c1, (h - h0) / (h1 - h0));
  if (wx.storm) c = lerpC(c.slice(1), '4a525e', 0.65); else if (wx.rain) c = lerpC(c.slice(1), '8a95a0', 0.4);
  return c;
}
function updateCam() {
  const c = world.creature, target = Math.max(0, Math.min(W - VIEW, c.x - VIEW / 2));
  if (now() - panAt > 7000) camX += (target - camX) * 0.06;
  camX = Math.max(0, Math.min(W - VIEW, camX));
}
function draw(t) {
  const s = canvas.width / VIEW; g.setTransform(s, 0, 0, s, 0, 0);
  const wx = weatherAt(world.seed, world.simTime, world.scale), c = world.creature;
  updateCam();
  g.fillStyle = skyColor(wx.hour, wx); g.fillRect(0, 0, VIEW, H);
  const dark = wx.night ? 1 : wx.hour < 7.5 ? (7.5 - wx.hour) : wx.hour > 20 ? (wx.hour - 20) / 1.5 : 0;
  if (wx.night && !wx.rain) { g.fillStyle = '#fff'; for (let i = 0; i < 40; i++) { const x = (i * 97) % VIEW, y = (i * 53) % 200; g.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(t / 900 + i)); g.fillRect(x, y, 2, 2); } g.globalAlpha = 1; }
  const arc = (wx.night ? ((wx.hour + 2.5) % 24) / 9 : (wx.hour - 6.5) / 15);
  const bx = 60 + arc * (VIEW - 120), by = 170 - Math.sin(arc * Math.PI) * 130;
  skyObjs = { orb: null, clouds: [], night: wx.night, rain: wx.rain };
  if (!wx.rain) { g.fillStyle = wx.night ? '#f1ecd6' : '#f7d77a'; g.beginPath(); g.arc(bx, by, wx.night ? 16 : 22, 0, 7); g.fill(); if (wx.night) { g.fillStyle = skyColor(wx.hour, wx); g.beginPath(); g.arc(bx + 7, by - 4, 13, 0, 7); g.fill(); } skyObjs.orb = { kind: wx.night ? 'moon' : 'sun', x: bx, y: by, r: 26 }; }
  const cloudCol = wx.rain ? 'rgba(120,128,138,.9)' : wx.night ? 'rgba(90,100,125,.55)' : 'rgba(255,255,255,.85)';
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 260 + t / 500 - camX * 0.15) % (VIEW + 240) + VIEW + 240) % (VIEW + 240) - 120, cy = 55 + i * 28;
    g.fillStyle = cloudCol; g.beginPath(); g.arc(cx, cy, 18, 0, 7); g.arc(cx + 20, cy - 8, 22, 0, 7); g.arc(cx + 42, cy, 16, 0, 7); g.fill();
    skyObjs.clouds.push({ x: cx + 20, y: cy - 2, r: 38 });
  }
  const px = camX * 0.35;
  g.fillStyle = lerpC('9fb59a', '34443f', Math.min(1, dark)); g.beginPath(); g.moveTo(0, 290);
  for (let x = 0; x <= VIEW; x += 30) { const wxp = x + px; g.lineTo(x, 250 - 40 * Math.sin(wxp / 210) - 20 * Math.sin(wxp / 83)); } g.lineTo(VIEW, H); g.lineTo(0, H); g.fill();
  const px2 = camX * 0.6;
  g.fillStyle = lerpC('7f9c7a', '2c3b3a', Math.min(1, dark)); g.beginPath(); g.moveTo(0, 300);
  for (let x = 0; x <= VIEW; x += 30) { const wxp = x + px2; g.lineTo(x, 285 - 30 * Math.sin(wxp / 130) - 15 * Math.sin(wxp / 47)); } g.lineTo(VIEW, H); g.lineTo(0, H); g.fill();
  g.save(); g.translate(-camX, 0);
  const snowy = wx.temp < 0, gcol = snowy ? lerpC('e9eef0', '8a96a0', Math.min(1, dark)) : lerpC('6f9150', '28392a', Math.min(1, dark));
  g.fillStyle = gcol; g.fillRect(camX - 5, GROUND, VIEW + 10, H - GROUND);
  g.fillStyle = snowy ? '#cfd8dc' : lerpC('587a3c', '1f2e22', Math.min(1, dark));
  for (let x = Math.floor(camX / 23) * 23 + 8; x < camX + VIEW; x += 23) { if (sideOf(x) === 0 || sideOf(x + 8) === 0) continue; g.beginPath(); g.moveTo(x, GROUND); g.lineTo(x + 4, GROUND - 7 - (x % 5)); g.lineTo(x + 8, GROUND); g.fill(); }
  drawRiver(t, dark); drawHill(dark);
  drawTree(t); drawCactus(); drawHive(t); drawShelters(); drawPatch(); drawBoard(t); drawMusic(t); drawLever(); drawBush(); drawVendor(t);
  for (const it of world.items) drawItem(it, t);
  drawRobot(t); drawButterflies(t);
  for (const k of world.kith) { if (k.stage === 'egg') drawEgg(k, t); else if (k.alive || world.simTime - (k.diedAt || 0) < 30 * 60e3) drawCreature(k, t, wx); }
  drawAttention(t); drawSwarm(t);
  drawFx();
  const pt = pointedNow();
  if (pt && !pt.screen) { g.save(); g.strokeStyle = 'rgba(242,193,78,.95)'; g.lineWidth = 2.5; g.setLineDash([6, 5]); g.lineDashOffset = -t / 40; g.beginPath(); g.arc(pt.x, pt.y, pt.r + 6, 0, 7); g.stroke(); g.restore(); }
  for (const k of world.kith) {
    if (k.stage === 'egg' || !k.alive) continue;
    const speaking = k.say && world.simTime < k.sayUntil;
    if (speaking) bubble(k);
    if (k.think && world.simTime < k.thinkUntil && !k.asleep) thought(k, speaking);
  }
  const R = world.robot; if (R.say && world.simTime < R.sayUntil) bubbleAt(R.x, GROUND - 90, R.say, '#dfe9ef');
  if (hand && now() - handAt < 20e3 && !press && !pan) { g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2; g.beginPath(); g.arc(hand.x, hand.y, 12, 0, 7); g.stroke(); }
  g.restore();
  drawWeather(wx);
  const pts = pointedNow(); if (pts && pts.screen) { g.save(); g.strokeStyle = 'rgba(242,193,78,.95)'; g.lineWidth = 2.5; g.setLineDash([6, 5]); g.lineDashOffset = -t / 40; g.beginPath(); g.arc(pts.x, pts.y, pts.r + 6, 0, 7); g.stroke(); g.restore(); }
  if (flash > 0) { g.fillStyle = `rgba(255,255,240,${flash})`; g.fillRect(0, 0, VIEW, H); flash -= 0.05; }
  if (dark > 0.2) { g.fillStyle = `rgba(10,14,35,${Math.min(0.35, dark * 0.3)})`; g.fillRect(0, 0, VIEW, H); }
  drawMinimap();
}
const MM = { x: 10, y: 8, w: 180, h: 12 };
function drawMinimap() {
  const k = MM.w / W, c = world.creature;
  g.fillStyle = 'rgba(20,30,25,.45)'; g.beginPath(); g.roundRect(MM.x - 3, MM.y - 3, MM.w + 6, MM.h + 6, 6); g.fill();
  g.fillStyle = 'rgba(140,190,120,.8)'; g.fillRect(MM.x, MM.y + 6, MM.w, 6);
  g.fillStyle = '#5aa0d8'; g.fillRect(MM.x + RIVER.x1 * k, MM.y + 5, (RIVER.x2 - RIVER.x1) * k, 7);
  if (world.bridge) { g.fillStyle = '#a67c52'; g.fillRect(MM.x + RIVER.x1 * k, MM.y + 5, (RIVER.x2 - RIVER.x1) * k, 2); }
  g.fillStyle = '#8d8778'; for (const sh of world.shelters) g.fillRect(MM.x + (sh.x - 30) * k, MM.y + 2, 60 * k, 5);
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.5; g.strokeRect(MM.x + camX * k, MM.y, VIEW * k, MM.h);
  g.fillStyle = '#b8c4cc'; g.fillRect(MM.x + world.robot.x * k - 2, MM.y + 4, 4, 4);
  for (const q of world.kith) { if (!q.alive) continue; g.fillStyle = `hsl(${q.genome.hue},60%,60%)`; g.beginPath(); g.arc(MM.x + q.x * k, MM.y + 6, q === c ? 4 : 3, 0, 7); g.fill(); if (q === c) { g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke(); } }
}
function drawRiver(t, dark) {
  const { x1, x2 } = RIVER;
  g.fillStyle = lerpC('4d86b8', '1d3550', Math.min(1, dark)); g.fillRect(x1, GROUND + 4, x2 - x1, H - GROUND);
  g.fillStyle = lerpC('6f5a3e', '2e261c', Math.min(1, dark)); g.fillRect(x1 - 6, GROUND - 2, 6, H - GROUND + 2); g.fillRect(x2, GROUND - 2, 6, H - GROUND + 2);
  g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 2;
  for (let i = 0; i < 4; i++) { g.beginPath(); for (let x = x1; x <= x2; x += 6) { const y = GROUND + 14 + i * 16 + Math.sin(x / 14 + t / 300 + i) * 2.5; x === x1 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); }
  if (world.bridge) {
    g.fillStyle = '#a67c52'; g.fillRect(x1 - 6, GROUND - 4, x2 - x1 + 12, 8);
    g.fillStyle = '#7d5a39'; for (let x = x1; x < x2; x += 14) g.fillRect(x, GROUND - 4, 2, 8);
  } else {
    g.save(); g.translate(x1 - 4, GROUND - 2); g.rotate(-Math.PI / 2 + 0.12); g.fillStyle = '#a67c52'; g.fillRect(0, -4, x2 - x1 + 8, 8); g.restore();
  }
}
function drawHill(dark) {
  g.fillStyle = lerpC('7aa05c', '263a28', Math.min(1, dark)); g.beginPath(); g.moveTo(2000, GROUND + 1); g.quadraticCurveTo(2250, GROUND - 110, W + 40, GROUND - 40); g.lineTo(W + 40, GROUND + 1); g.fill();
  const fl = ['#f2c14e', '#e0567a', '#ffffff', '#b58ae0'];
  for (let i = 0; i < 14; i++) { const x = 2060 + i * 24, y = GROUND - 6 - Math.max(0, 70 - Math.abs(x - 2250) * 0.45) * 0.9; g.fillStyle = fl[i % 4]; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
}
function drawBoard(t) {
  const x = world.pos.board, b = world.board, on = world.simTime < b.until;
  g.fillStyle = '#6b4f35'; g.fillRect(x - 3, GROUND - 60, 6, 60);
  g.fillStyle = '#8a6a48'; g.beginPath(); g.roundRect(x - 40, GROUND - 118, 80, 62, 8); g.fill();
  g.fillStyle = on ? '#fdf6e3' : '#3a4640'; g.beginPath(); g.roundRect(x - 33, GROUND - 111, 66, 48, 5); g.fill();
  if (on) { const [, word, ico] = BOARD[b.i]; g.font = '22px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(ico, x, GROUND - 84); g.fillStyle = '#23302a'; g.font = '800 15px Nunito, sans-serif'; g.fillText(word, x, GROUND - 67); g.textAlign = 'left'; }
  else { g.fillStyle = '#9fb3a8'; g.font = '700 11px Nunito, sans-serif'; g.textAlign = 'center'; g.fillText('WORDS', x, GROUND - 83); g.textAlign = 'left'; }
  g.fillStyle = '#d9534f'; g.beginPath(); g.arc(x + 30, GROUND - 50, 6, 0, 7); g.fill();
  if (!on) { g.fillStyle = '#fff'; g.font = '700 9px Nunito, sans-serif'; g.fillText('TAP', x + 22, GROUND - 38); }
}
function drawMusic(t) {
  const x = world.pos.music, on = world.simTime < world.musicUntil;
  g.fillStyle = '#b5534a'; g.beginPath(); g.roundRect(x - 20, GROUND - 34, 40, 34, 5); g.fill();
  g.fillStyle = '#f2c14e'; g.fillRect(x - 20, GROUND - 22, 40, 4);
  g.strokeStyle = '#6b4f35'; g.lineWidth = 3; const a = on ? t / 150 : 0.6;
  g.beginPath(); g.moveTo(x + 20, GROUND - 20); g.lineTo(x + 28 + Math.cos(a) * 8, GROUND - 20 + Math.sin(a) * 8); g.stroke();
  if (on) { g.fillStyle = '#2a2230'; g.font = '18px system-ui, sans-serif'; for (let i = 0; i < 3; i++) { const p = ((t / 1400 + i / 3) % 1); g.globalAlpha = 1 - p; g.fillText(i % 2 ? '♪' : '♫', x - 10 + Math.sin(p * 6 + i) * 18, GROUND - 40 - p * 60); } g.globalAlpha = 1; }
}
function drawLever() {
  const x = LEVER_X;
  g.fillStyle = '#6b6b6b'; g.beginPath(); g.roundRect(x - 10, GROUND - 12, 20, 12, 3); g.fill();
  g.strokeStyle = '#4a3a2a'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, GROUND - 8); const ang = world.bridge ? 0.6 : -0.6;
  g.lineTo(x + Math.sin(ang) * 30, GROUND - 8 - Math.cos(ang) * 30); g.stroke();
  g.fillStyle = world.bridge ? '#6fbf93' : '#d9534f'; g.beginPath(); g.arc(x + Math.sin(ang) * 30, GROUND - 8 - Math.cos(ang) * 30, 5, 0, 7); g.fill();
}
function drawBush() {
  for (const b of world.bushes) {
    const x = b.x;
    g.fillStyle = '#3f6e35'; g.beginPath(); g.arc(x - 18, GROUND - 22, 22, 0, 7); g.arc(x + 14, GROUND - 26, 26, 0, 7); g.arc(x, GROUND - 42, 22, 0, 7); g.fill();
    const spots = [[-20, -26], [10, -40], [22, -20], [-4, -14]];
    for (let i = 0; i < b.n; i++) { g.fillStyle = '#7b3fa0'; g.beginPath(); g.arc(x + spots[i][0], GROUND + spots[i][1], 5, 0, 7); g.fill(); }
  }
}
function drawTree(t) {
  const x = TREE_X;
  g.fillStyle = '#6b4f35'; g.fillRect(x - 9, GROUND - 120, 18, 120);
  g.fillStyle = '#3f6e35'; g.beginPath(); g.arc(x - 30, GROUND - 130, 38, 0, 7); g.arc(x + 28, GROUND - 138, 42, 0, 7); g.arc(x, GROUND - 170, 40, 0, 7); g.fill();
  const q = world.fauna.squirrel, qx = q.up ? x + 6 : q.x, qy = q.up ? GROUND - 100 : GROUND - 6;
  g.save(); g.translate(qx, qy); if (!q.up && q.tx < q.x) g.scale(-1, 1);
  g.fillStyle = '#b8692e'; g.beginPath(); g.ellipse(0, -5, 8, 6, 0, 0, 7); g.fill(); g.beginPath(); g.arc(8, -10, 5, 0, 7); g.fill();
  g.beginPath(); g.ellipse(-10, -12, 5, 10, -0.5 + Math.sin(t / 200) * 0.2, 0, 7); g.fill();
  g.fillStyle = '#2a2230'; g.fillRect(9, -12, 2, 2); g.restore();
}
function drawCactus() {
  const x = CACTUS_X;
  g.fillStyle = '#4f8a4a'; g.beginPath(); g.roundRect(x - 9, GROUND - 58, 18, 58, 8); g.fill();
  g.beginPath(); g.roundRect(x - 26, GROUND - 42, 10, 24, 5); g.fill(); g.fillRect(x - 20, GROUND - 26, 12, 7);
  g.beginPath(); g.roundRect(x + 16, GROUND - 48, 10, 22, 5); g.fill(); g.fillRect(x + 8, GROUND - 32, 12, 7);
  g.strokeStyle = '#e9f0d8'; g.lineWidth = 1; for (let i = 0; i < 8; i++) { const yy = GROUND - 52 + i * 6; g.beginPath(); g.moveTo(x - 9, yy); g.lineTo(x - 13, yy - 2); g.moveTo(x + 9, yy + 3); g.lineTo(x + 13, yy + 1); g.stroke(); }
  g.fillStyle = '#e0567a'; g.beginPath(); g.arc(x, GROUND - 60, 5, 0, 7); g.fill();
}
function drawHive(t) {
  const x = HIVE_X, h = world.fauna.hive;
  g.fillStyle = '#6b4f35'; g.fillRect(x - 2, GROUND - 60, 4, 60); g.fillRect(x - 2, GROUND - 60, 26, 4);
  g.fillStyle = '#e0a93a'; for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(x + 22, GROUND - 48 + i * 9, 14 - Math.abs(i - 1.5) * 3, 6, 0, 0, 7); g.fill(); }
  g.fillStyle = '#5a3f2b'; g.beginPath(); g.arc(x + 22, GROUND - 26, 3, 0, 7); g.fill();
  if (h.honey > 0) { g.fillStyle = '#f2c14e'; g.beginPath(); g.arc(x + 32, GROUND - 32, 3, 0, 7); g.fill(); }
  const n = 3 + Math.round(h.anger * 8);
  g.fillStyle = '#2a2230'; for (let i = 0; i < n; i++) { const a = t / (300 - h.anger * 150) + i * 2.1; g.fillRect(x + 22 + Math.cos(a) * (18 + h.anger * 14), GROUND - 36 + Math.sin(a * 1.3) * (14 + h.anger * 8), 2.5, 2.5); }
}
function drawSwarm(t) {
  const sw = world.fauna.swarm; if (!sw) return; const k = world.kith.find(x => x.id === sw.id); if (!k) return;
  g.fillStyle = '#2a2230'; for (let i = 0; i < 12; i++) { const a = t / 90 + i * 1.7; g.fillRect(k.x + Math.cos(a) * 24, GROUND - 40 + Math.sin(a * 1.4) * 22, 2.5, 2.5); }
}
function drawButterflies(t) {
  const wx = weatherAt(world.seed, world.simTime, world.scale); if (wx.night || wx.rain) return;
  for (const b of world.fauna.butterflies) {
    const y = b.y + Math.sin(t / 300 + b.ph) * 18, flap = Math.abs(Math.sin(t / 70 + b.ph));
    g.fillStyle = b.ph > 1 ? '#f2c14e' : '#6aa8e0'; g.beginPath(); g.ellipse(b.x - 4, y, 5, 3 + 3 * flap, 0.6, 0, 7); g.ellipse(b.x + 4, y, 5, 3 + 3 * flap, -0.6, 0, 7); g.fill();
    g.fillStyle = '#2a2230'; g.fillRect(b.x - 0.5, y - 3, 1.5, 7);
  }
}
function drawVendor(t) {
  const x = world.pos.vendor, st = world.vendor.stock;
  g.fillStyle = '#4f6d8a'; g.beginPath(); g.roundRect(x - 22, GROUND - 96, 44, 96, 7); g.fill();
  g.fillStyle = '#cfe3ef'; g.beginPath(); g.roundRect(x - 15, GROUND - 88, 30, 34, 4); g.fill();
  for (let i = 0; i < 3; i++) { g.fillStyle = i < st ? '#d7b77c' : 'rgba(0,0,0,.12)'; g.beginPath(); g.ellipse(x - 8 + i * 8, GROUND - 70, 4, 3, 0, 0, 7); g.fill(); }
  g.fillStyle = '#26323a'; g.fillRect(x - 14, GROUND - 22, 28, 10);
  g.fillStyle = st ? '#f2c14e' : '#7b7b7b'; g.beginPath(); g.arc(x + 12, GROUND - 40, 6, 0, 7); g.fill();
}
function drawShelters() { for (const sh of world.shelters) drawShelter(sh); }
function drawShelter(sh) {
  const x = sh.x, y = GROUND, r = 62, integ = sh.integ;
  g.fillStyle = '#8d8778'; g.beginPath(); g.arc(x, y, r, Math.PI, 0); g.fill();
  g.fillStyle = '#a39d8c'; for (let i = 0; i < 9; i++) { const a = Math.PI + (i + 0.5) * Math.PI / 9; g.beginPath(); g.arc(x + Math.cos(a) * 48, y + Math.sin(a) * 48, 9, 0, 7); g.fill(); }
  g.fillStyle = '#2b2620'; g.beginPath(); g.arc(x, y, 26, Math.PI, 0); g.fill();
  if (integ < 0.7) { g.strokeStyle = '#3d3830'; g.lineWidth = 2; const n = Math.round((1 - integ) * 8); for (let i = 0; i < n; i++) { const a = Math.PI + 0.3 + i * 0.35; g.beginPath(); g.moveTo(x + Math.cos(a) * 60, y + Math.sin(a) * 60); g.lineTo(x + Math.cos(a + 0.1) * 40, y + Math.sin(a + 0.1) * 42); g.stroke(); } }
}
function drawPatch() {
  world.patch.forEach((gr, i) => {
    const x = world.patchX[i], h = 6 + gr * 18;
    g.fillStyle = '#5a3f2b'; g.fillRect(x - 22, GROUND - 2, 44, 10);
    g.fillStyle = '#4e8a3a'; for (let k = -1; k <= 1; k++) { g.beginPath(); g.ellipse(x + k * 5, GROUND - h / 2, 3, h / 2, k * 0.3, 0, 7); g.fill(); }
    if (gr >= 1) { g.fillStyle = '#e8792b'; g.beginPath(); g.moveTo(x - 6, GROUND - 1); g.lineTo(x + 6, GROUND - 1); g.lineTo(x, GROUND + 7); g.fill(); }
  });
}
function drawItem(it, t) {
  const y = it.held ? it.y : GROUND - 8;
  if (it.type === 'ball') { if (!it.carried && !it.held && it.h > 2) { g.fillStyle = 'rgba(0,0,0,.15)'; g.beginPath(); g.ellipse(it.x, GROUND - 1, 10 - Math.min(6, it.h / 20), 3, 0, 0, 7); g.fill(); } const byy = it.carried ? GROUND - 30 : it.held ? Math.min(GROUND - 11, it.y) : GROUND - 11 - (it.h || 0); g.fillStyle = '#d9534f'; g.beginPath(); g.arc(it.x, byy, 11, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(it.x, byy, 11, -0.6 + it.x / 20, 0.6 + it.x / 20); g.stroke(); if (it.held) { } return; }
  if (it.type === 'doll') {
    const c = world.creature, hugged = c.hugging && c.act && Math.abs(it.x - c.x) < 20;
    const dx = it.x, dy = it.held ? Math.min(GROUND - 8, it.y) : hugged ? GROUND - 30 * csc(c) : it.carried ? GROUND - 26 : GROUND - 2;
    g.fillStyle = '#e8a0b4'; g.beginPath(); g.moveTo(dx - 8, dy); g.lineTo(dx + 8, dy); g.lineTo(dx + 4, dy - 14); g.lineTo(dx - 4, dy - 14); g.fill();
    g.fillStyle = '#f3d9c4'; g.beginPath(); g.arc(dx, dy - 19, 6, 0, 7); g.fill();
    g.fillStyle = '#7a4a2a'; g.beginPath(); g.arc(dx, dy - 21, 6, Math.PI, 0); g.fill();
    g.fillStyle = '#2a2230'; g.fillRect(dx - 3, dy - 19, 1.5, 1.5); g.fillRect(dx + 2, dy - 19, 1.5, 1.5);
    return;
  }
  if (it.type === 'top') {
    const sp = it.spin > world.simTime, a = sp ? t / 40 : 0, ty = it.held ? Math.min(GROUND - 8, it.y) : GROUND - 2, wob = sp ? Math.sin(t / 90) * 0.08 : 0.35;
    g.save(); g.translate(it.x, ty); g.rotate(wob);
    g.fillStyle = '#3d6cb9'; g.beginPath(); g.moveTo(0, 0); g.lineTo(-13, -14); g.lineTo(13, -14); g.fill();
    g.fillStyle = '#f2c14e'; for (let i = -1; i <= 1; i++) { const off = Math.sin(a + i) * 9; g.fillRect(off - 1.5, -14, 3, 11 - Math.abs(off) * 0.8); }
    g.fillStyle = '#e8792b'; g.beginPath(); g.ellipse(0, -14, 13, 3.5, 0, 0, 7); g.fill();
    g.fillStyle = '#6b4f35'; g.fillRect(-1.5, -22, 3, 8);
    g.restore(); return;
  }
  if (it.type === 'shroomB' || it.type === 'shroomR') {
    const y = it.held ? Math.min(GROUND - 8, it.y) : GROUND;
    g.fillStyle = '#efe6d2'; g.fillRect(it.x - 2.5, y - 9, 5, 9);
    g.fillStyle = it.type === 'shroomR' ? '#c8372d' : '#9a6a3f'; g.beginPath(); g.arc(it.x, y - 9, 8, Math.PI, 0); g.fill();
    if (it.type === 'shroomR') { g.fillStyle = '#fff'; g.fillRect(it.x - 5, y - 13, 2, 2); g.fillRect(it.x + 2, y - 15, 2, 2); g.fillRect(it.x - 1, y - 11, 2, 2); }
    return;
  }
  if (it.type === 'honey') { const y = it.held ? Math.min(GROUND - 8, it.y) : GROUND - 7; g.fillStyle = '#e8b53a'; g.beginPath(); g.roundRect(it.x - 6, y - 7, 12, 14, 3); g.fill(); g.fillStyle = '#fff5'; g.fillRect(it.x - 3, y - 4, 2, 6); return; }
  const rot = it.rotten;
  if (it.type === 'cake') { g.fillStyle = rot ? '#6f6a5c' : '#d7b77c'; g.beginPath(); g.ellipse(it.x, y, 12, 7, 0, 0, 7); g.fill(); g.fillStyle = rot ? '#55504a' : '#7a5a2a'; for (let k = -1; k <= 1; k++) g.fillRect(it.x + k * 5, y - 2, 2, 2); }
  if (it.type === 'berry') { g.fillStyle = rot ? '#5e5566' : '#7b3fa0'; g.beginPath(); g.arc(it.x, y, 6, 0, 7); g.fill(); g.fillStyle = '#4e8a3a'; g.fillRect(it.x - 1, y - 9, 2, 4); }
}
function drawRobot(t) {
  const R = world.robot, on = !!R.task, x = R.x, y = GROUND - 22 + (R.moving ? Math.abs(Math.sin(t / 120)) * -3 : Math.sin(t / 400) * 2);
  g.fillStyle = 'rgba(0,0,0,.15)'; g.beginPath(); g.ellipse(x, GROUND - 1, 14, 3, 0, 0, 7); g.fill();
  g.fillStyle = '#b8c4cc'; g.beginPath(); g.roundRect(x - 15, y - 15, 30, 28, 7); g.fill();
  g.fillStyle = '#26323a'; g.beginPath(); g.roundRect(x - 10, y - 9, 20, 10, 3); g.fill();
  const blink = (t % 3800) < 120;
  g.fillStyle = on ? '#7fe0c4' : '#9fb3bd'; if (!blink) { g.fillRect(x - 6, y - 6, 3, 4); g.fillRect(x + 3, y - 6, 3, 4); }
  g.strokeStyle = '#b8c4cc'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 15); g.lineTo(x, y - 24); g.stroke();
  g.fillStyle = on ? (Math.sin(t / 250) > 0 ? '#f2c14e' : '#e8792b') : '#7b7b7b'; g.beginPath(); g.arc(x, y - 25, 3.5, 0, 7); g.fill();
  g.fillStyle = '#8d9aa3'; g.fillRect(x - 12, y + 13, 7, 6); g.fillRect(x + 5, y + 13, 7, 6);
  if (R.carry) { g.fillStyle = '#d7b77c'; g.beginPath(); g.ellipse(x + 14, y - 2, 9, 5, 0, 0, 7); g.fill(); g.fillStyle = '#7a5a2a'; g.fillRect(x + 11, y - 3, 2, 2); g.fillRect(x + 16, y - 3, 2, 2); }
}
function drawEgg(c, t) {
  const left = Math.max(0, c.hatchAt - world.simTime), wob = left < 15e3 ? Math.sin(t / 60) * 0.15 : Math.sin(t / 700) * 0.04;
  g.save(); g.translate(c.x, GROUND - 2); g.rotate(wob);
  g.fillStyle = `hsl(${c.genome.hue},45%,86%)`; g.beginPath(); g.ellipse(0, -22, 17, 23, 0, 0, 7); g.fill();
  g.fillStyle = `hsl(${c.genome.hue},40%,62%)`; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(Math.sin(i * 2.1) * 9, -30 + i * 5, 2.5, 0, 7); g.fill(); }
  g.restore();
}
function drawCreature(c, t, wx) {
  const sc = { baby: 0.55, child: 0.75, adult: 1, elder: 0.95, dead: 0.95 }[c.stage] * c.genome.size;
  const hue = c.genome.hue, sat = c.stage === 'elder' ? 25 : c.stage === 'dead' ? 5 : 55;
  let x = c.x, y = GROUND;
  if (c.inWater) { y = GROUND + 26 + Math.sin(t / 180) * 5; x += Math.sin(t / 90) * 3; if (Math.random() < 0.3) fx('💧', x + (Math.random() - 0.5) * 50, GROUND + 5, '#5aa0d8'); }
  if (c.d.cold > 0.5 && c.alive) x += Math.sin(t / 30) * 1.5 * c.d.cold;
  const bob = c.dancing ? Math.abs(Math.sin(t / 160)) * 16 : c.moving ? Math.abs(Math.sin(t / 110)) * 4 : c.asleep ? Math.sin(t / 900) * 1.5 : 0;
  g.save(); g.translate(x, y - bob); if (c.dancing) g.rotate(Math.sin(t / 220) * 0.18); g.scale(c.dir < 0 ? -sc : sc, sc);
  if (c.stage === 'dead') g.rotate(-Math.PI / 2 * 0.95), g.translate(24, 8);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(0, 2 + bob / sc, 28, 5, 0, 0, 7); g.fill();
  const body = `hsl(${hue},${sat}%,58%)`, light = `hsl(${hue},${sat}%,78%)`, dk = `hsl(${hue},${sat}%,38%)`;
  g.fillStyle = dk; g.beginPath(); g.ellipse(-12, -3, 9, 5, 0, 0, 7); g.ellipse(12, -3, 9, 5, 0, 0, 7); g.fill();
  g.fillStyle = body; g.beginPath(); g.moveTo(-18, -58); g.lineTo(-30, -92); g.lineTo(-4, -64); g.fill(); g.beginPath(); g.moveTo(14, -60); g.lineTo(26, -94); g.lineTo(2, -64); g.fill();
  g.beginPath(); g.ellipse(0, -34, 30, c.asleep ? 26 : 32, 0, 0, 7); g.fill();
  g.fillStyle = light; g.beginPath(); g.ellipse(4, -26, 17, 17, 0, 0, 7); g.fill();
  const blink = !c.asleep && c.alive && (t % 4200) < 130;
  if (c.asleep || !c.alive || blink) { g.strokeStyle = '#2a2230'; g.lineWidth = 2.5; g.beginPath(); g.arc(-5, -44, 6, 0.2, Math.PI - 0.2); g.moveTo(21, -44); g.arc(15, -44, 6, 0.2, Math.PI - 0.2); g.stroke(); }
  else {
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(-5, -45, 8, 9, 0, 0, 7); g.ellipse(15, -45, 8, 9, 0, 0, 7); g.fill();
    const lookSky = c.gazing || (c.look && c.look.sky && world.simTime < c.look.until), lx = lookX(c), ahead = lx == null ? 0 : Math.sign((lx - c.x) * (c.dir || 1)) * (Math.abs(lx - c.x) > 20 ? 2 : 0);
    const scared = c.d.fear > 0.5, up = lookSky ? -4 : 0; g.fillStyle = '#2a2230'; g.beginPath(); g.arc(-3 + ahead, -44 + up, scared ? 2.5 : 4.5, 0, 7); g.arc(17 + ahead, -44 + up, scared ? 2.5 : 4.5, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(-2, -46, 1.3, 0, 7); g.arc(18, -46, 1.3, 0, 7); g.fill();
  }
  if (c.alive) {
    g.fillStyle = `hsla(${(hue + 330) % 360},70%,70%,.55)`; g.beginPath(); g.arc(-12, -33, 4, 0, 7); g.arc(24, -33, 4, 0, 7); g.fill();
    g.strokeStyle = '#2a2230'; g.lineWidth = 2; g.beginPath();
    const happy = c.d.hunger < 0.6 && c.d.cold < 0.5 && c.d.fear < 0.3 && c.d.lonely < 0.7;
    if (happy) g.arc(6, -34, 5, 0.3, Math.PI - 0.3); else { g.moveTo(1, -30); g.quadraticCurveTo(6, -35, 11, -30); }
    g.stroke();
  }
  g.restore();
  if (c === world.creature && world.kith.filter(k => k.alive && k.stage !== 'egg').length > 1) { g.strokeStyle = `hsla(${hue},60%,45%,.7)`; g.lineWidth = 2; g.beginPath(); g.ellipse(c.x, GROUND + 3, 30 * sc, 5, 0, 0, 7); g.stroke(); }
  if (c.alive && world.kith.length > 1) { g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '700 11px Nunito, sans-serif'; g.textAlign = 'center'; g.fillText(c.name, c.x, GROUND + 16); g.textAlign = 'left'; }
  if (c.asleep && c.alive) { g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '600 14px Nunito, sans-serif'; const z = (t / 1000) % 2; g.fillText('z', x + 20 * sc, y - 70 * sc - z * 10); g.fillText('z', x + 28 * sc, y - 82 * sc - z * 8); }
}
function bubbleAt(x, yTop, txt, fill) {
  g.font = '700 15px Nunito, sans-serif';
  const tw = g.measureText(txt).width + 20, bx = Math.max(camX + 6, Math.min(camX + VIEW - tw - 6, x - tw / 2)), by = yTop - 30;
  g.fillStyle = fill; g.beginPath(); g.roundRect(bx, by, tw, 28, 13); g.fill();
  g.beginPath(); g.moveTo(x - 5, by + 27); g.lineTo(x + 1, by + 36); g.lineTo(x + 6, by + 27); g.fill();
  g.fillStyle = '#23302a'; g.fillText(txt, bx + 10, by + 19);
}
function lookX(c) {
  if (c.look && world.simTime < c.look.until && !c.look.sky) return c.look.x;
  if (c.act && !c.act.done && c.act.tx != null && c.act.kind !== 'wander' && c.act.kind !== 'idle') return c.act.tx;
  return null;
}
function drawAttention(t) {
  const c = world.creature; if (!c.alive || c.stage === 'egg' || c.asleep || c.inWater) return;
  const lx = lookX(c); if (lx == null || Math.abs(lx - c.x) < 30) return;
  const y = GROUND - 128 + Math.sin(t / 300) * 3;
  g.fillStyle = `hsla(${c.genome.hue},65%,50%,.85)`; g.beginPath(); g.moveTo(lx - 7, y); g.lineTo(lx + 7, y); g.lineTo(lx, y + 9); g.fill();
}
function bubble(c) {
  const sc = { baby: 0.55, child: 0.75, adult: 1, elder: 0.95 }[c.stage] || 1;
  g.font = '700 16px Nunito, sans-serif';
  const txt = c.say, tw = g.measureText(txt).width + 22;
  let bx = Math.max(camX + 6, Math.min(camX + VIEW - tw - 6, c.x - tw / 2)), by = GROUND - 110 * sc - 40;
  g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.roundRect(bx, by, tw, 30, 14); g.fill();
  g.beginPath(); g.moveTo(c.x - 6, by + 29); g.lineTo(c.x + 2, by + 40); g.lineTo(c.x + 8, by + 29); g.fill();
  g.fillStyle = '#23302a'; g.fillText(txt, bx + 11, by + 21);
}
function thought(c, speaking) {
  const sc = { baby: 0.55, child: 0.75, adult: 1, elder: 0.95 }[c.stage] || 1;
  const icons = c.think.map(k => THINK[k] || '').join(' ');
  g.font = '20px system-ui, sans-serif';
  const tw = g.measureText(icons).width + 22, bx = Math.max(camX + 6, Math.min(camX + VIEW - tw - 6, c.x + 20)), by = GROUND - 110 * sc - (speaking ? 84 : 44);
  g.fillStyle = 'rgba(255,255,255,.82)'; g.beginPath(); g.roundRect(bx, by, tw, 32, 16); g.fill();
  g.beginPath(); g.arc(c.x + 14, by + 40, 5, 0, 7); g.arc(c.x + 8, by + 50, 3, 0, 7); g.fill();
  g.fillStyle = '#23302a'; g.fillText(icons, bx + 11, by + 23);
}
function drawWeather(wx) {
  if (!wx.rain) return;
  const n = wx.storm ? 90 : 45;
  while (particles.filter(p => p.w).length < n) particles.push({ w: 1, x: Math.random() * VIEW, y: -10 - Math.random() * H, v: wx.snow ? 40 + Math.random() * 30 : 380 + Math.random() * 200 });
  g.strokeStyle = wx.snow ? 'rgba(255,255,255,.9)' : 'rgba(210,225,240,.55)'; g.fillStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.2;
  for (const p of particles.filter(p => p.w)) {
    if (wx.snow) { g.beginPath(); g.arc(p.x, p.y, 2, 0, 7); g.fill(); } else { g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - 3, p.y + 12); g.stroke(); }
  }
}
function stepParticles(dt) {
  const wx = weatherAt(world.seed, world.simTime, world.scale);
  for (const p of particles) {
    if (p.w) { p.y += p.v * dt / 1000; p.x += (wx.snow ? Math.sin(p.y / 30) * 0.5 : -0.6); if (p.y > GROUND + 6) { p.y = -10; p.x = Math.random() * VIEW; } if (!wx.rain) p.dead = true; }
    else { p.y -= 30 * dt / 1000; p.life -= dt; if (p.life <= 0) p.dead = true; }
  }
  particles = particles.filter(p => !p.dead);
}
function fx(txt, x, y, color) { particles.push({ fx: txt, x, y, life: 1200, color }); }
function drawFx() { for (const p of particles.filter(p => p.fx)) { g.globalAlpha = Math.max(0, p.life / 1200); g.fillStyle = p.color; g.font = '700 18px Nunito, sans-serif'; g.fillText(p.fx, p.x, p.y); } g.globalAlpha = 1; }

// ---------- input ----------
let press = null, pointed = null;
const NAMEABLE = { hive: 'bees', honey: 'honey', cactus: 'cactus', squirrel: 'squirrel', butterfly: 'butterfly', shroomB: 'mushroom', shroomR: 'mushroom', tree: 'tree', sky: 'sky', sun: 'sun', moon: 'moon', star: 'star', cloud: 'cloud', rain: 'rain', flower: 'flower', kith: 'kith', doll: 'doll', top: 'toy', ball: 'ball', cake: 'food', berry: 'food', carrot: 'food', bush: 'food', shelter: 'shelter', robot: 'robot', self: 'self', river: 'water', music: 'music', vendor: 'machine' };
function toScreen(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * VIEW / r.width, y: (e.clientY - r.top) * H / r.height }; }
function toWorld(e) { const p = toScreen(e); return { x: p.x + camX, y: p.y }; }
function csc(c) { return ({ baby: 0.55, child: 0.75, adult: 1, elder: 0.95 }[c.stage] || 1) * c.genome.size; }
function hitThing(p) {
  const c = world.creature;
  const iy = i => (i.type === 'shroomB' || i.type === 'shroomR') ? GROUND - 8 : i.type === 'ball' ? GROUND - 11 - (i.h || 0) : i.type === 'doll' ? GROUND - 14 : i.type === 'top' ? GROUND - 12 : GROUND - 8;
  const it = world.items.slice().reverse().find(i => Math.hypot(i.x - p.x, iy(i) - p.y) < 24);
  if (it) return { kind: it.type, id: it.id, x: it.x, y: iy(it), r: 18, item: it };
  const hitK = world.kith.filter(k => k.alive && k.stage !== 'egg').sort((a, b) => (a === c ? -1 : b === c ? 1 : 0)).find(k => { const sc = csc(k); return Math.abs(p.x - k.x) < 34 * sc + 8 && p.y > GROUND - 90 * sc && p.y < GROUND + 10; });
  if (hitK) { const sc = csc(hitK); return { kind: hitK === c ? 'self' : 'kith', kith: hitK, x: hitK.x, y: GROUND - 36 * sc, r: 42 * sc, creature: true }; }
  const R = world.robot; if (Math.abs(p.x - R.x) < 22 && p.y > GROUND - 60 && p.y < GROUND + 4) return { kind: 'robot', x: R.x, y: GROUND - 24, r: 26 };
  for (let i = 0; i < world.patchX.length; i++) if (Math.abs(p.x - world.patchX[i]) < 18 && p.y > GROUND - 35 && p.y < GROUND + 12) return { kind: 'carrot', x: world.patchX[i], y: GROUND - 10, r: 18 };
  const Q = world.fauna.squirrel, qx = Q.up ? TREE_X + 6 : Q.x, qy = Q.up ? GROUND - 104 : GROUND - 8;
  if (Math.hypot(p.x - qx, p.y - qy) < 18) return { kind: 'squirrel', x: qx, y: qy, r: 16 };
  const bf = weatherAt(world.seed, world.simTime, world.scale).night ? null : world.fauna.butterflies.find(b => Math.abs(p.x - b.x) < 16 && Math.abs(p.y - b.y) < 30);
  if (bf) return { kind: 'butterfly', x: bf.x, y: bf.y, r: 14 };
  if (Math.abs(p.x - (HIVE_X + 18)) < 26 && p.y > GROUND - 62 && p.y < GROUND - 14) return { kind: 'hive', x: HIVE_X + 22, y: GROUND - 36, r: 26 };
  if (Math.abs(p.x - CACTUS_X) < 28 && p.y > GROUND - 66 && p.y < GROUND + 4) return { kind: 'cactus', x: CACTUS_X, y: GROUND - 32, r: 32 };
  if (Math.abs(p.x - TREE_X) < 60 && p.y > GROUND - 210 && p.y < GROUND) return { kind: 'tree', x: TREE_X, y: GROUND - 130, r: 60 };
  const shi = world.shelters.findIndex(sh => Math.abs(p.x - sh.x) < 62 && p.y > GROUND - 64 && p.y < GROUND + 5);
  if (shi >= 0) return { kind: 'shelter', idx: shi, x: world.shelters[shi].x, y: GROUND - 30, r: 60, movable: true };
  if (Math.abs(p.x - LEVER_X) < 22 && p.y > GROUND - 50 && p.y < GROUND + 6) return { kind: 'lever', x: LEVER_X, y: GROUND - 20, r: 22 };
  const P = world.pos;
  if (Math.abs(p.x - P.board) < 42 && p.y > GROUND - 120 && p.y < GROUND) return { kind: 'board', x: P.board, y: GROUND - 86, r: 44, movable: true };
  if (Math.abs(p.x - P.music) < 30 && p.y > GROUND - 50 && p.y < GROUND + 4) return { kind: 'music', x: P.music, y: GROUND - 18, r: 26, movable: true };
  if (Math.abs(p.x - P.vendor) < 26 && p.y > GROUND - 100 && p.y < GROUND + 4) return { kind: 'vendor', x: P.vendor, y: GROUND - 50, r: 50, movable: true };
  const bu = world.bushes.find(b => Math.abs(p.x - b.x) < 42 && p.y > GROUND - 68 && p.y < GROUND + 4); if (bu) return { kind: 'bush', x: bu.x, y: GROUND - 30, r: 40 };
  if (p.x > RIVER.x1 && p.x < RIVER.x2 && p.y > GROUND - 10) return { kind: 'river', x: (RIVER.x1 + RIVER.x2) / 2, y: GROUND + 20, r: 50 };
  if (p.x > 2040 && p.y > GROUND - 80 && p.y < GROUND + 4) return { kind: 'flower', x: p.x, y: p.y, r: 22 };
  if (p.y < GROUND - 90) {
    const sp = { x: p.x - camX, y: p.y }, o = skyObjs.orb;
    if (o && Math.hypot(sp.x - o.x, sp.y - o.y) < o.r + 8) return { kind: o.kind, screen: true, x: o.x, y: o.y, r: o.r };
    const cl = skyObjs.clouds.find(q => Math.hypot(sp.x - q.x, sp.y - q.y) < q.r);
    if (cl) return { kind: skyObjs.rain ? 'rain' : 'cloud', screen: true, x: cl.x, y: cl.y, r: cl.r };
    if (skyObjs.rain) return { kind: 'rain', screen: true, x: sp.x, y: sp.y, r: 24 };
    if (skyObjs.night) return { kind: 'star', screen: true, x: sp.x, y: sp.y, r: 18 };
    return { kind: 'sky', screen: true, x: sp.x, y: sp.y, r: 24 };
  }
  return null;
}
function point(th) {
  if (!th || !NAMEABLE[th.kind]) return;
  const same = pointed && pointed.kind === th.kind && now() - pointed.at < 1500;
  pointed = { kind: th.kind, x: th.x, y: th.y, r: th.r, screen: !!th.screen, kith: th.kith, at: now() };
  const c = world.creature;
  $('#msg').placeholder = th.kind === 'self' ? `Say its name, ${c.name}` : th.kind === 'kith' ? `Say its friend's name, ${th.kith.name}` : 'Name what you’re pointing at';
  if (same || th.kind === 'self') return;
  const m = meaningOf(pointed);
  for (const k of living(world)) {
    if (k !== c && Math.abs(k.x - c.x) > 250) continue;
    if (th.screen) { if (withKith(k, () => notice(world, k.x, m))) { k.look.sky = true; k.look.until = world.simTime + 5000; if (k === c && Math.random() < 0.6) { k.think = [THINK[th.kind] ? th.kind : 'question']; k.thinkUntil = world.simTime + 2500 * speed; } } }
    else if (withKith(k, () => notice(world, th.x, m)) && k === c && Math.random() < 0.5) { k.think = ['question']; k.thinkUntil = world.simTime + 2000 * speed; }
  }
}
function meaningOf(pt) { if (!pt) return null; if (pt.kind === 'kith') return pt.kith && pt.kith !== world.creature ? 'kin:' + pt.kith.id : 'self'; return NAMEABLE[pt.kind] || null; }
function pointedNow() { return pointed && now() - pointed.at < 10e3 ? pointed : null; }
canvas.addEventListener('pointerdown', e => {
  if (!world) return; const sp = toScreen(e);
  if (sp.x < MM.x + MM.w + 6 && sp.y < MM.y + MM.h + 8) { camX = Math.max(0, Math.min(W - VIEW, (sp.x - MM.x) / MM.w * W - VIEW / 2)); panAt = now(); return; }
  const p = toWorld(e); hand = p; handAt = now();
  const th = hitThing(p); point(th);
  if (th && th.movable) { press = { gadget: th, x0: p.x, y0: p.y, t0: now(), last: p, lt: now(), vx: 0, dragging: false, off: th.x - p.x }; canvas.setPointerCapture(e.pointerId); return; }
  if (th && useGadget(th)) return;
  if (th && th.item) { press = { item: th.item, x0: p.x, y0: p.y, t0: now(), last: p, lt: now(), vx: 0, dragging: false }; canvas.setPointerCapture(e.pointerId); return; }
  const c = world.creature;
  if (th && ['hive', 'squirrel', 'cactus'].includes(th.kind)) { useGadget(th); return; }
  if (th && th.creature) { if (th.kith && th.kith !== c) { select(th.kith); toast(`Now looking after ${th.kith.name}.`); } else doTickle(); }
  else if (c.stage === 'egg' && Math.abs(p.x - c.x) < 24) fx('♡', c.x - 6, GROUND - 55, '#f2c14e');
  else if (!th) { pan = { sx: sp.x, cam0: camX, moved: false }; canvas.setPointerCapture(e.pointerId); }
});
function spunByYou() {
  const c = world.creature;
  if (c.alive && c.stage !== 'egg' && !c.asleep && c.d.fear < 0.5 && c.d.hunger < 0.8) { c.bias = { kind: 'play', until: world.simTime + 15e3, s: 0.5 + 0.6 * c.genome.curiosity }; if (c.act && ['idle', 'wander', 'want'].includes(c.act.kind)) c.act.until = world.simTime; }
}
function useGadget(th) {
  const c = world.creature;
  if (th.kind === 'hive') { const h = world.fauna.hive; h.anger = clamp(h.anger + 0.5); if (h.honey > 0) { h.honey--; world.items.push({ id: nid(), type: 'honey', x: HIVE_X + 40, born: world.simTime }); toast('A drop of honey falls. The bees are cross.'); } else toast('No honey left, and now the bees are cross.'); return true; }
  if (th.kind === 'squirrel') { const q = world.fauna.squirrel; q.up = true; q.x = TREE_X; q.upUntil = world.simTime + 20e3; toast('The squirrel dashes up the tree.'); return true; }
  if (th.kind === 'cactus') { toast('Ouch. Spiky.'); return true; }
  if (th.kind === 'lever') { const down = toggleLever(world); toast(down ? 'The bridge is down.' : 'The bridge is up.'); save(); return true; }
  if (th.kind === 'music') { pressMusic(world, false); toast('The music box plays.'); return true; }
  if (th.kind === 'vendor') { if (pressVendor(world)) { fx('🍪', world.pos.vendor + 20, GROUND - 60, '#fff'); toast('A seed cake drops out.'); } else toast('The machine is empty until tomorrow.'); save(); return true; }
  if (th.kind === 'board') {
    const [m, word] = pressBoard(world, false), bx = world.pos.board;
    if (!c.alive || c.stage === 'egg') toast(`The board shows “${word}”.`);
    else if (c.asleep) toast(`The board shows “${word}”, but ${c.name} is asleep.`);
    else if (Math.abs(c.x - bx) < 320) { notice(world, bx, m); toast(`The board shows “${word}”. ${c.name} is watching…`); }
    else if (callOver(world, bx)) toast(`The board lights up “${word}”. ${c.name} comes over to look.`);
    else toast(`The board shows “${word}”, but ${c.name} can’t come and watch right now.`);
    return true;
  }
  return false;
}
canvas.addEventListener('pointermove', e => {
  if (!world) return;
  if (pan) { const sp = toScreen(e); if (Math.abs(sp.x - pan.sx) > 6) pan.moved = true; camX = Math.max(0, Math.min(W - VIEW, pan.cam0 - (sp.x - pan.sx))); panAt = now(); return; }
  const p = toWorld(e); hand = p; handAt = now();
  if (press) {
    const t = now(), dtm = Math.max(1, t - press.lt);
    press.vx = press.vx * 0.5 + ((p.x - press.last.x) / dtm * 1000) * 0.5; press.last = p; press.lt = t;
    if (press.gadget) {
      if (!press.dragging && Math.hypot(p.x - press.x0, p.y - press.y0) > 12) press.dragging = true;
      if (press.dragging) { const nx = Math.max(40, Math.min(W - 40, p.x + press.off)), gk = press.gadget; if (gk.kind === 'shelter') world.shelters[gk.idx].x = nx; else world.pos[gk.kind] = nx; if (pointed) { pointed.x = nx; pointed.at = now(); } if (p.x - camX > VIEW - 30) camX = Math.min(W - VIEW, camX + 6), panAt = now(); if (p.x - camX < 30) camX = Math.max(0, camX - 6), panAt = now(); }
      return;
    }
    if (!press.dragging && Math.hypot(p.x - press.x0, p.y - press.y0) > 10) { press.dragging = true; press.item.held = true; press.item.vx = 0; press.item.h = 0; press.item.vh = 0; }
    if (press.dragging) { const it = press.item; it.x = Math.max(15, Math.min(W - 15, p.x)); if (p.x - camX > VIEW - 30) camX = Math.min(W - VIEW, camX + 6), panAt = now(); if (p.x - camX < 30) camX = Math.max(0, camX - 6), panAt = now(); it.y = Math.min(GROUND - 8, p.y); pointed && (pointed.x = it.x, pointed.at = now()); }
  } else if (e.pointerType === 'mouse') { const th = hitThing(p); if (th) point(th); }
});
function release() {
  if (pan) { pan = null; return; }
  if (!press) return;
  if (press.gadget) {
    const gk = press.gadget;
    if (press.dragging) {
      const get = () => gk.kind === 'shelter' ? world.shelters[gk.idx].x : world.pos[gk.kind], set = v => gk.kind === 'shelter' ? (world.shelters[gk.idx].x = v) : (world.pos[gk.kind] = v);
      const x = get(); if (x > RIVER.x1 - 40 && x < RIVER.x2 + 40) set(x < (RIVER.x1 + RIVER.x2) / 2 ? RIVER.x1 - 45 : RIVER.x2 + 45);
      if (Math.abs(get() - LEVER_X) < 30) set(get() - 40);
      toast('Moved.'); save();
    } else if (now() - press.t0 < 400) useGadget(gk);
    press = null; return;
  }
  const it = press.item, quick = !press.dragging && now() - press.t0 < 350;
  if (it.type === 'top' && quick) { it.spin = world.simTime + 8000; spunByYou(); press = null; return; }
  if (it.type === 'ball') {
    if (quick) { kickBall(world, it.x >= press.x0 ? 1 : -1, 170 + Math.random() * 70, true); fx('!', it.x, GROUND - 40, '#f2c14e'); }
    else { it.held = false; const v = Math.max(-420, Math.min(420, press.vx * 0.8)); if (Math.abs(v) > 60) kickBall(world, Math.sign(v), Math.abs(v), true); }
  } else if (press.dragging) { it.held = false; if (FOOD[it.type]) it.byHand = world.simTime; }
  press = null; save();
}
canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', () => { if (!press) handAt = 0; });

function doTickle() {
  const r = tickle(world), c = world.creature; if (!r) return;
  fx('♥', c.x - 6, GROUND - 90, '#e0567a'); if (r.comfort) fx('♥', c.x + 10, GROUND - 100, '#e0567a');
  if (c.asleep) toast(`${c.name} stirs in its sleep.`);
  renderPanel();
}
function doScold() { const r = scold(world), c = world.creature; if (!r) return; fx('!', c.x - 3, GROUND - 95, '#d9534f'); renderPanel(); }

// ---------- talk / cortex ----------
function focusOf() {
  const c = world.creature, a = c.act;
  const pt = pointedNow(); if (pt && NAMEABLE[pt.kind] && pt.kind !== 'self' && attending(world)) return { m: NAMEABLE[pt.kind], label: 'the ' + pt.kind + ' you are pointing at' };
  const byRef = ref => { if (!ref) return null; if (ref.startsWith('bush')) return { m: 'food', label: 'a berry bush' }; if (ref.startsWith('obj:')) { const o = ref.slice(4); return { m: o === 'hive' ? 'bees' : o, label: o === 'hive' ? 'the beehive' : 'the ' + o }; } if (ref.startsWith('patch:')) return { m: 'food', label: 'a carrot' }; const it = world.items.find(i => 'item:' + i.id === ref); return it ? (it.type === 'ball' ? { m: 'ball', label: 'the ball' } : it.type === 'doll' ? { m: 'doll', label: 'its doll' } : it.type === 'top' ? { m: 'toy', label: 'the spinning top' } : { m: 'food', label: `a ${it.type === 'cake' ? 'seed cake' : it.type}` }) : null; };
  let f = a && a.target ? byRef(a.target) : null;
  if (f) return f;
  if (hand && now() - handAt < 8e3 && Math.abs(hand.x - c.x) < 100) return { m: 'you', label: 'your hand' };
  let best = null, bd = 90;
  for (const it of world.items) { const d = Math.abs(it.x - c.x); if (d < bd) { bd = d; best = byRef('item:' + it.id); } }
  world.patch.forEach((gr, i) => { const d = Math.abs(world.patchX[i] - c.x); if (gr >= 1 && d < bd) { bd = d; best = { m: 'food', label: 'a carrot' }; } });
  if (world.shelters.some(sh => Math.abs(c.x - sh.x) < 80) && bd > 40) best = { m: 'shelter', label: 'a shelter' };
  if (!best && Math.min(Math.abs(c.x - RIVER.x1), Math.abs(c.x - RIVER.x2)) < 70) best = { m: 'water', label: 'the river' };
  if (!best && Math.abs(c.x - world.pos.music) < 60) best = { m: 'music', label: 'the music box' };
  if (!best && Math.abs(c.x - world.pos.vendor) < 60) best = { m: 'machine', label: 'the food machine' };
  if (Math.abs(world.robot.x - c.x) < 70 && !best) best = { m: 'robot', label: `${world.robot.name} the robot` };
  return best;
}
function feelWords(D) {
  const lv = v => v > 0.8 ? 'very ' : v > 0.55 ? '' : v > 0.35 ? 'a bit ' : null;
  const out = [];
  for (const d of DRIVES) { const l = lv(D[d]); if (l != null) out.push(l + FEEL_WORD[d]); }
  return out.length ? out.join(', ') : 'content';
}
function relWords(r) {
  const lv = v => v > 0.7 ? 'deeply' : v > 0.45 ? 'quite' : v > 0.25 ? 'a little' : 'barely';
  return `trusts them ${lv(r.trust)}, loves them ${lv(r.affection)}, knows them ${lv(r.familiarity)}`;
}
function personality(c) {
  const g = c.genome, t = [];
  t.push(g.curiosity > 0.66 ? 'very curious' : g.curiosity < 0.33 ? 'cautious' : 'fairly curious');
  t.push(g.sociability > 0.66 ? 'very sociable' : g.sociability < 0.33 ? 'independent' : 'sociable');
  t.push(g.agreeable > 0.66 ? 'eager to please' : g.agreeable < 0.33 ? 'stubborn' : 'sometimes stubborn');
  t.push(g.hardiness > 0.66 ? 'hardy' : g.hardiness < 0.33 ? 'delicate' : 'fairly sturdy');
  return t.join(', ');
}
function wantsMenu() { return Object.entries(WANTS).map(([k, v]) => `${k}: ${v}`).join('; '); }
async function wishes(why) {
  const c = world.creature, wx = weatherAt(world.seed, world.simTime, world.scale);
  wishAt = performance.now();
  const recent = world.moments.filter(m => m.who === c.name).slice(-4).map(m => m.text).join(' ');
  try {
    const out = await sample.json(`You are the mind of ${c.name}, a small creature in a life-simulation game (like the Norns in Creatures). Its needs are met and it feels safe, so now it gets to choose what it wants to do for fun. ${why}
It is a ${c.stage}, and its personality is: ${personality(c)}.
It feels: ${feelWords(c.d)}. It's ${wx.night ? 'night' : wx.hour < 10 ? 'morning' : wx.hour < 17 ? 'daytime' : 'evening'}, ${wx.temp.toFixed(0)}°C${wx.rain ? ', raining' : ''}. ${world.playerName} is ${present() ? 'here watching' : 'away'}.
Bond with ${world.playerName}: it ${relWords(c.rel)}. ${socialText(c)} Beliefs: ${beliefsText(c)}. Words it knows: ${knownList(c)}.
Recent memories: ${recent || 'none yet'}
Above: the sky, with ${wx.night ? 'the moon and stars' : 'the sun and clouds'}. The garden, left to right: home (shelter and carrots), the meadow with the word board and music box, a river (${world.bridge ? 'bridge down' : 'bridge up, the water is dangerous'}), then a berry bush, the food machine, a cactus and a flowery hill. There's a tree with a squirrel near home, a beehive in the meadow (honey, but the bees sting), butterflies, and mushrooms (brown ones are fine, red-spotted ones make you sick).
What it has learned about them: ${wisdomText(c)}.
It ${c.riverFear > 0.5 ? 'is wary of the river' : c.riverFear > 0.2 ? 'is a little wary of the river' : 'does not yet know the river is dangerous'}.
Things it can do: ${wantsMenu()}.

Respond with JSON only: {"wants":[{"what":"...","where":"...","why":"..."}],"thought":["..."]}
wants: 1 to 3 things it wants to do next, in order, fitting its personality, mood, the time of day and what it has lived through. "what" must be one of: ${Object.keys(WANTS).join(', ')}. "where" only for explore: carrots, shelter, meadow, river, bush or hill. "why": its own reason in pre-verbal shorthand, at most 6 words, like "stars pretty" or "${world.playerName} smile when ball". Vary the choices; a young animal is playful and a bit surprising.
thought: 1 to 3 picture-words from: ${Object.keys(THINK).join(', ')}.`, { modelTier: 'quick' });
    consentOk = true;
    const got = setWants(world, out && out.wants);
    const th = ((out && out.thought) || []).filter(k => THINK[k]).slice(0, 3);
    if (th.length) { c.think = th; c.thinkUntil = world.simTime + 6000 * speed; }
    if (got.length) renderPanel();
  } catch (e) { if (e && e.code === 'not_granted') sample = null; }
}
function socialText(c) {
  const fr = living(world).filter(k => k !== c).map(k => { const r = c.kin[k.id] || { affection: 0 }; const rel = c.parents.includes(k.id) ? 'its parent ' : k.parents.includes(c.id) ? 'its child ' : ''; return `${rel}${k.name} (${r.affection > 0.6 ? 'very close' : r.affection > 0.3 ? 'friends' : 'barely knows'}${Math.abs(k.x - c.x) < 200 ? ', nearby' : ''})`; });
  const rr = c.robotRel; const rob = `${world.robot.name} the robot (${rr.affection > 0.5 ? 'fond of it' : rr.familiarity > 0.3 ? 'knows it' : 'still a stranger'}${Math.abs(world.robot.x - c.x) < 200 ? ', nearby' : ''})`;
  return `Other beings in the garden: ${fr.length ? fr.join('; ') + '; ' : ''}${rob}.`;
}
function wisdomText(c) {
  const v = c.objVal || {}, out = [];
  const say = (k, good, bad) => { const x = v[k] || 0; if (x < -0.35) out.push(bad); else if (x > 0.35) out.push(good); };
  say('hive', 'loves the honey', 'wary of the bees'); say('cactus', 'likes the cactus flower', 'knows the cactus pricks'); say('red', 'likes red mushrooms', 'knows red mushrooms make it sick');
  say('squirrel', 'loves chasing the squirrel', 'ignores the squirrel'); say('butterfly', 'loves chasing butterflies', 'ignores butterflies');
  return out.join('; ') || 'nothing yet, it is naive';
}
function beliefsText(c) { return (c.beliefs || []).map(b => `${b.about} (${b.feel > 0 ? 'good' : 'bad'}): "${b.text}"`).join('; ') || 'none yet'; }
function knownList(c) { return Object.entries(c.lex).filter(([, e]) => e.s >= 0.3).map(([w, e]) => `${w} = ${e.m}`).join(', ') || '(none yet)'; }
function heuristics(msg, words) {
  const c = world.creature, learned = [];
  const pn = world.playerName.toLowerCase(), cn = c.name.toLowerCase();
  for (const wd of words) { if (wd === pn) learned.push([wd, 'you']); if (wd === cn) learned.push([wd, 'self']); if (wd === world.robot.name.toLowerCase()) learned.push([wd, 'robot']); for (const k of world.kith) if (k !== c && wd === k.name.toLowerCase()) learned.push([wd, 'kin:' + k.id]); }
  if (!sample && words.length === 1 && !learned.length && !pointedNow()) {
    const f = focusOf(); let dom = null, dv = 0.6; for (const d of DRIVES) if (c.d[d] > dv) { dv = c.d[d]; dom = d; }
    if (dom && !f) learned.push([words[0], FEEL_WORD[dom]]);
    else if (f) learned.push([words[0], f.m]);
    else if (c.act && ['eat', 'play'].includes(c.act.kind)) learned.push([words[0], c.act.kind]);
  }
  return learned;
}
async function talk(msg) {
  const c = world.creature; msg = msg.trim(); if (!msg || !c.alive || c.stage === 'egg' || pending) return;
  const words = (msg.toLowerCase().match(/[a-z']+/g) || []).slice(0, 12);
  pushChat('you', msg); log(world, 'talk', `You spoke to ${c.name}`);
  c.d.lonely = clamp(c.d.lonely - 0.05); c.rel.familiarity = clamp(c.rel.familiarity + 0.005);
  if (c.asleep && c.d.tired < 0.45 && c.d.fear < 0.5) { c.asleep = false; toast(`${c.name} wakes up, a little groggy.`); }
  if (c.asleep) { pushChat(c.name, '(fast asleep)'); return; }
  const STOP = ['the', 'a', 'an', 'this', 'that', 'is', 'it', "it's", 'its', 'look', 'see', 'here', 'there', 'my', 'your', 'at', 'to', 'and', 'yes', 'no', 'oh', 'hey', 'hi', 'wow', 'good', 'nice'];
  const pt = pointedNow(), pm = meaningOf(pt);
  const taught = new Set();
  for (const [wd, m] of heuristics(msg, words)) { teach(world, wd, m); taught.add(wd); }
  if (pm) {
    const cand = words.filter(wd => !taught.has(wd) && !STOP.includes(wd) && wd !== world.playerName.toLowerCase() && !(c.lex[wd] && c.lex[wd].m !== pm && c.lex[wd].s >= 0.3));
    const pick = cand.length === 1 ? cand[0] : cand.find(wd => c.lex[wd] && c.lex[wd].m === pm);
    if (pick && (pm !== 'self' || pick === c.name.toLowerCase()) && (!pm.startsWith('kin:') || pick === pt.kith.name.toLowerCase())) {
      const att = attending(world);
      teach(world, pick, pm, att ? 1.6 : 1); taught.add(pick);
      for (const k of living(world)) if (k !== c && Math.abs(k.x - c.x) < 220 && !k.asleep && !(pm === 'self')) withKith(k, () => teach(world, pick, pm, 0.5));
      if (att) fx('✓', c.x + 10, GROUND - 100, '#6fbf93');
      toast(att ? `${c.name} looks where you point: “${pick}”` : `${c.name} half-notices: “${pick}”`);
    }
  }
  let reply = null;
  if (sample) {
    pending = true; speak(world, '…', 20000); renderTalk();
    try {
      const f = focusOf(), wx = weatherAt(world.seed, world.simTime, world.scale);
      const recent = world.moments.filter(m => m.who === c.name).slice(-4).map(m => m.text).join(' ');
      const prompt = `You are the mind of ${c.name}, a small creature in a life-simulation game in the spirit of the Norns from Creatures. You are not a chatbot: you are a naive young animal who can only use words it has been taught.
Life stage: ${c.stage} (baby: babbles, at most 1 real word; child: up to 3 words; adult: up to 6; elder: up to 5).
It feels: ${feelWords(c.d)}. It is ${c.asleep ? 'asleep' : c.act ? 'busy with: ' + c.act.kind : 'idle'}. It is looking at: ${f ? f.label : 'nothing in particular'}.${pm ? ` The player is pointing at ${pt.kind === 'self' ? 'the creature itself' : pt.kind === 'kith' ? 'its friend ' + pt.kith.name : 'the ' + pt.kind} while speaking (meaning: ${pm.startsWith('kin:') ? 'friend' : pm}).` : ''}
Weather: ${wx.temp.toFixed(0)}°C${wx.storm ? ', stormy' : wx.rain ? ', raining' : ''}${wx.night ? ', night' : ''}.
The player is called ${world.playerName}. The creature ${relWords(c.rel)}. ${socialText(c)}
Words it knows (word = meaning): ${knownList(c)}.
Allowed meanings: ${MEANINGS.join(', ')}.
Memories: ${recent || 'none yet'}
Beliefs it holds: ${beliefsText(c)}
The player just said: "${msg}"

Respond with JSON only, no prose, in exactly this shape:
{"learned":[{"word":"...","meaning":"..."}],"say":"...","mood":"happy|shy|sad|excited|calm|scared"}
learned: words the creature picks up from this message. Only single words that literally appear in the player's message and are not already known, and only when the context makes the meaning clear: a single word said while it looks at something names that thing; the player's own name means "you"; its own name means "self"; a feeling word while it strongly feels that feeling; a verb said while it is doing that action. Meaning must be one of the allowed meanings. At most 2. If unsure, return [].
say: the creature's reply, using only words it knows (plus words learned just now) and ! ? or . Babies mostly babble syllables like "ba mi". Keep it very short. Be honest to its feelings and relationship: don't show more affection than the relationship supports.`;
      const out = await sample.json(prompt, { modelTier: 'quick' });
      for (const l of (out && out.learned) || []) { const wd = String(l.word || '').toLowerCase(); if (words.includes(wd) && !knows(c, wd) && !taught.has(wd)) teach(world, wd, String(l.meaning || '')); }
      reply = out && out.say; consentOk = true;
    } catch (e) {
      if (e && e.code === 'not_granted') sample = null;
      for (const [wd, m] of heuristics(msg, words.slice(0, 1))) teach(world, wd, m);
    }
    pending = false;
  }
  const said = gateSpeech(c, reply || '');
  speak(world, said); pushChat(c.name, said);
  const o = obey(world, words.filter(wd => !taught.has(wd)));
  if (o) toast(o.ok ? `${c.name} seems to understand.` : `${c.name} doesn't feel like it.`);
  renderPanel(); save();
  if (world.pending.length) processNights(1);
}
function pushChat(who, text) { world.chat.push({ who, text, t: world.simTime }); if (world.chat.length > 30) world.chat.shift(); renderTalk(); }
async function greet(summary) {
  const c = world.creature; if (!c.alive || c.stage === 'egg') return;
  if (c.rel.affection > 0.25) { c.bias = { kind: 'approach', until: world.simTime + 20e3, s: 1.5 }; if (c.asleep && c.d.tired < 0.7) c.asleep = false; }
  if (c.asleep) return;
  let reply = null;
  if (sample) {
    try {
      const out = await sample.json(`You are the mind of ${c.name}, a small naive creature in a life-simulation game (like the Norns in Creatures) who can only use words it has been taught.
Life stage: ${c.stage} (baby: babbles, at most 1 word; child: up to 3; adult: up to 6).
The player, ${world.playerName}, just came back after ${summary.hours.toFixed(1)} hours away. While they were gone: ${summary.lines.join(' ')}
It feels: ${feelWords(c.d)}. It ${relWords(c.rel)}.
Beliefs it holds: ${beliefsText(c)}
Words it knows (word = meaning): ${knownList(c)}.
Respond with JSON only: {"say":"..."} — its greeting, using only known words and ! ? . Very short, honest to its feelings and relationship.`, { modelTier: 'quick' });
      reply = out && out.say; consentOk = true;
    } catch (e) { if (e && e.code === 'not_granted') sample = null; }
  }
  if (!reply) { const you = wordFor(c, 'you'); reply = you ? you + '!' : ''; }
  const said = gateSpeech(c, reply); speak(world, said, 6000); pushChat(c.name, said);
}

async function consolidate(night) {
  const c = world.creature, { text } = dayDigest(world, night.since, night.until);
  const out = await sample.json(`You are the dreaming mind of ${c.name}, a small naive creature in a life-simulation game (like the Norns in Creatures). It is a ${c.stage}. It has just slept through the night and its mind is making sense of the day.
Its day: ${text}.
Words it knows: ${knownList(c)}.
Beliefs it already holds: ${beliefsText(c)}.
Its bond with the player, ${world.playerName}: it ${relWords(c.rel)}. ${socialText(c)}

Respond with JSON only, in exactly this shape:
{"beliefs":[{"about":"...","feel":0.0,"text":"..."}],"dream":"...","wants":[{"what":"...","where":"...","why":"..."}]}
beliefs: 0 to 3 simple beliefs it forms or reinforces from this day. "about" must be one of: ${SUBJECTS.join(', ')}. "feel" runs from -1 (bad, avoid it) to 1 (good, seek it). "text" is how the creature itself would put it, in pre-verbal shorthand of at most 6 words, like "hand warm when thunder" or "${world.playerName} gone... cold". Beliefs can be naive or even wrong, as a young animal's are, but must come from what happened.
dream: one or two sentences in the third person, a narrator describing its dream, surreal and tender, built from the day's events. At most 45 words.
wants: 1 to 3 things it wakes up wanting to do today, once its needs are met, shaped by the day and the dream. "what" must be one of: ${Object.keys(WANTS).join(', ')} (${wantsMenu()}). "where" only for explore: carrots, shelter, meadow, river, bush or hill. "why": its reason in at most 6 words of shorthand.`, { modelTier: 'quick' });
  consentOk = true;
  return out || {};
}
async function processNights(llmBudget) {
  if (!world.pending.length || nightBusy) return [];
  nightBusy = true;
  const list = world.pending.splice(0).sort((p, q) => (p.id === world.creature.id) - (q.id === world.creature.id) || p.until - q.until), before = world.dreams.length, first = Math.max(0, list.length - llmBudget);
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    const k = world.kith.find(x => n.id ? x.id === n.id : x.name === n.name); if (!k) continue;
    if (i >= first && sample && k.alive) {
      try { const prev = world.creature; world.creature = k; let res; try { res = await consolidate(n); } finally { world.creature = prev; } withKith(k, () => applyNight(world, n, res)); continue; } catch (e) { if (e && e.code === 'not_granted') sample = null; }
    }
    withKith(k, () => ruleNight(world, n));
  }
  nightBusy = false; save(); renderPanel();
  const fresh = world.dreams.slice(before);
  if (fresh.length) toast('💭 ' + fresh[fresh.length - 1].text, 9000);
  return fresh;
}
async function cortex(why) {
  const c = world.creature, T = performance.now();
  if (!sample || !consentOk || pending || c.asleep || !c.alive || c.stage === 'egg' || T - cortexAt < 45e3) return;
  cortexAt = T;
  const opts = ['rest', 'wander', 'idle'];
  if (edible(world, c).length) opts.push('eat');
  if (world.items.some(i => i.type === 'ball')) opts.push('play');
  if (present()) opts.push('approach');
  const f = focusOf(), wx = weatherAt(world.seed, world.simTime, world.scale);
  try {
    const out = await sample.json(`You are the mind of ${c.name}, a small naive creature in a life-simulation game (like the Norns in Creatures). Its body runs on habits; you are the slow thinking part that wakes up when something important happens.
What just happened: ${why}.
It is a ${c.stage}. It feels: ${feelWords(c.d)}. Looking at: ${f ? f.label : 'nothing in particular'}. ${wx.temp.toFixed(0)}°C${wx.storm ? ', storm' : wx.rain ? ', rain' : ''}${wx.night ? ', night' : ''}. It is ${inShelter(world, c) ? 'inside' : 'outside'} the shelter.
Beliefs it holds: ${beliefsText(c)}. Its bond with ${world.playerName}: it ${relWords(c.rel)}.
Things it can choose to do: ${opts.join(', ')} (rest means go to the shelter; approach means go to ${world.playerName}).

Respond with JSON only: {"intent":"...","thought":["...","..."]}
intent: one of the choices above, what a young animal with these feelings and beliefs would want now.
thought: 1 to 3 picture-words showing what flashes through its mind, chosen from: ${Object.keys(THINK).join(', ')}.`, { modelTier: 'quick' });
    if (out && opts.includes(out.intent)) { c.bias = { kind: out.intent, until: world.simTime + 40e3, s: 0.8 }; if (c.act) c.act.until = world.simTime; }
    const th = ((out && out.thought) || []).filter(k => THINK[k]).slice(0, 3);
    if (th.length) { c.think = th; c.thinkUntil = world.simTime + 7000 * speed; }
  } catch (e) { if (e && e.code === 'not_granted') sample = null; }
}
const HAZ_TOAST = { stung: n => `Ouch! ${n} got stung by the bees.`, pricked: n => `${n} poked the cactus. Ouch.`, sick: n => `${n} ate a red mushroom and feels sick.`, honey: n => `${n} got some honey!` };
function hazardToast(name, e) { if (HAZ_TOAST[e]) toast(HAZ_TOAST[e](name)); }
function warnToast(e) { const [, a, b, h] = e.split(':'); const A = world.kith.find(k => k.id === a), B = world.kith.find(k => k.id === b); if (A && B) toast(`${A.name} warned ${B.name}${h === '1' ? ', who listened.' : '. ' + B.name + ' didn’t listen…'}`); }
function otherEvent(o) {
  const k = world.kith.find(x => x.id === o.id); if (!k) return;
  hazardToast(k.name, o.e);
  if (o.e === 'hatch') { toast(`${k.name} hatched!`); renderRoster(); }
  else if (o.e === 'splash') toast(`Splash! ${k.name} fell into the river.`);
  else if (o.e.startsWith('egg:')) askEggName(o.e.slice(4));
  else if (o.e === 'vend') toast(`${k.name} used the food machine.`);
}
function liveMind(ev) {
  for (const k of living(world)) if (k !== world.creature && !k.asleep && !(k.wants || []).length && withKith(k, () => content(k)) && (!k.wishAt || world.simTime - k.wishAt > 180e3)) { k.wishAt = world.simTime; withKith(k, () => ruleWants(world)); }
  const c = world.creature; if (!c.alive || c.stage === 'egg') return;
  if (ev.includes('storm')) cortex('A storm just rolled in');
  else if (ev.includes('thunder')) cortex('Thunder just crashed');
  if (ev.includes('night')) { if (consentOk) processNights(1); }
  for (const it of world.items) {
    const k = 'seen_' + it.type;
    if (!c.flags[k]) { c.flags[k] = true; if (c.flags.seen_ball || it.type !== 'ball') cortex(`Something new appeared in the garden: ${it.type === 'cake' ? 'a seed cake' : it.type}`); }
  }
  const high = DRIVES.filter(d => c.d[d] > 0.65);
  if (high.length >= 2 && performance.now() - conflictAt > 180e3) { conflictAt = performance.now(); cortex(`It feels torn: ${high.map(d => FEEL_WORD[d]).join(' and ')} at once`); }
  for (const e of ev) if (e.startsWith('want:')) { const k = e.slice(5); c.think = WANT_ICON[k] || ['happy']; c.thinkUntil = world.simTime + 4000 * speed; }
  if (ev.includes('fetched')) fx('♥', c.x - 6, GROUND - 90, '#e0567a');
  if (ev.includes('caught')) fx('♥', c.x - 6, GROUND - 90, '#e0567a');
  if (ev.includes('splash')) { toast(`Splash! ${c.name} fell into the river.`); fx('💦', c.x - 10, GROUND - 20, '#5aa0d8'); camX = Math.max(0, Math.min(W - VIEW, c.x - VIEW / 2)); cortex('It just fell into the cold river and is struggling in the water'); }
  if (ev.includes('avoided')) { c.think = ['water', 'scared']; c.thinkUntil = world.simTime + 3000 * speed; }
  if (ev.includes('board-taught')) { const [m, word] = BOARD[world.board.i]; fx('✓', c.x + 10, GROUND - 100, '#6fbf93'); toast(`${c.name} watches the board: “${word}”`); }
  if (ev.includes('vend')) toast(`${c.name} pressed the food machine and ate!`);
  if (ev.includes('bridge')) toast('The storm raised the bridge.');
  for (const e of ev) { hazardToast(c.name, e); if (e.startsWith('warned:')) warnToast(e); }
  if (ev.includes('robot-lever')) toast(`${world.robot.name} lowered the bridge.`);
  if (ev.includes('robot-warn')) toast(`${world.robot.name}: “water, no!”`);
  if (ev.includes('tock-bought')) fx(`-${TOCK_CAKE}`, world.robot.x - 10, GROUND - 60, '#e8b53a');
  if (ev.includes('tock-broke')) toast(`${world.robot.name} has no coins left to buy food.`);
  if (ev.includes('kick-back')) { c.think = ['ball', 'you']; c.thinkUntil = world.simTime + 2500 * speed; }
  if (!c.asleep && content(c) && !(c.wants || []).length) {
    const T = performance.now();
    if (sample && consentOk && !pending && T - wishAt > 180e3) wishes(c.flags.wished ? 'It has finished what it wanted to do.' : 'This is the first time it gets to choose.').then(() => { c.flags.wished = true; });
    else if ((!sample || !consentOk) && T - wishAt > 300e3) { wishAt = T; ruleWants(world); }
  }
  if (c.act && c.act !== lastActRef) {
    lastActRef = c.act;
    if (world.simTime > c.thinkUntil && ACT_THINK[c.act.kind] && Math.random() < 0.35) { c.think = [ACT_THINK[c.act.kind]]; c.thinkUntil = world.simTime + 3500 * speed; }
  }
}

// ---------- roster, why, news ----------
const STAGE_WORD = { egg: 'egg', baby: 'baby', child: 'child', adult: 'adult', elder: 'elder', dead: '†' };
function renderRoster() {
  const el = $('#roster'); if (!world) return;
  const ks = world.kith.filter(k => k.alive || (k.diedAt && world.simTime - k.diedAt < 60 * 60e3));
  if (ks.length < 2) { el.innerHTML = ''; return; }
  el.innerHTML = ks.map(k => `<button data-k="${k.id}" aria-pressed="${k === world.creature}"><span class="dot" style="background:hsl(${k.genome.hue},55%,58%)"></span>${esc(k.name)} <span class="st">${STAGE_WORD[k.stage] || ''}</span></button>`).join('');
  el.querySelectorAll('button').forEach(b => b.onclick = () => select(world.kith.find(k => k.id === b.dataset.k)));
}
const DRIVE_ADJ = { hunger: 'hungry', cold: 'cold', tired: 'tired', bored: 'bored', lonely: 'lonely', fear: 'scared' };
function whyText(c) {
  if (!c || c.stage === 'egg') return c ? `${esc(c.name)} is still an egg.` : '';
  if (!c.alive) return '';
  if (c.inWater) return `<strong>${esc(c.name)}</strong>: scared, soaked → trying to get out`;
  if (c.asleep) return `<strong>${esc(c.name)}</strong>: tired → sleeping`;
  const a = c.act; if (!a) return '';
  let mood = 'content'; let top = 0.3;
  for (const d of DRIVES) if (c.d[d] > top) { top = c.d[d]; mood = (c.d[d] > 0.75 ? 'very ' : '') + DRIVE_ADJ[d]; }
  let reason = mood;
  if (c.bias && c.bias.until > world.simTime && c.bias.kind === a.kind) reason = c.bias.s >= 2 ? `${world.robot.name} said so` : c.bias.s <= 0.8 ? `${mood}, thought it over` : `${mood}, you asked`;
  if (a.kind === 'want') reason = `content, ${c.genome.curiosity > 0.5 ? 'curious' : 'happy'}`;
  const why = a.kind === 'want' && a.want && a.want.why ? ` <span>“${esc(a.want.why)}”</span>` : '';
  return `<strong>${esc(c.name)}</strong>: ${reason} → ${esc(doingText(c).toLowerCase())}${why}`;
}
function pumpNews() {
  for (const k of world.kith) while (k.news && k.news.length) newsQ.push(k.news.shift());
  if (newsQ.length && now() - newsAt > 3600) { const n = newsQ.shift(); newsAt = now(); toast((n.kind === 'word' ? '💬 ' : n.kind === 'unlearned' ? '🌫️ ' : '💡 ') + n.text, 3400); }
}
let eggQueue = [];
function askEggName(id) {
  const k = world.kith.find(x => x.id === id); if (!k) return;
  const o = $('#eggname'); if (!o.hidden) { eggQueue.push(id); return; }
  const ps = k.parents.map(p => world.kith.find(x => x.id === p)).filter(Boolean).map(p => p.name);
  o.querySelector('p').textContent = ps.length ? `${ps.join(' and ')} made an egg together. It will hatch in about ${Math.round(24 / world.scale)} hours.` : 'A new egg for the garden.';
  $('#eggnm').value = ''; $('#eggnm').placeholder = k.name; o.dataset.k = id; o.hidden = false;
}
$('#eggname form').addEventListener('submit', e => {
  e.preventDefault(); const o = $('#eggname'), k = world.kith.find(x => x.id === o.dataset.k), nm = $('#eggnm').value.trim();
  if (k && nm) { for (const m of world.moments) if (m.id === undefined && m.text.includes(k.name)) m.text = m.text.replace(k.name, nm); for (const m of world.moments) if (m.text.endsWith(`called ${k.name}.`)) m.text = m.text.replace(`called ${k.name}.`, `called ${nm}.`); k.name = nm; }
  o.hidden = true; save(); renderRoster(); if (eggQueue.length) askEggName(eggQueue.shift());
});

// ---------- panels ----------
function bar(label, v, cls = '') { return `<div class="bar ${cls}"><span>${label}</span><i><b style="width:${Math.round(v * 100)}%"></b></i></div>`; }
function ageText(c) {
  if (c.stage === 'egg') { const s = Math.max(0, Math.ceil((c.hatchAt - world.simTime) / 1000)); return `Egg, hatching in ${s}s`; }
  if (!c.alive) return `Died of ${c.cause}`;
  const d = (world.simTime - c.born) / DAY, left = (c.dies - world.simTime) / DAY;
  const stage = { baby: 'Baby', child: 'Child', adult: 'Adult', elder: 'Elder' }[c.stage];
  return `${stage}, ${d < 1 ? Math.floor(d * 24) + ' hours' : d.toFixed(1) + ' days'} old${c.stage === 'elder' ? `, about ${Math.max(0, left).toFixed(1)} days left` : ''}`;
}
function doingText(c) {
  if (c.stage === 'egg' || !c.alive) return '';
  if (c.inWater) return 'Struggling in the river!';
  if (c.asleep) return inShelter(world, c) ? 'Asleep in the shelter' : 'Asleep outside';
  const a = c.act; if (!a) return 'Looking around';
  if (c.inWater) return 'Struggling in the river!';
  if (a.kind === 'vend') return 'Going to the food machine';
  if (a.kind === 'hug') return 'Hugging its doll';
  if (a.kind === 'poke') { const o = (a.target || '').slice(4); return { hive: 'Going for honey', cactus: 'Poking the cactus', squirrel: 'Chasing the squirrel', butterfly: 'Chasing a butterfly' }[o] || 'Investigating'; }
  if (a.kind === 'social') { const f = a.target && world.kith.find(k => 'kin:' + k.id === a.target); return f ? `Going to ${f.name}` : 'Looking for a friend'; }
  if (a.kind === 'music') return 'Off to the music box';
  if (a.kind === 'want') return a.what === 'explore' ? `Exploring the ${a.want.where}` : { friend: 'Playing with a friend', hug: 'Hugging its doll', music: 'Dancing to the music box', learn: 'Watching the word board', fetch: a.carry ? 'Bringing you the ball' : 'Fetching the ball', dance: 'Dancing', watch: 'Watching the sky', sing: 'Singing', practice: 'Practising words', play: 'Chasing the ball', cuddle: 'Snuggling up to you' }[a.what];
  return { eat: 'Going for food', play: 'Playing with the ball', rest: 'Heading to the shelter', approach: 'Coming to you', wander: 'Wandering', idle: 'Looking around', sleep: 'Dozing off' }[a.kind];
}
function fmtDay(d) { const t = d * DAY + new Date().getTimezoneOffset() * 60e3 + DAY / 2; return new Date(t).toLocaleDateString(undefined, { weekday: 'short' }); }
function wxText(f) { return f.storm ? 'Storm' : f.snow ? 'Snow' : f.rain ? 'Rain' : f.lo < 1 ? 'Frost' : 'Clear'; }
function renderPanel() {
  if (!world) return;
  const c = world.creature, el = $('#panel'), wx = weatherAt(world.seed, world.simTime, world.scale);
  $('#coins').textContent = world.coins;
  $('#cname').textContent = c.name; $('#cage').textContent = ageText(c); $('#cdoing').textContent = doingText(c);
  const gp = gameParts(world.simTime, world.scale), hh = Math.floor(gp.hour), mm = Math.floor((gp.hour - hh) * 60);
  $('#now').textContent = `Day ${gp.day - world.day0 + 1}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}, ${wx.temp.toFixed(0)}°C${wx.storm ? ', storm' : wx.snow ? ', snow' : wx.rain ? ', rain' : ''}`;
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  if (tab === 'care') {
    const D = c.d;
    el.innerHTML = c.stage === 'egg' ? `<p class="muted">Keep the egg company. It will hatch soon.</p>` : `
      <div class="grid2">
        <div><h3>Feelings</h3>${bar('Hunger', D.hunger, D.hunger > 0.75 ? 'warn' : '')}${bar('Cold', D.cold, D.cold > 0.6 ? 'warn' : '')}${bar('Tired', D.tired)}${bar('Bored', D.bored)}${bar('Lonely', D.lonely)}${bar('Scared', D.fear, D.fear > 0.5 ? 'warn' : '')}${bar('Health', c.health, c.health < 0.4 ? 'warn good' : 'good')}</div>
        <div><h3>Your bond</h3>${bar('Trust', c.rel.trust, 'bond')}${bar('Affection', c.rel.affection, 'bond')}${bar('Knows you', c.rel.familiarity, 'bond')}
        <div class="row"><button id="bt-tickle">Tickle</button><button id="bt-scold" class="ghost">Scold</button><button id="bt-rename" class="ghost">Rename</button></div>
        <p class="hint">Tickling rewards whatever ${c.name} just did. Scolding discourages it. Tap the ball to kick it. Point at something and say one word to name it. Drag the garden or tap the map to look around. Tap the lever, music box, word board, food machine or spinning top to use them. Drag gadgets and shelters to move them.</p></div>
      </div>`;
    const bt = $('#bt-tickle'); if (bt) { bt.onclick = doTickle; $('#bt-scold').onclick = doScold; $('#bt-rename').onclick = () => { const nm = (prompt(`New name for ${c.name}?`, c.name) || '').trim().slice(0, 16); if (nm) { c.name = nm; save(); renderRoster(); renderPanel(); } }; }
  } else if (tab === 'shop') {
    el.innerHTML = `<div class="shop">${Object.entries(SHOP).map(([k, it]) => `<div class="sku"><div><strong>${it.label}</strong><span class="muted">${it.note}</span></div><button data-buy="${k}" ${world.coins < it.price ? 'disabled' : ''}><span class="coin"></span>${it.price}</button></div>`).join('')}</div>
      <p class="hint">${esc(world.robot.name)} looks after everyone, even while you’re away. When a Kith is very hungry or weak, it first shows them free food (carrots, berries, the food machine), then buys seed cakes with your coins, ${TOCK_CAKE} each${world.tockSpent ? ` (${world.tockSpent} spent so far)` : ''}. Leave coins before a long absence, especially with a big family. Coins come from a daily allowance, time spent together, and new words ${c.name} learns.</p>`;
    el.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => buy(b.dataset.buy));
  } else if (tab === 'weather') {
    const fc = forecast(world.seed, world.simTime, 3, world.scale);
    el.innerHTML = `<div class="fc">${fc.map((f, i) => `<div class="day ${f.storm || f.lo < 1 ? 'alert' : ''}"><strong>${['Today', 'Tomorrow', 'Day after'][i]}</strong><span class="muted">${i === 0 ? 'now' : 'from ' + new Date(f.start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span><span>${wxText(f)}</span><span class="muted">${f.lo.toFixed(0)}° to ${f.hi.toFixed(0)}°</span></div>`).join('')}</div>
      ${world.shelters.map((sh, i) => bar(world.shelters.length > 1 ? 'Shelter ' + (i + 1) : 'Shelter', sh.integ, sh.integ < 0.4 ? 'warn good' : 'good')).join('')}
      <p class="hint">The bridge is ${world.bridge ? 'down' : 'up'}; storms raise it. Food machine: ${world.vendor.stock} left today. A garden day lasts ${24 / world.scale} real hours. Storms damage the shelter. Below about 8°C, ${c.name} gets cold outside. Carrots only grow above 4°C. Plan before you leave.</p>`;
  } else if (tab === 'words') {
    const lex = Object.entries(c.lex).sort((a, b) => b[1].s - a[1].s);
    el.innerHTML = lex.length ? `<div class="words">${lex.map(([w, e]) => `<div class="word ${e.s < 0.3 ? 'faint' : ''}"><strong>${w}</strong><span class="muted">${e.m}</span><i><b style="width:${Math.round(e.s * 100)}%"></b></i></div>`).join('')}</div><p class="hint">Faded words can't be spoken yet. Repeat them. Words stick best after a good sleep.</p>${teachHelp(c)}`
      : teachHelp(c);
  } else if (tab === 'brain') {
    if (c.stage === 'egg' || !c.alive) { el.innerHTML = `<p class="muted">Nothing to see yet.</p>`; }
    else {
      const sc = c.lastScores || [], mx = Math.max(0.01, ...sc.map(x => x[1]));
      const LABEL = { eat: 'Eat', play: 'Play', rest: 'Go to shelter', sleep: 'Sleep here', approach: 'Come to you', wander: 'Wander', idle: 'Sit still', want: 'Follow a wish', vend: 'Food machine', music: 'Music box', hug: 'Hug doll', social: 'Go to a friend', poke: 'Investigate something' };
      const habits = [];
      for (const d of DRIVES) for (const [a, v] of Object.entries(c.aff[d])) if (v >= 0.3 && LABEL[a] && a !== 'want') habits.push([d, a, v]);
      habits.sort((p, q) => q[2] - p[2]);
      const rels = [[`You (${esc(world.playerName)})`, c.rel.affection, c.rel.trust], [`${esc(world.robot.name)} the robot`, c.robotRel.affection, c.robotRel.trust]]
        .concat(living(world).filter(k => k !== c).map(k => { const r = c.kin[k.id] || { affection: 0, trust: 0 }; return [esc(k.name) + (c.parents.includes(k.id) ? ' (parent)' : k.parents.includes(c.id) ? ' (child)' : ''), r.affection, r.trust]; }));
      el.innerHTML = `<p class="why" style="margin:0 0 10px">${whyText(c)}</p>
        <h3>Last decision</h3><div class="brain">${sc.map((x, i) => `<div class="opt ${i === 0 ? 'win' : ''}"><span>${LABEL[x[0]] || x[0]}</span><i><b style="width:${Math.max(3, Math.round(Math.max(0, x[1]) / mx * 100))}%"></b></i><span class="muted">${x[1].toFixed(2)}</span></div>`).join('') || '<p class="muted">Deciding…</p>'}</div>
        <h3 style="margin-top:14px">Habits it has formed</h3>${habits.length ? habits.slice(0, 10).map(([d, a, v]) => `<p class="habit">When <strong>${DRIVE_ADJ[d]}</strong> → ${LABEL[a].toLowerCase()} <span class="muted">(${v > 0.8 ? 'strong' : v > 0.5 ? 'firm' : 'forming'})</span></p>`).join('') : '<p class="muted">None yet. Habits form as needs get relieved, and when you tickle or scold.</p>'}
        <h3 style="margin-top:14px">River</h3>${bar('Wariness', c.riverFear, c.riverFear > 0.5 ? 'good' : 'warn')}
        <h3 style="margin-top:14px">What it thinks of things</h3>${[['hive', 'Beehive'], ['cactus', 'Cactus'], ['red', 'Red mushrooms'], ['brown', 'Brown mushrooms'], ['squirrel', 'Squirrel'], ['butterfly', 'Butterflies']].map(([k, l]) => { const v = (c.objVal || {})[k] || 0; return `<p class="habit">${l}: <strong>${v < -0.35 ? 'avoids it' : v < -0.1 ? 'a bit wary' : v > 0.35 ? 'loves it' : v > 0.1 ? 'likes it' : 'not sure yet'}</strong></p>`; }).join('')}
        <h3 style="margin-top:14px">Relationships</h3>${rels.map(r => bar(r[0], r[1], 'bond')).join('')}
        <p class="hint">Bars show affection. ${esc(c.name)} is ${personality(c)}.</p>`;
    }
  } else if (tab === 'mind') {
    const bs = c.beliefs || [], ds = world.dreams.slice().reverse().slice(0, 12);
    const ws = c.wants || [];
    el.innerHTML = `<h3>What ${esc(c.name)} wants to do</h3>${ws.length ? `<div class="beliefs">${ws.map(x => `<div class="belief"><span class="ico">${(WANT_ICON[x.what] || []).map(k => THINK[k]).join('')}</span><div><strong>${WANT_LABEL[x.what]}${x.where ? ' (' + x.where + ')' : ''}</strong><span class="muted">“${esc(x.why)}”</span></div></div>`).join('')}</div><p class="hint">It follows these when it's fed, warm and safe. Needs always come first.</p>` : `<p class="muted">${content(c) ? 'Deciding what to do next…' : `Nothing for now. ${esc(c.name)} has needs to take care of first.`}</p>`}
      <h3 style="margin-top:16px">What ${esc(c.name)} believes</h3>${bs.length ? `<div class="beliefs">${bs.map(b => `<div class="belief ${b.feel < 0 ? 'neg' : ''}"><span class="ico">${THINK[b.about === 'night' ? 'sleep' : b.about] || '?'}</span><div><strong>“${esc(b.text)}”</strong><i><b style="width:${Math.round(Math.abs(b.feel) * b.s * 100)}%"></b></i></div></div>`).join('')}</div>` : `<p class="muted">Nothing yet. Beliefs form overnight, from how the day went.</p>`}
      <h3 style="margin-top:16px">Dreams</h3>${ds.length ? `<ol class="mem">${ds.map(d => `<li><span class="muted">${esc(d.who)}, ${new Date(d.t).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>${esc(d.text)}</li>`).join('')}</ol>` : `<p class="muted">No dreams yet. After each night's sleep, ${esc(c.name)}'s dream appears here.</p>`}`;
  } else if (tab === 'memories') {
    const ms = world.moments.slice().reverse();
    el.innerHTML = ms.length ? `<ol class="mem">${ms.map(m => `<li><span class="muted">${new Date(m.t).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>${esc(m.text)}</li>`).join('')}</ol>` : `<p class="muted">Moments you share will be kept here.</p>`;
  } else if (tab === 'time') {
    el.innerHTML = `<p class="hint">A garden day lasts ${24 / world.scale} real hours, and ${esc(c.name)} lives about two real weeks. Test controls below: skipping time counts as being away.</p>
      <div class="row wrap"><button data-skip="1">Skip 1 hour</button><button data-skip="6">Skip 6 hours</button><button data-skip="24">Skip 1 day</button></div>
      <div class="row wrap"><button data-speed="1" class="${speed === 1 ? '' : 'ghost'}">Real time</button><button data-speed="60" class="${speed === 60 ? '' : 'ghost'}">60× speed</button></div>
      <div class="row"><button id="bt-reset" class="ghost danger">Start over</button></div>`;
    el.querySelectorAll('[data-skip]').forEach(b => b.onclick = () => skip(+b.dataset.skip));
    el.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => { speed = +b.dataset.speed; renderPanel(); });
    $('#bt-reset').onclick = () => { if (confirm('Erase this world and start again?')) { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); } };
  }
}
function teachHelp(c) {
  return `<h3 style="margin-top:14px">Three ways to teach words</h3><ol class="hint" style="padding-left:18px;margin:0">
  <li><strong>Point and name.</strong> Point at something (hover, or tap on a phone), then type its name, like "ball". Works best when ${esc(c.name)} is nearby and looking.</li>
  <li><strong>The word board</strong> in the meadow. Tap it: it lights up with a picture and a word for 12 seconds, and ${esc(c.name)} comes over to watch. The board keeps showing a word until it sticks, then moves on to a new one. Drag it closer to home if you like.</li>
  <li><strong>Just talk.</strong> Say your name often, and name feelings while ${esc(c.name)} has them ("hungry" when it's hungry).</li></ol>`;
}
function esc(s) { return String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
function renderTalk() {
  const box = $('#chat'); if (!world) return;
  box.innerHTML = world.chat.slice(-5).map(m => `<p class="${m.who === 'you' ? 'me' : ''}"><strong>${m.who === 'you' ? esc(world.playerName) : esc(m.who)}</strong> ${esc(m.text)}</p>`).join('');
}
function buy(k) {
  const it = SHOP[k]; if (world.coins < it.price) return;
  world.coins -= it.price;
  const x = hand && now() - handAt < 20e3 ? hand.x : camX + VIEW / 2 + (Math.random() - 0.5) * 60;
  if (k === 'cake') world.items.push({ id: nid(), type: 'cake', x, born: world.simTime });
  if (k === 'berries') { world.items.push({ id: nid(), type: 'berry', x: x - 10, born: world.simTime }); world.items.push({ id: nid(), type: 'berry', x: x + 10, born: world.simTime }); }
  if (k === 'repair') for (const sh of world.shelters) sh.integ = clamp(sh.integ + 0.5);
  if (k === 'doll' || k === 'top') world.items.push({ id: nid(), type: k, x, born: world.simTime });
  if (k === 'shelter') { buyShelter(world, camX + VIEW / 2); }
  if (k === 'bush') plantBush(world, camX + VIEW / 2);
  if (k === 'carrots') plantCarrots(world, camX + VIEW / 2 - 45);
  if (k === 'egg') { if (world.kith.filter(x => x.alive).length >= 6) { world.coins += it.price; toast('The garden is full: six Kith at most.'); return; } const egg = newCreature(freshName(world), world.simTime, newGenome(), Math.max(40, Math.min(W - 40, camX + VIEW / 2))); egg.hatchAt = world.simTime + 60e3; world.kith.push(egg); askEggName(egg.id); renderRoster(); }
  toast(`Bought: ${it.label.toLowerCase()}`); renderPanel(); save();
}
let toastT = 0;
function toast(t, ms = 3200) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, ms); }

// ---------- absence ----------
function skip(hours) {
  const since = world.simTime; world.offset += hours * HOUR; catchUp(world, now()); homecoming(since);
}
function homecoming(since) {
  const sum = awaySummary(world, since), c = world.creature;
  if (checkDeaths()) return;
  const o = $('#away');
  o.querySelector('h2').textContent = `You were away ${sum.hours < 1 ? Math.round(sum.hours * 60) + ' minutes' : sum.hours.toFixed(1) + ' hours'}`;
  o.querySelector('ul').innerHTML = sum.lines.map(l => `<li>${esc(l)}</li>`).join('');
  o.querySelector('button').textContent = c.stage === 'egg' ? 'Back to the egg' : `Go to ${c.name}`;
  o.querySelector('button').onclick = async () => { o.hidden = true; renderPanel(); await processNights(2); greet(sum); };
  o.hidden = false; save();
}
function checkDeaths() {
  for (const k of world.kith) if (!k.alive && k.diedAt && !k.mourned) { showDeath(k); return true; }
  return false;
}
function showDeath(k) {
  const o = $('#death'); k.mourned = true;
  o.querySelector('h2').textContent = `${k.name} has died`;
  o.querySelector('.cause').textContent = `${k.name} died of ${k.cause}, aged ${((k.diedAt - k.born) / DAY).toFixed(1)} days.`;
  o.querySelector('ol').innerHTML = world.moments.filter(m => (m.id ? m.id === k.id : m.who === k.name)).map(m => `<li>${esc(m.text)}</li>`).join('');
  const others = living(world).length + world.kith.filter(x => x.stage === 'egg').length;
  o.querySelector('.newegg').hidden = others > 0;
  o.querySelector('button').textContent = others > 0 ? 'Go back to the others' : 'Place a new egg';
  o.hidden = false; save();
}
$('#death form').addEventListener('submit', e => {
  e.preventDefault();
  const alive = world.kith.filter(k => k.alive);
  if (!alive.length) {
    const nm = $('#newname').value.trim() || freshName(world), egg = newCreature(nm, world.simTime, newGenome(), camX + VIEW / 2);
    world.kith.push(egg); select(egg); world.chat = [];
  } else if (!world.creature.alive) select(alive.find(k => k.stage !== 'egg') || alive[0]);
  $('#death').hidden = true; save(); renderPanel(); renderTalk();
});
function suggestName() { const a = ['Pip', 'Moss', 'Tansy', 'Bram', 'Wren', 'Nib', 'Olly', 'Fen', 'Juniper', 'Quill']; return a[Math.floor(Math.random() * a.length)]; }

// ---------- loop ----------
function frame(t) {
  const real = Math.min(250, t - lastFrame); lastFrame = t;
  if (world) {
    if (present()) {
      const dt = real * speed, sub = Math.max(1, Math.ceil(dt / 200));
      for (let i = 0; i < sub; i++) {
        const ev = step(world, dt / sub, ctx());
        if (ev.includes('thunder')) flash = 0.7;
        if (ev.length) liveMind(ev);
        if (ev.includes('hatch')) { toast(`${world.creature.name} hatched!`); renderRoster(); renderPanel(); }
        for (const o of ev.others || []) otherEvent(o);
        for (const e of ev) if (e.startsWith('egg:')) askEggName(e.slice(4));
      }
      world.offset = world.simTime - now();
      liveMind([]);
      coinTick(real);
      pumpNews();
      if ($('#death').hidden) checkDeaths();
    }
    stepParticles(real); draw(t);
    saveAcc += real; if (saveAcc > 5000) { saveAcc = 0; save(); }
    renderPanelLive();
  }
  requestAnimationFrame(frame);
}
let lastLive = 0;
function renderPanelLive() {
  const wy = $('#why'); if (wy) wy.innerHTML = whyText(world.creature); const t = performance.now(); if (t - lastLive < 1000) return; lastLive = t; if (!document.activeElement || !document.activeElement.closest || !document.activeElement.closest('#panel')) renderPanel(); }
document.addEventListener('visibilitychange', () => {
  if (!world) return;
  if (document.visibilityState === 'hidden') save();
  else { const since = world.simTime; catchUp(world, now()); if (world.simTime - since > 20 * 60e3) homecoming(since); }
});
window.addEventListener('pagehide', save);
window.addEventListener('resize', resize);

document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { tab = b.dataset.tab; renderPanel(); });
$('#talk').addEventListener('submit', e => { e.preventDefault(); const i = $('#msg'); const v = i.value; i.value = ''; talk(v); i.placeholder = 'Say something'; });
$('#start').addEventListener('submit', e => {
  e.preventDefault();
  const pn = $('#pname').value.trim(), cn = $('#cnamein').value.trim() || $('#cnamein').placeholder || suggestName(), cn2 = $('#cname2').value.trim() || $('#cname2').placeholder || suggestName();
  if (!pn) { $('#perr').hidden = false; return; }
  world = newWorld(Math.floor(Math.random() * 1e9), now(), pn, cn, cn2 === cn ? cn2 + ' II' : cn2); world.day0 = gameParts(world.simTime, world.scale).day; $('#intro').hidden = true; save(); renderRoster(); renderPanel(); renderTalk();
});
$('#pname').addEventListener('input', () => $('#perr').hidden = true);

(async function init() {
  resize();
  world = load();
  if (world) {
    if (!world.kith) world.kith = [world.creature];
    world.creature = world.kith.find(k => k.id && k.id === world.sel) || world.kith.find(k => k.alive) || world.kith[0];
    if (!world.robot) world.robot = newRobot();
    if (!world.patchX) world.patchX = [470, 515, 560];
    if (!world.bushes) world.bushes = [{ x: BUSH_X, n: world.bush ? world.bush.n : 2, g: world.bush ? world.bush.g : 0 }];
    if (!world.fauna) world.fauna = newFauna();
    for (const k of world.kith) {
      if (!k.id) k.id = nid(); k.objVal = k.objVal || { hive: 0, cactus: 0, squirrel: 0.1, butterfly: 0.1, red: 0, brown: 0 }; k.kin = k.kin || {}; k.robotRel = k.robotRel || { familiarity: 0, affection: 0.05, trust: 0.15 }; k.skill = k.skill || {}; k.news = k.news || []; k.parents = k.parents || []; k.gen = k.gen || 1; k.lastScores = k.lastScores || []; k.wants = k.wants || []; k.beliefs = k.beliefs || []; if (k.riverFear == null) k.riverFear = 0; if (k.lastConsol == null) k.lastConsol = world.simTime;
      for (const d of DRIVES) for (const a of ['social', 'hug', 'vend', 'music', 'want', 'poke']) if (k.aff[d][a] == null) k.aff[d][a] = a === 'social' && d === 'lonely' ? 0.3 : a === 'poke' && d === 'bored' ? 0.25 : 0.02;
    }
    if (!world.scale) { world.scale = SCALE; const oc0 = world.creature; for (const d of DRIVES) for (const a in oc0.aff[d]) { oc0.aff[d][a] = Math.min(oc0.aff[d][a], 1.2); if (a === 'approach' && d !== 'lonely' && d !== 'fear') oc0.aff[d][a] = Math.min(oc0.aff[d][a], 0.05); } }
    if (world.day0 == null) world.day0 = gameParts(world.simTime, world.scale).day;
    if (world.bridge == null) Object.assign(world, newGadgets());
    if (!world.pos) world.pos = { board: 830, music: 970, vendor: 1760 };
    if (!world.shelters) world.shelters = [{ x: SHELTER_X, integ: world.shelter != null ? world.shelter : 1 }];
    for (const d of DRIVES) if (world.creature.aff[d].hug == null) world.creature.aff[d].hug = d === 'lonely' ? 0.2 : d === 'fear' ? 0.15 : 0.02; const oc1 = world.creature; if (oc1.riverFear == null) oc1.riverFear = 0; for (const d of DRIVES) for (const a of ['vend', 'music']) if (oc1.aff[d][a] == null) oc1.aff[d][a] = 0.02;
    world.dreams = world.dreams || []; world.creature.wants = world.creature.wants || []; for (const d of DRIVES) if (world.creature.aff[d].want == null) world.creature.aff[d].want = 0; world.pending = world.pending || []; const oc = world.creature; oc.beliefs = oc.beliefs || []; if (oc.lastConsol == null) oc.lastConsol = world.simTime;
    const since = world.simTime; catchUp(world, now()); renderRoster(); renderPanel(); renderTalk();
    if (!checkDeaths() && world.simTime - since > 20 * 60e3) homecoming(since);
  } else { const a = suggestName(); let b = suggestName(); while (b === a) b = suggestName(); $('#cnamein').placeholder = a; $('#cname2').placeholder = b; $('#intro').hidden = false; }
  requestAnimationFrame(frame);
  try { if (window.claude && window.claude.use) sample = await window.claude.use('sample'); } catch (e) { sample = null; }
  $('#llm').textContent = sample ? 'Mind: Claude' : 'Mind: simple';
})();
