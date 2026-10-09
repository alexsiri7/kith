const HOUR = 3600e3, DAY = 24 * HOUR;
const W = 2400, VIEW = 800, GROUND = 360;
const SHELTER_X = 95, DOCK_X = 700;
const RIVER = { x1: 1180, x2: 1300 };
const LEVER_X = 1135, BOARD_X = 830, MUSIC_X = 970, BUSH_X = 1520, VENDOR_X = 1760, HILL_X = 2250;
const BOARD = [['ball', 'ball', '⚽'], ['food', 'food', '🥕'], ['shelter', 'home', '🏠'], ['eat', 'eat', '😋'], ['play', 'play', '🎈'], ['sleep', 'sleep', '💤'], ['come', 'come', '👋'],
  ['hungry', 'hungry', '🍽️'], ['cold', 'cold', '❄️'], ['tired', 'tired', '🥱'], ['happy', 'happy', '😊'], ['water', 'water', '🌊'], ['scared', 'scared', '😨'], ['good', 'good', '👍'], ['music', 'music', '🎵']];
const PATCH_X = [470, 515, 560];
const LIFESPAN_DAYS = 14;
const SCALE = 6;
const DRIVES = ['hunger', 'cold', 'tired', 'bored', 'lonely', 'fear'];
const ACTIONS = ['eat', 'play', 'rest', 'sleep', 'approach', 'wander', 'idle', 'want', 'vend', 'music', 'hug', 'social', 'poke'];
const WANTS = {
  fetch: 'carry the ball over to the player',
  dance: 'hop and wiggle on the spot, just for joy',
  explore: 'go and sniff around a spot: carrots, hill, shelter or middle',
  watch: 'sit and gaze at the sky, the clouds, rain or stars',
  sing: 'babble a little song',
  practice: 'say one of its known words over and over to itself',
  play: 'chase the ball around',
  cuddle: 'go and sit close to the player',
  hug: 'go and hug its doll',
  friend: 'go and play with another Kith it likes',
  chase: 'chase the squirrel or the butterflies',
  honey: 'try to get honey from the beehive (risky: the bees may sting)',
  music: 'crank the music box and dance to it',
  learn: 'press the word board and watch the pictures and words'
};
const SPOTS = { carrots: 515, shelter: 95, meadow: 640, river: 1140, bush: 1520, hill: 2250, middle: 640 };
const SPOT_NAMES = ['carrots', 'shelter', 'meadow', 'river', 'bush', 'hill'];
const DRIVE_W = { hunger: 1, cold: 1.2, tired: 0.6, bored: 0.5, lonely: 0.7, fear: 0.8 };
const MEANINGS = ['bees', 'honey', 'cactus', 'squirrel', 'butterfly', 'mushroom', 'tree', 'no', 'sky', 'sun', 'moon', 'star', 'cloud', 'rain', 'flower', 'friend', 'you', 'self', 'food', 'ball', 'shelter', 'robot', 'water', 'music', 'machine', 'doll', 'toy', 'eat', 'play', 'sleep', 'come', 'stop',
  'hungry', 'cold', 'tired', 'bored', 'lonely', 'scared', 'hurt', 'happy', 'good', 'bad', 'love'];
const FEEL_WORD = { hunger: 'hungry', cold: 'cold', tired: 'tired', bored: 'bored', lonely: 'lonely', fear: 'scared' };
const MEANING_ACTION = { friend: 'social', doll: 'hug', toy: 'play', music: 'music', machine: 'vend', eat: 'eat', food: 'eat', play: 'play', ball: 'play', sleep: 'rest', shelter: 'rest', come: 'approach', you: 'approach', stop: 'idle' };
const FOOD = { cake: 0.45, berry: 0.25, carrot: 0.35, honey: 0.3, shroomB: 0.2, shroomR: 0.15 };
const HIVE_X = 1060, CACTUS_X = 2090, TREE_X = 380;
const OBJ_WORD = { hive: 'bees', cactus: 'cactus', squirrel: 'squirrel', butterfly: 'butterfly', red: 'mushroom', brown: 'mushroom' };
const SHOP = {
  cake: { price: 10, label: 'Seed cake', note: 'Filling. Keeps 3 days.' },
  berries: { price: 12, label: 'Two berries', note: 'A light snack each.' },
  doll: { price: 40, label: 'A doll', note: 'Something to hug. Eases loneliness while you’re away.' },
  top: { price: 30, label: 'A spinning top', note: 'Tap it to spin. Kith can spin it too.' },
  repair: { price: 30, label: 'Shelter repair', note: 'Patches storm damage on every shelter.' },
  bush: { price: 60, label: 'Plant a berry bush', note: 'Planted where you’re looking. Regrows berries.' },
  carrots: { price: 40, label: 'Plant a carrot row', note: 'Three more carrots, where you’re looking.' },
  egg: { price: 200, label: 'Adopt an egg', note: 'A new Kith for the garden. Six at most.' },
  shelter: { price: 150, label: 'Build a shelter', note: 'Built where you’re looking. Drag to move it.' }
};

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
function hash(a, b) {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function localParts(t) {
  const lt = t - new Date(t).getTimezoneOffset() * 60e3;
  const day = Math.floor(lt / DAY);
  return { day, hour: (lt - day * DAY) / HOUR };
}
function dayInfo(seed, d) {
  const r = k => hash(seed * 131 + k, d);
  const snap = r(1) < 0.12, stormy = r(2) < 0.18, rainy = r(3) < 0.3;
  const base = snap ? -5 + r(5) * 5 : 7 + r(4) * 10;
  return { base, snap, stormy, rainy, sStart: Math.floor(r(6) * 24), sLen: 3 + Math.floor(r(7) * 6), rStart: Math.floor(r(8) * 24) };
}
function gameParts(t, scale) {
  if (scale === 1) return localParts(t);
  const gt = t * scale, day = Math.floor(gt / DAY);
  return { day, hour: (gt - day * DAY) / HOUR };
}
function weatherAt(seed, t, scale = 1) {
  const { day, hour } = gameParts(t, scale);
  const a = dayInfo(seed, day), b = dayInfo(seed, day + 1), p = dayInfo(seed, day - 1);
  const base = a.base + (b.base - a.base) * (hour / 24);
  const temp = base + 5 * Math.sin((hour - 9) / 24 * 2 * Math.PI);
  let storm = a.stormy && hour >= a.sStart && hour < a.sStart + a.sLen;
  if (p.stormy && p.sStart + p.sLen > 24 && hour < p.sStart + p.sLen - 24) storm = true;
  const rain = storm || (a.rainy && hour >= a.rStart && hour < a.rStart + 5);
  return { temp, storm, rain, snow: rain && temp < 1, night: hour < 6.5 || hour >= 21.5, hour, day };
}
function forecast(seed, t, days = 3, scale = 1) {
  const { day, hour } = gameParts(t, scale), out = [];
  for (let i = 0; i < days; i++) {
    let lo = 99, hi = -99, storm = false, rain = false;
    const dayStart = t + (i * 24 - hour) * HOUR / scale;
    for (let h = 0; h < 24; h++) {
      const w = weatherAt(seed, dayStart + (h * HOUR + 60e3) / scale, scale);
      lo = Math.min(lo, w.temp); hi = Math.max(hi, w.temp); storm = storm || w.storm; rain = rain || w.rain;
    }
    out.push({ day: day + i, start: dayStart, lo, hi, storm, rain, snow: rain && lo < 1 });
  }
  return out;
}

let _id = 1;
const nid = () => Date.now().toString(36) + (_id++).toString(36);

function newGenome(rand = Math.random) {
  return {
    hue: Math.floor(rand() * 360), size: 0.85 + rand() * 0.3,
    curiosity: rand(), agreeable: rand(), sociability: rand(), hardiness: rand(), learnRate: 0.7 + rand() * 0.7,
    lifespan: LIFESPAN_DAYS - 0.5 + rand(),
    syll: ['ba', 'mi', 'nu', 'pa', 'lo', 'te', 'ki', 'wu'].sort(() => rand() - 0.5).slice(0, 3)
  };
}
function newCreature(name, now, g = newGenome(), x = 300) {
  const aff = {};
  for (const d of DRIVES) { aff[d] = {}; for (const a of ACTIONS) aff[d][a] = Math.random() * 0.08; }
  const inst = [['hunger', 'eat', 0.3], ['cold', 'rest', 0.25], ['tired', 'sleep', 0.45], ['tired', 'rest', 0.15],
    ['bored', 'play', 0.35], ['lonely', 'approach', 0.45], ['fear', 'rest', 0.15], ['fear', 'approach', 0.25]];
  inst.push(['hunger', 'vend', 0.06], ['bored', 'music', 0.12], ['lonely', 'hug', 0.25], ['fear', 'hug', 0.2], ['lonely', 'social', 0.4], ['bored', 'social', 0.12], ['fear', 'social', 0.15], ['bored', 'poke', 0.3]);
  for (const [d, a, v] of inst) aff[d][a] = v * (0.6 + Math.random() * 0.8);
  return {
    id: nid(), name, genome: g, stage: 'egg', hatchAt: now + 40e3, born: null, dies: null, alive: true, parents: [], gen: 1,
    objVal: { hive: 0, cactus: 0, squirrel: 0.1, butterfly: 0.1, red: 0, brown: 0 }, kin: {}, robotRel: { familiarity: 0, affection: 0.05, trust: 0.15 }, skill: {}, news: [], lastScores: [],
    x, dir: 1, asleep: false, health: 1,
    d: { hunger: 0.3, cold: 0, tired: 0.2, bored: 0.3, lonely: 0.3, fear: 0 },
    aff, lex: {}, rel: { trust: 0.2, affection: 0.1, familiarity: 0 },
    act: null, last: null, bias: null, say: null, sayUntil: 0, nextChatter: 0, flags: {}, cause: null,
    beliefs: [], think: null, thinkUntil: 0, lastConsol: now, sleptNight: false, wants: [], riverFear: 0, inWater: null
  };
}
function newWorld(seed, now, playerName, creatureName, secondName) {
  const first = newCreature(creatureName, now, newGenome(), 280), kith = [first];
  if (secondName) { const b = newCreature(secondName, now, newGenome(), 380); b.hatchAt = now + 55e3; kith.push(b); }
  return {
    v: 1, scale: SCALE, seed, simTime: now, offset: 0, coins: 120, allowanceDay: localParts(now).day, presenceMs: 0, presenceDay: localParts(now).day, presenceCoins: 0,
    playerName, shelter: 1, patch: [1, 0.55, 0.2], sitterUntil: 0,
    items: [{ id: nid(), type: 'ball', x: 330, born: now }],
    kith, creature: first, sel: first.id, robot: newRobot(), log: [], moments: [], chat: [], lastSeen: now, graves: [], dreams: [], pending: [],
    ...newGadgets()
  };
}

function newRobot() { return { name: 'Tock', x: DOCK_X, tx: DOCK_X, task: null, say: null, sayUntil: 0, nextName: 0, nextWarn: 0 }; }
function kithById(w, id) { return w.kith.find(k => k.id === id); }
function living(w) { return w.kith.filter(k => k.alive && k.stage !== 'egg'); }
function newFauna(T) { return { hive: { x: HIVE_X, honey: 2, g: 0, anger: 0 }, squirrel: { x: TREE_X, up: false, tx: TREE_X, upUntil: 0 }, butterflies: [{ x: 700, y: 250, ph: 0 }, { x: 2150, y: 260, ph: 2 }], swarm: null, shroomT: 0 }; }
function newGadgets() { return { patchX: [470, 515, 560], bushes: [{ x: BUSH_X, n: 2, g: 0 }], fauna: newFauna(), pos: { board: 830, music: 970, vendor: 1760 }, shelters: [{ x: SHELTER_X, integ: 1 }], bridge: false, bush: { n: 2, g: 0 }, vendor: { stock: 3, day: -1 }, musicUntil: 0, board: { i: -1, until: 0, taught: true, byKith: false } }; }
function sideOf(x) { return x < RIVER.x1 ? -1 : x > RIVER.x2 ? 1 : 0; }
function reachable(w, x) { const c = w.creature; return w.bridge || sideOf(x) === sideOf(c.x) || sideOf(c.x) === 0; }
function fearsRiver(c) { return c.riverFear >= 0.35 + 0.3 * c.genome.curiosity; }
function naiveOk(w, x) { return reachable(w, x) || !fearsRiver(w.creature); }
function log(w, type, text) { w.log.push({ t: w.simTime, type, text, who: w.creature ? w.creature.id : null }); if (w.log.length > 800) w.log.splice(0, w.log.length - 800); }
function moment(w, text, reward = 20) { w.moments.push({ t: w.simTime, text, who: w.creature.name, id: w.creature.id }); w.coins += reward; }
function stageOf(c, t) {
  if (c.stage === 'egg' || !c.alive) return c.stage;
  const age = (t - c.born) / DAY;
  return age < 2 ? 'baby' : age < 5 ? 'child' : age < 11 ? 'adult' : 'elder';
}
function shelterAt(w, x) { return (w.shelters || []).find(s => Math.abs(x - s.x) < 55) || null; }
function inShelter(w, c) { const s = shelterAt(w, c.x); return !!s && s.integ > 0.3; }
function nearestShelter(w, c) {
  const ok = w.shelters.filter(s => naiveOk(w, s.x) && s.integ > 0.3);
  const list = ok.length ? ok : w.shelters;
  return list.slice().sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x))[0];
}
function sitterOn(w) { return true; }
const TOCK_CAKE = 10;
function edible(w, c) {
  const out = [];
  for (const it of w.items) if (FOOD[it.type] && !it.rotten && !it.held && !(it.type === 'shroomR' && c.objVal && c.objVal.red < -0.3)) out.push({ ref: 'item:' + it.id, x: it.x, v: FOOD[it.type] });
  w.patch.forEach((g, i) => { if (g >= 1) out.push({ ref: 'patch:' + i, x: w.patchX[i], v: FOOD.carrot }); });
  (w.bushes || []).forEach((b, i) => { if (b.n > 0) out.push({ ref: 'bush:' + i, x: b.x - 26, v: FOOD.berry }); });
  return out.filter(f => naiveOk(w, f.x)).sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x));
}
function content(c) { const D = c.d; return D.hunger < 0.45 && D.cold < 0.3 && D.fear < 0.2 && D.tired < 0.7 && D.lonely < 0.6 && c.health > 0.6; }
function setWants(w, list) {
  const c = w.creature, out = [];
  for (const x of list || []) {
    const what = String(x.what || '').toLowerCase(); if (!WANTS[what]) continue;
    const where = SPOT_NAMES.includes(String(x.where || '').toLowerCase()) ? String(x.where).toLowerCase() : (what === 'explore' ? SPOT_NAMES[Math.floor(Math.random() * SPOT_NAMES.length)] : null);
    out.push({ what, where, why: String(x.why || '').slice(0, 60), at: w.simTime });
    if (out.length >= 3) break;
  }
  if (out.length) c.wants = out;
  return out;
}
function ruleWants(w) {
  const c = w.creature, g = c.genome, pool = [];
  if (g.curiosity > 0.4) pool.push({ what: 'explore', why: 'what is over there?' });
  if (g.sociability > 0.5 && c.rel.affection > 0.25) pool.push({ what: 'fetch', why: `${w.playerName} likes ball` });
  if (Object.values(c.lex).some(e => e.s >= 0.3)) pool.push({ what: 'practice', why: 'words fun' });
  pool.push({ what: 'music', why: 'music = dance' }, { what: 'learn', why: 'pictures!' });
  pool.push({ what: Math.random() < 0.5 ? 'dance' : 'sing', why: 'happy' }, { what: 'watch', why: 'sky big' }, { what: 'play', why: 'ball!' });
  return setWants(w, pool.sort(() => Math.random() - 0.5).slice(0, 3));
}
function knows(c, word) { const e = c.lex[word]; return !!e && e.s >= 0.3; }
function wordFor(c, meaning) {
  let best = null;
  for (const [wd, e] of Object.entries(c.lex)) if (e.m === meaning && e.s >= 0.3 && (!best || e.s > c.lex[best].s)) best = wd;
  return best;
}

function teach(w, word, meaning, mult = 1) {
  const c = w.creature; word = String(word).toLowerCase();
  if ((!MEANINGS.includes(meaning) && !/^kin:/.test(meaning)) || !/^[a-z']{1,16}$/.test(word)) return false;
  const e = c.lex[word];
  const gain = 0.25 * c.genome.learnRate * mult;
  if (e && e.m === meaning) { const was = e.s; e.s = clamp(e.s + gain); if (was < 0.3 && e.s >= 0.3) { w.coins += 10; (c.news || (c.news = [])).push({ kind: 'word', text: `${c.name} can now say “${word}”` }); } return false; }
  const first = Object.keys(c.lex).length === 0;
  c.lex[word] = { m: meaning, s: gain, at: w.simTime };
  log(w, 'word', `${c.name} heard "${word}" (${meaning})`);
  if (first) moment(w, `${c.name} started learning a first word: "${word}".`);
  if (meaning === 'you' && !c.flags.knowsYou) { c.flags.knowsYou = true; moment(w, `${c.name} began to learn your name.`); }
  return true;
}

function feedback(w, amount) {
  const c = w.creature, target = c.act && !c.act.done ? c.act : (c.last && w.simTime - c.last.end < 10e3 ? c.last : null);
  if (target) learn(c, target.kind, target.kind === 'approach' ? 'lonely' : target.dom, amount * 0.3 * c.genome.learnRate);
  return target ? target.kind : null;
}
const SKILL_TEXT = { 'hunger:eat': 'eating fixes hunger', 'hunger:vend': 'the food machine fixes hunger', 'cold:rest': 'the shelter warms it up',
  'tired:sleep': 'sleep helps when tired', 'tired:rest': 'resting in the shelter helps when tired', 'bored:play': 'playing cures boredom', 'bored:music': 'the music box cures boredom',
  'lonely:approach': 'coming to you helps when lonely', 'lonely:hug': 'its doll helps when lonely', 'lonely:social': 'friends help when lonely', 'fear:rest': 'the shelter feels safe when scared',
  'fear:hug': 'hugging its doll helps when scared', 'fear:approach': 'you make it feel safe', 'fear:social': 'friends make it feel safe', 'hunger:approach': 'you mean food' };
function learn(c, kind, d, delta) {
  const before = c.aff[d][kind] || 0, after = clamp(before + delta, -0.5, 1.2); c.aff[d][kind] = after;
  const key = d + ':' + kind, txt = SKILL_TEXT[key]; if (!txt || !c.skill) return;
  if (after >= 0.5 && !c.skill[key]) { c.skill[key] = 1; (c.news || (c.news = [])).push({ kind: 'learned', text: `${c.name} learned: ${txt}` }); }
  else if (after < 0.15 && c.skill[key]) { c.skill[key] = 0; (c.news || (c.news = [])).push({ kind: 'unlearned', text: `${c.name} is forgetting that ${txt}` }); }
}
function tickle(w) {
  const c = w.creature; if (!c.alive || c.stage === 'egg') return null;
  const comfort = c.d.fear > 0.4 || c.d.cold > 0.5;
  const k = feedback(w, 0.6);
  log(w, comfort ? 'comfort' : 'tickle', `You ${comfort ? 'comforted' : 'tickled'} ${c.name}`);
  c.d.bored = clamp(c.d.bored - 0.1); c.d.lonely = clamp(c.d.lonely - 0.15);
  c.rel.affection = clamp(c.rel.affection + (comfort ? 0.05 : 0.015)); c.rel.trust = clamp(c.rel.trust + (comfort ? 0.05 : 0.008));
  if (c.flags.justAvoided && w.simTime - c.flags.justAvoided < 15e3) c.riverFear = clamp(c.riverFear + 0.05);
  if (comfort) {
    c.d.fear = clamp(c.d.fear - 0.3);
    if (!c.flags.comforted) { c.flags.comforted = true; moment(w, `You comforted ${c.name} when ${c.d.cold > 0.5 ? 'it was cold' : 'it was scared'}.`); }
  }
  return { rewarded: k, comfort };
}
function scold(w) {
  const c = w.creature; if (!c.alive || c.stage === 'egg') return null;
  const k = feedback(w, -0.7);
  const ot = c.act && c.act.target && c.act.target.startsWith('obj:') ? c.act.target.slice(4) : c.act && c.act.target && c.act.target.startsWith('item:') ? itemObj(w, c.act.target) : null;
  if (ot && c.objVal) { c.objVal[ot] = clamp(c.objVal[ot] - 0.25, -1, 1); if (c.act) c.act.done = true; }
  log(w, 'scold', `You scolded ${c.name}`);
  c.d.fear = clamp(c.d.fear + 0.15); c.rel.trust = clamp(c.rel.trust - 0.03);
  const nearBank = Math.min(Math.abs(c.x - RIVER.x1), Math.abs(c.x - RIVER.x2)) < 90 && !c.inWater;
  if (nearBank) { c.riverFear = clamp(c.riverFear + 0.15 * c.genome.learnRate); log(w, 'river-scold', `You warned ${c.name} away from the river`); }
  return { punished: k, river: nearBank };
}

function obey(w, words) {
  const c = w.creature; let kind = null;
  for (const wd of words) {
    const e = c.lex[wd];
    if (e && e.s >= 0.3 && MEANING_ACTION[e.m]) { kind = MEANING_ACTION[e.m]; if (['eat', 'play', 'sleep', 'come', 'stop'].includes(e.m)) break; }
  }
  if (!kind) return null;
  const p = 0.25 + 0.45 * c.rel.trust + 0.3 * c.genome.agreeable - 0.2 * c.d.bored;
  const ok = Math.random() < p;
  if (ok) { c.bias = { kind, until: w.simTime + 30e3, s: 1.5 }; if (c.act) c.act.until = w.simTime; if (c.asleep) c.asleep = false; }
  return { kind, ok };
}

function gateSpeech(c, text) {
  const max = { baby: 1, child: 3, adult: 6, elder: 5 }[c.stage] || 1;
  const toks = String(text || '').toLowerCase().match(/[a-z']+|[!?.]+/g) || [];
  const out = []; let n = 0;
  for (const t of toks) {
    if (/^[!?.]+$/.test(t)) { if (out.length && !/[!?.]$/.test(out[out.length - 1])) out[out.length - 1] += t[0]; continue; }
    if (n < max && knows(c, t)) { const e = c.lex[t]; out.push(e.m === 'you' || e.m === 'self' || e.m === 'robot' || e.m.startsWith('kin:') ? t[0].toUpperCase() + t.slice(1) : t); n++; }
  }
  return out.length ? out.join(' ') : babble(c);
}
function babble(c) {
  const s = c.genome.syll, n = 1 + Math.floor(Math.random() * 3), out = [];
  for (let i = 0; i < n; i++) out.push(s[Math.floor(Math.random() * s.length)].repeat(1 + (Math.random() < 0.4 ? 1 : 0)));
  return out.join(' ') + (Math.random() < 0.5 ? '!' : '');
}
function speak(w, text, ms = 4500) { const c = w.creature; c.say = text; c.sayUntil = w.simTime + ms; }

function chatter(w, ctx) {
  const c = w.creature;
  if (c.asleep || w.simTime < c.nextChatter || w.simTime < c.sayUntil) return;
  c.nextChatter = w.simTime + 10e3 + Math.random() * 16e3;
  let dom = null, dv = 0.55;
  for (const d of DRIVES) if (c.d[d] > dv) { dv = c.d[d]; dom = d; }
  const you = wordFor(c, 'you'), words = [];
  if (dom) { const f = wordFor(c, FEEL_WORD[dom]); if (you && ctx.present && ['lonely', 'fear', 'hunger', 'cold'].includes(dom)) words.push(you); if (f) words.push(f); }
  else if (ctx.present && you && c.rel.affection > 0.3 && Math.random() < 0.5) { words.push(you); const h = wordFor(c, 'happy'); if (h) words.push(h); }
  if (!words.length) {
    const f = focusFor(w, c), fw = f && wordFor(c, f);
    const friend = living(w).find(k => k !== c && Math.abs(k.x - c.x) < 160);
    const fn = friend && wordFor(c, 'kin:' + friend.id);
    const rn = Math.abs(w.robot.x - c.x) < 140 && wordFor(c, 'robot');
    const opts = [fw, fn, rn].filter(Boolean);
    if (opts.length && Math.random() < 0.7) words.push(opts[Math.floor(Math.random() * opts.length)]);
  }
  if (!words.length && c.stage !== 'baby' && Math.random() < 0.5) return;
  const said = words.length ? gateSpeech(c, words.join(' ') + '!') : babble(c);
  speak(w, said);
  for (const k of living(w)) {
    if (k === c || k.asleep || Math.abs(k.x - c.x) > 180) continue;
    for (const wd of words) { const e = c.lex[wd]; if (!e || e.s < 0.5 || e.m === 'self' || e.m.startsWith('kin:')) continue; const le = k.lex[wd]; if (le && le.m !== e.m) continue;
      const prev = w.creature; w.creature = k; teach(w, wd, e.m, (k.parents.includes(c.id) ? 0.45 : 0.3)); w.creature = prev;
      if (!k.flags.learnedFromKin) { k.flags.learnedFromKin = true; const p2 = w.creature; w.creature = k; moment(w, `${k.name} learned the word “${wd}” from ${c.name}.`); w.creature = p2; } }
  }
}

function choose(w, ctx) {
  const c = w.creature, food = edible(w, c), ball = w.items.find(i => i.type === 'ball' && !i.held);
  const toys = w.items.filter(i => (i.type === 'ball' || i.type === 'top') && !i.held && naiveOk(w, i.x)).sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x));
  const doll = w.items.find(i => i.type === 'doll' && !i.held && naiveOk(w, i.x));
  const friends = living(w).filter(k => k !== c && !k.inWater && naiveOk(w, k.x)).sort((p, q) => (kinRel(c, q).affection - Math.abs(q.x - c.x) / 3000) - (kinRel(c, p).affection - Math.abs(p.x - c.x) / 3000));
  const noise = c.stage === 'baby' ? 0.35 : c.stage === 'child' ? 0.22 : 0.12;
    const T0 = w.simTime, sc0 = w.scale || 1;
  c.wants = (c.wants || []).filter(x => (T0 - x.at) * sc0 < DAY && wantOk(w, x, ctx));
  const pokeT = pokeTarget(w, c);
  const avail = { poke: !!pokeT, social: friends.length > 0, hug: !!doll, eat: food.length > 0, play: toys.length > 0, rest: true, sleep: c.d.tired > 0.45, approach: ctx.present, wander: true, idle: true, want: content(c) && c.wants.length > 0, vend: c.d.hunger > 0.3 && w.vendor.stock > 0 && naiveOk(w, w.pos.vendor), music: c.d.bored > 0.25 && naiveOk(w, w.pos.music) && w.simTime > w.musicUntil };
  let best = 'idle', bs = -1e9; const scores = [];
  for (const a of ACTIONS) {
    if (!avail[a]) continue;
    let s = { wander: 0.08 + 0.1 * c.genome.curiosity, idle: 0.05, want: 0.3 + 0.3 * c.genome.curiosity }[a] || 0;
    if (a !== 'want') for (const d of DRIVES) s += c.d[d] * (c.aff[d][a] || 0);
    s += (Math.random() - 0.5) * noise * (1 + c.genome.curiosity);
    if (c.bias && c.bias.until > w.simTime && c.bias.kind === a) s += c.bias.s;
    s += beliefPull(c, a);
    scores.push([a, s]);
    if (s > bs) { bs = s; best = a; }
  }
  let dom = 'bored', dv = -1;
  for (const d of DRIVES) if (c.d[d] > dv) { dv = c.d[d]; dom = d; }
  c.lastScores = scores.sort((p, q) => q[1] - p[1]).slice(0, 4);
  const act = { kind: best, dom, before: { ...c.d }, start: w.simTime, feedback: 0 };
  const T = w.simTime;
  if (best === 'play' && !(c.last && c.last.kind === 'play')) log(w, 'played', `${c.name} played with the ball`);
  if (best === 'eat') { act.target = food[0].ref; act.tx = food[0].x; act.until = T + 40e3; }
  else if (best === 'poke') { act.target = 'obj:' + pokeT.obj; act.tx = pokeT.x; act.until = T + 35e3; }
  else if (best === 'social') { const f = friends[0]; act.target = 'kin:' + f.id; act.tx = f.x + (f.x > c.x ? -30 : 30); act.until = T + 25e3; }
  else if (best === 'hug') { act.target = 'item:' + doll.id; act.tx = doll.x; act.until = T + 30e3; }
  else if (best === 'play') { const toy = toys[0]; act.target = 'item:' + toy.id; act.tx = toy.x; act.until = T + 20e3 + Math.random() * 20e3; }
  else if (best === 'rest') { const need = c.d.tired > 0.5 || c.d.cold > 0.3 || c.d.fear > 0.3; act.tx = nearestShelter(w, c).x + (Math.random() - 0.5) * 40; const dl = w.items.find(i => i.type === 'doll' && !i.held && Math.abs(i.x - c.x) < 50); if (dl && (need || Math.random() < 0.5)) act.dollId = dl.id; act.until = T + (need ? 60e3 + Math.random() * 120e3 : 15e3 + Math.random() * 15e3); }
  else if (best === 'sleep') { act.tx = c.x; act.until = T + 1; c.asleep = true; }
  else if (best === 'approach') { act.tx = ctx.hand ? ctx.hand.x : W / 2; act.until = T + 15e3; }
  else if (best === 'wander') { act.tx = clamp(c.x + (Math.random() - 0.5) * 700, 40, W - 40); act.until = T + 10e3 + Math.random() * 10e3; }
  else if (best === 'vend') { act.tx = w.pos.vendor - 14; act.until = T + 90e3; }
  else if (best === 'music') { act.tx = w.pos.music - 26; act.until = T + 40e3; }
  else if (best === 'want') {
    const x = c.wants[0]; act.want = x; act.what = x.what;
    act.until = T + ({ friend: 30e3, fetch: 40e3, explore: 45e3, cuddle: 25e3, play: 30e3, music: 40e3, learn: 30e3 }[x.what] || 12e3 + Math.random() * 8e3);
    if (x.what === 'fetch' || x.what === 'play') { act.target = 'item:' + ball.id; act.tx = ball.x; }
    else if (x.what === 'explore') act.tx = (SPOTS[x.where] != null ? SPOTS[x.where] : 640) + (Math.random() - 0.5) * 30;
    else if (x.what === 'music') act.tx = w.pos.music - 26;
    else if (x.what === 'learn') act.tx = w.pos.board - 30;
    else if (x.what === 'cuddle') act.tx = ctx.hand ? ctx.hand.x : W / 2;
    else if (x.what === 'chase' || x.what === 'honey') { const pt = x.what === 'honey' ? { obj: 'hive', x: HIVE_X } : pokeTarget(w, c, ['squirrel', 'butterfly']); act.kind = 'poke'; act.target = 'obj:' + pt.obj; act.tx = pt.x; }
    else if (x.what === 'friend') { const f = living(w).filter(k => k !== c && !k.asleep).sort((p, q) => kinRel(c, q).affection - kinRel(c, p).affection)[0]; act.target = 'kin:' + f.id; act.tx = f.x; }
    else if (x.what === 'hug') { const dl = w.items.find(i => i.type === 'doll'); act.target = 'item:' + dl.id; act.tx = dl.x; }
    else act.tx = c.x;
  }
  else { act.tx = c.x; act.until = T + 4e3 + Math.random() * 4e3; }
  c.act = act;
}
function wantOk(w, x, ctx) {
  const c = w.creature, ball = w.items.some(i => i.type === 'ball' && !i.held);
  if (x.what === 'fetch') return ball && ctx.present;
  if (x.what === 'cuddle') return ctx.present;
  if (x.what === 'chase') return !!pokeTarget(w, c, ['squirrel', 'butterfly']);
  if (x.what === 'honey') return w.fauna.hive.honey > 0 && naiveOk(w, HIVE_X);
  if (x.what === 'friend') return living(w).some(k => k !== c && !k.asleep && naiveOk(w, k.x));
  if (x.what === 'hug') return w.items.some(i => i.type === 'doll' && naiveOk(w, i.x));
  if (x.what === 'play') return ball;
  if (x.what === 'practice') return Object.values(c.lex).some(e => e.s >= 0.3);
  if (x.what === 'music') return naiveOk(w, w.pos.music);
  if (x.what === 'learn') return naiveOk(w, w.pos.board);
  if (x.what === 'explore') return naiveOk(w, SPOTS[x.where] != null ? SPOTS[x.where] : 640);
  return true;
}
function finish(w) {
  const c = w.creature, a = c.act; if (!a) return;
  if (a.kind === 'want') {
    const ball = w.items.find(i => i.type === 'ball'); if (ball) ball.carried = false;
    c.dancing = false;
    if (a.done || w.simTime >= a.until) c.wants = c.wants.filter(x => x !== a.want);
  }
  const lr = 0.3 * c.genome.learnRate;
  for (const d of DRIVES) {
    if (a.before[d] < 0.2 || a.kind === 'want' || c.aff[d][a.kind] == null) continue;
    const r = clamp((a.before[d] - c.d[d]) * 4, -0.3, 1);
    learn(c, a.kind, d, lr * r * a.before[d]);
  }
  c.last = { kind: a.kind, dom: a.dom, before: a.before, end: w.simTime };
  c.act = null;
}

function ballPhysics(w, dt) {
  const b = w.items.find(i => i.type === 'ball'); if (!b || b.held || b.carried) return;
  const s = dt / 1000;
  b.h = b.h || 0; b.vh = b.vh || 0; b.vx = b.vx || 0;
  if (b.h > 0 || b.vh) {
    b.vh -= 700 * s; b.h += b.vh * s;
    if (b.h <= 0) { b.h = 0; b.vh = -b.vh * 0.45; if (Math.abs(b.vh) < 40) b.vh = 0; }
  }
  if (b.vx) {
    b.x += b.vx * s;
    if (b.x < 20) { b.x = 20; b.vx = -b.vx * 0.6; }
    if (b.x > W - 20) { b.x = W - 20; b.vx = -b.vx * 0.6; }
    b.vx *= Math.pow(b.h > 0 ? 0.85 : 0.35, s);
    if (Math.abs(b.vx) < 4 && b.h === 0) b.vx = 0;
  }
}
function kickBall(w, dir, power, byPlayer) {
  const b = w.items.find(i => i.type === 'ball'); if (!b) return false;
  b.held = false; b.carried = false;
  b.vx = dir * power; b.vh = 120 + power * 0.6; b.h = Math.max(b.h || 0, 1);
  if (byPlayer) w.lastKick = w.simTime;
  if (byPlayer) for (const c of living(w)) {
    c.caughtKick = false; if (Math.abs(c.x - b.x) > 600) continue;
    if (c.alive && c.stage !== 'egg' && !c.asleep && c.d.fear < 0.5 && c.d.hunger < 0.8 && c.d.cold < 0.6) {
      const s = 0.5 + 0.6 * c.genome.curiosity + 0.4 * c.d.bored;
      c.bias = { kind: 'play', until: w.simTime + 20e3, s };
      if (c.act && ['idle', 'wander', 'want', 'approach', 'rest', 'play'].includes(c.act.kind) && !(c.act.kind === 'rest' && c.d.tired > 0.5)) c.act.until = w.simTime;
      c.think = ['ball', 'scared'].slice(0, 1).concat(Math.random() < 0.5 ? ['happy'] : []); c.thinkUntil = w.simTime + 2500;
    }
  }
  return true;
}
function creatureKick(w, ctx, dt, events) {
  const c = w.creature, b = w.items.find(i => i.type === 'ball');
  if (!b || !ctx.live || b.held || Math.abs(b.x - c.x) > 22) return;
  const withYou = w.lastKick && w.simTime - w.lastKick < 30e3 && ctx.present && ctx.hand;
  if (withYou && !c.caughtKick) {
    c.caughtKick = true; c.d.lonely = clamp(c.d.lonely - 0.1); c.rel.affection = clamp(c.rel.affection + 0.01); c.rel.trust = clamp(c.rel.trust + 0.005);
    log(w, 'played-together', `You played ball with ${c.name}`); events.push('caught'); w.coins += 2;
    if (!c.flags.ballWithYou) { c.flags.ballWithYou = true; moment(w, `You played ball with ${c.name} for the first time.`); }
  }
  if (Math.random() < dt / (withYou ? 900 : 1500)) {
    const dir = withYou && Math.random() < 0.3 + 0.5 * c.genome.sociability ? Math.sign(ctx.hand.x - b.x) || 1 : (Math.random() < 0.5 ? -1 : 1);
    b.vx = dir * (60 + Math.random() * (withYou ? 140 : 70)); b.vh = withYou ? 90 + Math.random() * 80 : 0; b.h = b.vh ? 1 : 0;
    events.push(withYou && dir === Math.sign(ctx.hand.x - b.x) ? 'kick-back' : 'kick');
  }
}
function pressMusic(w, byKith) {
  const wasOn = w.simTime < w.musicUntil;
  w.musicUntil = w.simTime + 30e3;
  if (byKith && !wasOn && (!w._musicLog || w.simTime - w._musicLog > 20 * 60e3)) {
    w._musicLog = w.simTime; const c = w.creature; log(w, 'music', `${c.name} played the music box`); if (!c.flags.music) { c.flags.music = true; moment(w, `${c.name} cranked the music box and danced.`); } }
}
function pressBoard(w, byKith) {
  const b = w.board, lex = w.creature.lex, str = i => { const e = lex[BOARD[i][1]]; return e && e.m === BOARD[i][0] ? e.s : 0; };
  let pick = -1;
  for (let k = 0; k < BOARD.length; k++) { const i = (b.i + k + BOARD.length) % BOARD.length; if (str(i) > 0 && str(i) < 0.5) { pick = i; break; } }
  if (pick < 0) for (let k = 1; k <= BOARD.length; k++) { const i = (b.i + k) % BOARD.length; if (str(i) === 0) { pick = i; break; } }
  if (pick < 0) pick = (b.i + 1) % BOARD.length;
  b.i = pick; b.until = w.simTime + 12000; b.taught = false; b.byKith = !!byKith;
  if (byKith) log(w, 'board', `${w.creature.name} used the word board`);
  return BOARD[b.i];
}
function pressVendor(w) {
  if (w.vendor.stock <= 0) return false;
  w.vendor.stock--; w.items.push({ id: nid(), type: 'cake', x: w.pos.vendor + 30, born: w.simTime }); return true;
}
function callOver(w, x) {
  const c = w.creature;
  if (!c.alive || c.stage === 'egg' || c.asleep || c.inWater || !reachable(w, x) || Math.abs(c.x - x) > 700) return false;
  if (c.d.hunger > 0.7 || c.d.cold > 0.5 || c.d.fear > 0.5) return false;
  if (c.act) finish(w);
  const want = { what: 'learn', why: '', at: w.simTime };
  c.act = { kind: 'want', what: 'learn', want, pressed: true, pressed2: true, tx: x - 30, until: w.simTime + 20000, dom: 'bored', before: { ...c.d }, start: w.simTime, feedback: 0 };
  return true;
}
function buyShelter(w, x) {
  if (sideOf(x) === 0) x = x < (RIVER.x1 + RIVER.x2) / 2 ? RIVER.x1 - 70 : RIVER.x2 + 70;
  w.shelters.push({ x: clamp(x, 70, W - 70), integ: 1 });
}
function toggleLever(w) { w.bridge = !w.bridge; return w.bridge; }
function riverItems(w, dt) {
  if (w.bridge) return;
  const s = dt / 1000;
  for (const it of w.items) {
    if (it.held || it.carried || sideOf(it.x) !== 0) continue;
    if (it.type === 'ball' || it.type === 'doll' || it.type === 'top') { if ((it.h || 0) > 2) continue; it.vx = 0; it.h = 0; it.vh = 0; it.floating = true; const tgt = it.x < (RIVER.x1 + RIVER.x2) / 2 ? RIVER.x1 - 14 : RIVER.x2 + 14; it.x += Math.sign(tgt - it.x) * Math.min(Math.abs(tgt - it.x), 25 * s); }
    else it.sunk = true;
  }
  w.items = w.items.filter(i => !i.sunk);
}
function notice(w, x, meaning) {
  const c = w.creature; if (!c.alive || c.stage === 'egg' || c.asleep) return false;
  c.look = { x, until: w.simTime + 4000, meaning };
  if (!c.moving) c.dir = Math.sign(x - c.x) || c.dir;
  return true;
}
function attending(w) {
  const c = w.creature;
  return !!(c.look && w.simTime < c.look.until + 8000 && !c.asleep && Math.abs(c.look.x - c.x) < 320);
}
function doWant(w, a, ctx, dt, gh, events) {
  const c = w.creature, D = c.d, T = w.simTime, what = a.what;
  D.bored = clamp(D.bored - 0.8 * gh);
  if (!a.started) { a.started = true; events.push('want:' + what); log(w, 'want', `${c.name} chose to ${what}`); }
  if (what === 'fetch') {
    if (!a.carry) { a.carry = true; a.target = null; a.tx = ctx.hand ? ctx.hand.x : W / 2; }
    else {
      const b = w.items.find(i => i.type === 'ball'); if (b) { b.carried = false; b.x = c.x + c.dir * 18; }
      D.lonely = clamp(D.lonely - 0.15); c.rel.affection = clamp(c.rel.affection + 0.01);
      log(w, 'fetched', `${c.name} brought you the ball`); events.push('fetched');
      if (!c.flags.fetched) { c.flags.fetched = true; moment(w, `${c.name} brought you the ball for the first time.`); }
      a.done = true;
    }
  } else if (what === 'dance') { c.dancing = true; }
  else if (what === 'music') { if (!a.pressed) { a.pressed = true; pressMusic(w, true); events.push('music'); } }
  else if (what === 'learn') { if (!a.pressed || (w.simTime > w.board.until + 1500 && !a.pressed2)) { if (a.pressed) a.pressed2 = true; a.pressed = true; pressBoard(w, true); events.push('board'); } c.gazing = false; }
  else if (what === 'watch') { D.fear = clamp(D.fear - 0.5 * gh); c.gazing = true; }
  else if (what === 'cuddle') { D.lonely = clamp(D.lonely - 0.5 * gh); }
  else if (what === 'friend') { const f = a.target && kithById(w, a.target.slice(4)); if (f) { const r = kinRel(c, f); r.affection = clamp(r.affection + 0.05 * gh); c.dancing = Math.random() < 0.5; } }
  else if (what === 'hug') { D.lonely = clamp(D.lonely - 0.35 * gh); c.hugging = true; const dl = w.items.find(i => i.type === 'doll'); if (dl) dl.x = c.x + c.dir * 10; }
  else if (what === 'play') {
    creatureKick(w, ctx, dt, events);
    const ball = w.items.find(i => i.type === 'ball'); if (ball) a.tx = ball.x;
  } else if (what === 'sing' || what === 'practice') {
    if (ctx.live && T > (a.nextSay || 0)) {
      a.nextSay = T + 2800;
      if (what === 'sing') speak(w, '♪ ' + c.genome.syll[Math.floor(Math.random() * 3)].repeat(2) + ' ♪', 2500);
      else { const ks = Object.entries(c.lex).filter(([, e]) => e.s >= 0.3); if (ks.length) { const [wd, e] = ks[Math.floor(Math.random() * ks.length)]; e.s = clamp(e.s + 0.02); speak(w, gateSpeech(c, wd + '!'), 2500); } }
    }
    if (!ctx.live && what === 'practice') for (const e of Object.values(c.lex)) if (e.s >= 0.3) e.s = clamp(e.s + 0.01 * gh);
  }
}
function die(w, cause) {
  const c = w.creature; if (!c.alive) return;
  c.alive = false; c.asleep = false; c.act = null; c.cause = cause; c.diedAt = w.simTime; c.stage = 'dead';
  const days = ((w.simTime - c.born) / DAY).toFixed(1);
  log(w, 'death', `${c.name} died of ${cause}`);
  moment(w, `${c.name} died of ${cause}, aged ${days} days.`, 0);
  w.graves.push({ name: c.name, cause, born: c.born, died: w.simTime, hue: c.genome.hue });
  for (const o of living(w)) { if (o === c) continue; const r = kinRel(o, c); o.d.lonely = clamp(o.d.lonely + 0.3 + 0.5 * r.affection); o.d.fear = clamp(o.d.fear + 0.2); if (r.affection > 0.3) { const prev = w.creature; w.creature = o; addBelief(o, 'night', -0.3, `${c.name} gone`); moment(w, `${o.name} is grieving for ${c.name}.`, 0); w.creature = prev; } }
}
function flag(w, key, cond, text) {
  const c = w.creature;
  if (cond && !c.flags[key]) { c.flags[key] = true; log(w, key, text); }
  else if (!cond && c.flags[key]) c.flags[key] = false;
}
function weatherEvents(w, wx, events) {
  if (wx.storm && !w._storm) { w._storm = true; log(w, 'storm', 'A storm rolled in'); events.push('storm'); }
  if (!wx.storm) w._storm = false;
  if (wx.temp < 1 && !w._freeze) { w._freeze = true; log(w, 'frost', 'It dropped below freezing'); }
  if (wx.temp > 3) w._freeze = false;
}

function step(w, dt, ctx = { present: false, hand: null, live: false }) {
  const events = [];
  w.simTime += dt;
  const sc = w.scale || 1, hrs = dt / HOUR, gh = hrs * sc, wx = weatherAt(w.seed, w.simTime, sc), T = w.simTime;
  if (wx.temp > 4) w.patch = w.patch.map(g => clamp(g + gh / 8));
  if (wx.temp > 4) for (const b of w.bushes) { b.g += gh / 3; while (b.g >= 1) { b.g -= 1; if (b.n < 4) b.n++; } }
  faunaStep(w, dt, gh, wx, ctx, events);
  if (w.vendor) { const gd = gameParts(T, sc).day; if (gd !== w.vendor.day) { w.vendor.day = gd; w.vendor.stock = 3; } }
  if (wx.storm && w.bridge) { w.bridge = false; log(w, 'bridge-up', 'The storm raised the bridge'); events.push('bridge'); }
  riverItems(w, dt);
  for (const sh of w.shelters) {
    if (wx.storm) { const before = sh.integ; sh.integ = clamp(sh.integ - 0.06 * gh); if (before > 0.3 && sh.integ <= 0.3) log(w, 'shelter', 'The storm damaged a shelter'); }
    sh.integ = clamp(sh.integ + 0.03 * gh);
  }
  for (const it of w.items) if (FOOD[it.type] && !it.rotten && (T - it.born) * sc > 3 * DAY) it.rotten = true;
  w.items = w.items.filter(it => !(it.rotten && (T - it.born) * sc > 5 * DAY));
  weatherEvents(w, wx, events);
  robotStep(w, dt, ctx, wx, gh, events);
  const sel = w.creature, others = [];
  for (const k of w.kith) {
    w.creature = k;
    const ev = creatureStep(w, dt, ctx, wx, sc, hrs, gh, T);
    if (k === sel) events.push(...ev); else for (const e of ev) others.push({ id: k.id, e });
  }
  w.creature = sel;
  socialStep(w, dt, gh, ctx, events);
  warnStep(w, events);
  ballPhysics(w, dt);
  events.others = others;
  return events;
}
function creatureStep(w, dt, ctx, wx, sc, hrs, gh, T) {
  const events = [], c = w.creature;
  if (c.stage === 'egg') {
    if (T >= c.hatchAt) {
      c.stage = 'baby'; c.born = T; c.dies = T + c.genome.lifespan * DAY; hatchInherit(w, c);
      log(w, 'hatch', `${c.name} hatched`); moment(w, `${c.name} hatched.`, 0); events.push('hatch');
    }
    return events;
  }
  if (!c.alive) return events;
  const st = stageOf(c, T);
  if (st !== c.stage) { c.stage = st; moment(w, `${c.name} grew into ${st === 'adult' ? 'an adult' : st === 'elder' ? 'an elder' : 'a ' + st}.`, 0); }
  if (T >= c.dies) { die(w, 'old age'); return events; }

  const g = c.genome, sh = inShelter(w, c), D = c.d;
  D.tired += (c.asleep ? -0.14 : wx.night ? 0.09 : 0.05) * gh;
  D.hunger += (c.asleep ? 0.03 : 0.05) * (1.2 - 0.4 * g.hardiness) * gh;
  let exposure = 0;
  if (!sh) exposure = clamp((10 - wx.temp) / 14) + (wx.rain ? 0.2 : 0) + (wx.storm ? 0.2 : 0);
  else { const shl = shelterAt(w, c.x); if (shl && shl.integ < 0.6) exposure = clamp((10 - wx.temp) / 14) * (0.6 - shl.integ); }
  exposure = clamp(exposure * (1.15 - 0.3 * g.hardiness));
  D.cold += (exposure - D.cold) * Math.min(1, (sh && exposure < D.cold ? 2.4 : 0.6) * gh);
  if (!c.asleep) D.bored += 0.1 * gh;
  const nearHand = ctx.present && ctx.hand && Math.abs(ctx.hand.x - c.x) < 110;
  if (ctx.present) D.lonely += (nearHand ? -0.4 : 0.02) * gh;
  else D.lonely += 0.07 * (sitterOn(w) ? 0.6 : 1) * (w.items.some(i => i.type === 'doll' && Math.abs(i.x - c.x) < 60) ? 0.5 : 1) * (0.5 + g.sociability) * (c.stage === 'baby' ? 1.3 : 1) * gh;
  D.fear -= (sh ? 1 : 0.5) * gh;
  if (wx.storm) {
    if (ctx.live) { if (Math.random() < dt / 40e3) { D.fear += sh ? 0.1 : 0.3; events.push('thunder'); } }
    else if (!sh) D.fear = Math.max(D.fear, 0.5);
  }
  for (const d of DRIVES) D[d] = clamp(D[d]);
  if (ctx.present) c.rel.familiarity = clamp(c.rel.familiarity + 0.015 * hrs);

  const dmg = (D.hunger > 0.85 ? 0.05 : 0) + (D.cold > 0.75 ? 0.08 : 0);
  const regen = D.hunger < 0.6 && D.cold < 0.5 ? 0.03 : 0;
  c.health = clamp(c.health + (regen - dmg) * gh);
  flag(w, 'starving', D.hunger > 0.85, `${c.name} was starving`);
  flag(w, 'freezing', D.cold > 0.75, `${c.name} was freezing`);
  flag(w, 'weak', c.health < 0.35, `${c.name} grew weak`);
  if (c.health <= 0) { die(w, D.cold > 0.75 ? 'cold' : 'hunger'); return events; }

  for (const [wd, e] of Object.entries(c.lex)) {
    if (c.asleep && e.s >= 0.5) e.s = clamp(e.s + 0.1 * hrs);
    else if (e.s < 0.8) e.s -= 0.03 * hrs;
    if (e.s <= 0) { delete c.lex[wd]; log(w, 'forgot', `${c.name} forgot "${wd}"`); }
  }

  if (c.inWater) {
    D.cold = clamp(D.cold + 0.25 * dt / 1000); D.fear = clamp(Math.max(D.fear, 0.8));
    c.asleep = false; c.moving = false;
    if (T >= c.inWater.until) { c.x = c.inWater.from < 0 ? RIVER.x1 - 14 : RIVER.x2 + 14; c.inWater = null; events.push('climbed'); }
    return events;
  }
  if (T < w.musicUntil && Math.abs(c.x - w.pos.music) < 380 && !c.asleep) { D.bored = clamp(D.bored - 0.6 * gh); if (!c.moving && (!c.act || ['idle', 'music', 'want', 'wander'].includes(c.act.kind))) c.dancing = true; }
  if (T < w.board.until && !w.board.taught && !c.asleep && Math.abs(c.x - w.pos.board) < 320 && c.stage !== 'egg') {
    const [m, word] = BOARD[w.board.i]; w.board.taught = true; teach(w, word, m, w.board.byKith ? 0.9 : 0.6); events.push('board-taught');
  }
  robotCare(w, c, wx, events);

  if (c.asleep) {
    if (wx.night) c.sleptNight = true;
    if (D.tired < 0.06 || D.fear > 0.6 || D.hunger > 0.8 || D.cold > 0.6) {
      c.asleep = false;
      if (c.sleptNight && (T - c.lastConsol) * sc > 6 * HOUR) { w.pending.push({ id: c.id, name: c.name, since: c.lastConsol, until: T, wx: wx.temp }); c.lastConsol = T; events.push('night'); }
      c.sleptNight = false;
      if (sh && !c.flags.sheltered && !(c.bias && c.bias.s >= 2) && c.flags.nightIn) { c.flags.sheltered = true; moment(w, `${c.name} spent a night in the shelter all by itself.`); }
      c.flags.nightIn = false;
    } else if (sh && wx.night) c.flags.nightIn = true;
  } else if (D.tired > 0.92) {
    if (c.act) finish(w);
    c.asleep = true;
    if (!sh && wx.temp < 8) log(w, 'slept-out', `${c.name} fell asleep outside in the cold`);
  }

  if (!c.asleep) {
    if (!c.act || T >= c.act.until || c.act.done) { if (c.act) finish(w); choose(w, ctx); }
    const a = c.act;
    if (a && !c.asleep) {
      if ((a.kind === 'approach' || (a.kind === 'want' && (a.what === 'cuddle' || a.carry))) && ctx.hand) a.tx = ctx.hand.x;
      if (a.target && a.target.startsWith('kin:')) { const f = kithById(w, a.target.slice(4)); if (!f || !f.alive || f.inWater) a.done = true; else a.tx = f.x + (f.x > c.x ? -30 : 30); }
      if (a.target && a.target.startsWith('item:')) { const it = w.items.find(i => 'item:' + i.id === a.target); if (!it || it.held) a.done = true; else a.tx = it.x; }
      if (a.target && a.target.startsWith('patch:') && w.patch[+a.target.slice(6)] < 1) a.done = true;
      if (a.target && a.target.startsWith('bush:') && !(w.bushes[+a.target.slice(5)] && w.bushes[+a.target.slice(5)].n > 0)) a.done = true;
      if (a.kind === 'poke') pokeTrack(w, c, a);
      const speed = (c.stage === 'baby' ? 35 : c.stage === 'elder' ? 40 : 60) * (D.cold > 0.6 ? 0.6 : 1) * (c.sickUntil > T ? 0.55 : 1);
      const dx = a.tx - c.x, mv = speed * dt / 1000;
      if (Math.abs(dx) > 4) {
        c.dir = Math.sign(dx);
        const nx = c.x + Math.sign(dx) * Math.min(Math.abs(dx), mv), from = sideOf(c.x);
        if (!w.bridge && from !== 0 && sideOf(nx) !== from) {
          const bank = from < 0 ? RIVER.x1 - 8 : RIVER.x2 + 8;
          if (fearsRiver(c)) {
            if (!c.flags.fearNews) { c.flags.fearNews = true; (c.news || (c.news = [])).push({ kind: 'learned', text: `${c.name} learned: the river is dangerous` }); }
            c.x = bank; a.done = true; a.until = T;
            if (!c.flags.justAvoided || T - c.flags.justAvoided > 60e3) { log(w, 'avoided', `${c.name} stopped at the river's edge`); events.push('avoided'); if (!c.flags.avoidedOnce) { c.flags.avoidedOnce = true; moment(w, `${c.name} stopped at the river's edge by itself.`); } }
            c.flags.justAvoided = T;
          } else {
            c.x = (RIVER.x1 + RIVER.x2) / 2; c.inWater = { from, until: T + 7000 };
            D.cold = clamp(D.cold + 0.35); D.fear = clamp(D.fear + 0.6); c.health = clamp(c.health - 0.06);
            c.riverFear = clamp(c.riverFear + 0.4 * g.learnRate);
            if (c.act) { c.act.done = true; c.act.until = T; }
            log(w, 'fell-in', `${c.name} fell into the river`); events.push('splash');
            if (!c.flags.fellIn) { c.flags.fellIn = true; moment(w, `${c.name} fell into the river for the first time.`, 0); }
            return events;
          }
        } else c.x = nx;
      }
      c.moving = Math.abs(dx) > 4;
      if (a.dollId) { const dl = w.items.find(i => i.id === a.dollId); if (dl && !dl.held) { dl.x = c.x + c.dir * 12; dl.carried = true; } }
      if (a.kind === 'want' && a.carry) { const b = w.items.find(i => i.type === 'ball'); if (b) { b.x = c.x + c.dir * 16; b.carried = true; b.vx = 0; } }
      const at = Math.abs(a.tx - c.x) < 14;
      if (at && !a.done) {
        if (a.kind === 'eat') {
          let v = 0;
          if (a.target.startsWith('bush:')) { const b = w.bushes[+a.target.slice(5)]; if (b && b.n > 0) { b.n--; v = FOOD.berry; } }
          else if (a.target.startsWith('patch:')) { const i = +a.target.slice(6); if (w.patch[i] >= 1) { w.patch[i] = 0; v = FOOD.carrot; } }
          else {
            const it = w.items.find(i => 'item:' + i.id === a.target);
            if (it) {
              v = FOOD[it.type]; w.items = w.items.filter(x => x !== it); ateThing(w, c, it.type, events);
              if (it.byHand && T - it.byHand < 120e3) { log(w, 'handfed', `${c.name} ate food you brought`); c.rel.affection = clamp(c.rel.affection + 0.03); c.rel.trust = clamp(c.rel.trust + 0.02); }
            }
          }
          if (v) {
            D.hunger = clamp(D.hunger - v); log(w, 'ate', `${c.name} ate`); events.push('ate');
            if (!c.flags.firstMeal) { c.flags.firstMeal = true; moment(w, `${c.name} ate for the first time.`); }
          }
          a.done = true;
        } else if (a.kind === 'hug') {
          D.lonely = clamp(D.lonely - 0.35 * gh); D.fear = clamp(D.fear - 0.4 * gh); c.hugging = true;
          const dl = w.items.find(i => 'item:' + i.id === a.target); if (dl) dl.x = c.x + c.dir * 10;
          if (!c.flags.hugged) { c.flags.hugged = true; moment(w, `${c.name} hugged its doll for the first time.`); }
        } else if (a.kind === 'play') {
          const toy = w.items.find(i => 'item:' + i.id === a.target);
          if (toy && toy.type === 'top') { if (!(toy.spin > T) && Math.random() < dt / 2500) { toy.spin = T + 8000; events.push('spin'); } D.bored = clamp(D.bored - (toy.spin > T ? 1.8 : 0.8) * gh); }
          else { D.bored = clamp(D.bored - (ctx.live ? 1.2 : 1.5) * gh); creatureKick(w, ctx, dt, events); }
        } else if (a.kind === 'poke') {
          pokeAt(w, c, a, dt, gh, events);
        } else if (a.kind === 'vend') {
          if (w.vendor.stock > 0) {
            w.vendor.stock--; D.hunger = clamp(D.hunger - FOOD.cake); log(w, 'vended', `${c.name} used the food machine`); events.push('vend');
            if (!c.flags.vended) { c.flags.vended = true; moment(w, `${c.name} used the food machine all by itself.`); }
          }
          a.done = true;
        } else if (a.kind === 'music') {
          if (!a.pressed) { a.pressed = true; pressMusic(w, true); events.push('music'); }
        } else if (a.kind === 'want') {
          doWant(w, a, ctx, dt, gh, events);
        } else if (a.kind === 'rest') {
          if (D.tired > 0.5 && inShelter(w, c)) { finish(w); c.asleep = true; }
        } else if (a.kind === 'approach') {
          D.lonely = clamp(D.lonely - 0.3 * gh);
        }
      }
    }
  } else c.moving = false;
  if (!(c.act && (c.act.kind === 'hug' || (c.act.kind === 'want' && c.act.what === 'hug')))) c.hugging = false;
  for (const it of w.items) if (it.type === 'doll' && it.carried && !(c.act && c.act.dollId === it.id)) it.carried = false;
  if (!(c.act && c.act.kind === 'want' && c.act.what === 'watch' && c.act.started)) c.gazing = false;
  if (!(c.act && c.act.kind === 'want' && c.act.what === 'dance') && !(T < w.musicUntil && Math.abs(c.x - w.pos.music) < 380 && !c.moving && !c.asleep)) c.dancing = false;
  if (ctx.live) chatter(w, ctx);
  return events;
}



// ---------- the robot ----------
const ROBOT_WORD = { bees: 'bees', cactus: 'cactus', squirrel: 'squirrel', mushroom: 'mushroom', food: 'food', shelter: 'home', water: 'water', ball: 'ball', doll: 'doll', toy: 'toy', music: 'music', machine: 'machine', flower: 'flower' };
function robotSay(w, text, ms = 3500) { w.robot.say = text; w.robot.sayUntil = w.simTime + ms; }
function robotTeach(w, k, meaning, word, mult = 0.3) {
  const prev = w.creature; w.creature = k;
  teach(w, word, meaning, mult); w.creature = prev;
}
function needsShelter(w, k, wx) { return k.d.cold > 0.6 || (wx.storm && k.d.fear > 0.4) || (k.health < 0.5 && k.d.cold > 0.35); }
function robotStep(w, dt, ctx, wx, gh, events) {
  const r = w.robot || (w.robot = newRobot()), T = w.simTime, on = sitterOn(w), ks = living(w).filter(k => !k.inWater);
  const speed = r.task ? 75 : 30;
  if (!r.task) {
    for (const k of ks) {
      const prev = w.creature; w.creature = k;
      const free = edible(w, k).some(f => reachable(w, f.x));
      w.creature = prev;
      if (sideOf(k.x) > 0 && !w.bridge && (k.d.cold > 0.5 || wx.storm)) { r.task = { kind: 'lever' }; break; }
      if ((k.d.hunger > 0.8 || (k.d.hunger > 0.6 && k.health < 0.5)) && !(k.act && k.act.kind === 'eat') && !w.items.some(i => i.type === 'cake' && !i.rotten && Math.abs(i.x - k.x) < 120)) {
        if (free && (!k.ledAt || T - k.ledAt > 8 * 60e3)) { r.task = { kind: 'lead', id: k.id }; break; }
        if (w.vendor.stock > 0 && (w.bridge || sideOf(w.pos.vendor) === sideOf(r.x))) { r.task = { kind: 'vend', id: k.id }; break; }
        if (w.coins >= TOCK_CAKE) { r.task = { kind: 'buy', id: k.id }; break; }
        if (!r.brokeAt || T - r.brokeAt > 2 * HOUR) { r.brokeAt = T; robotSay(w, 'no coins…', 5000); const prev = w.creature; w.creature = k; log(w, 'tock-broke', `${r.name} had no coins to buy food for ${k.name}`); w.creature = prev; events.push('tock-broke'); }
      }
      if (needsShelter(w, k, wx) && !inShelter(w, k) && !(k.bias && k.bias.kind === 'rest' && k.bias.until > T)) { r.task = { kind: 'guide', id: k.id }; break; }
    }
  }
  const t = r.task;
  if (t) {
    const k = t.id ? kithById(w, t.id) : null;
    if (t.id && (!k || !k.alive)) r.task = null;
    else {
      r.tx = t.kind === 'lever' ? LEVER_X - 20 : t.kind === 'vend' ? w.pos.vendor - 26 : t.kind === 'buy' ? DOCK_X : k.x + (k.x > W - 80 ? -34 : 34);
      if (t.kind !== 'lever' && sideOf(r.tx) !== sideOf(r.x) && !w.bridge) r.tx = LEVER_X - 20;
      if (Math.abs(r.tx - r.x) < 10) {
        if (t.kind === 'lever' && !w.bridge) { w.bridge = true; robotSay(w, 'bridge!'); log(w, 'sitter-bridge', `${r.name} lowered the bridge`); events.push('robot-lever'); r.task = null; }
        else if (t.kind === 'lever') r.task = null;
        else if (t.kind === 'lead') {
          k.ledAt = T; k.bias = { kind: 'eat', until: T + 5 * 60e3, s: 1.6 }; if (k.asleep) k.asleep = false; if (k.act) k.act.until = T;
          robotSay(w, 'food!'); robotTeach(w, k, 'food', 'food');
          const prev = w.creature; w.creature = k; log(w, 'tock-led', `${r.name} showed ${k.name} where the food is`); w.creature = prev;
          r.task = null;
        } else if (t.kind === 'vend') {
          if (w.vendor.stock > 0) { w.vendor.stock--; r.carry = 'cake'; robotSay(w, 'machine.'); r.task = { kind: 'feed', id: k.id, src: 'vend' }; } else r.task = null;
        } else if (t.kind === 'buy') {
          if (w.coins >= TOCK_CAKE) { w.coins -= TOCK_CAKE; w.tockSpent = (w.tockSpent || 0) + TOCK_CAKE; r.carry = 'cake'; log(w, 'tock-bought', `${r.name} bought a seed cake for ${TOCK_CAKE} coins`); events.push('tock-bought'); r.task = { kind: 'feed', id: k.id, src: 'buy' }; } else r.task = null;
        }
        else if (t.kind === 'feed') {
          r.carry = null;
          w.items.push({ id: nid(), type: 'cake', x: clamp(k.x + 18, 30, W - 30), born: T, bySitter: true });
          robotSay(w, 'food!'); robotTeach(w, k, 'food', 'food');
          k.robotRel.trust = clamp(k.robotRel.trust + 0.03); k.robotRel.affection = clamp(k.robotRel.affection + 0.02);
          const prev = w.creature; w.creature = k; log(w, 'sitter-fed', `${r.name} brought ${k.name} a seed cake`); w.creature = prev;
          events.push('robot-fed'); r.task = null;
        } else if (t.kind === 'guide') {
          k.bias = { kind: 'rest', until: T + 10 * 60e3, s: 2 }; if (k.asleep) k.asleep = false; if (k.act) k.act.until = T;
          robotSay(w, 'home!'); robotTeach(w, k, 'shelter', 'home');
          k.robotRel.trust = clamp(k.robotRel.trust + 0.02);
          const prev = w.creature; w.creature = k; log(w, 'sitter-guided', `${r.name} led ${k.name} to the shelter`); w.creature = prev;
          r.task = { kind: 'escort', id: k.id, until: T + 5 * 60e3 };
        } else if (t.kind === 'escort') { if (inShelter(w, k) || T > t.until) r.task = null; }
      }
    }
  } else {
    if (!r.idleUntil || T > r.idleUntil) { r.tx = clamp(DOCK_X + (Math.random() - 0.5) * 300, 40, W - 40); if (sideOf(r.tx) !== sideOf(r.x) && !w.bridge) r.tx = r.x; r.idleUntil = T + 20e3 + Math.random() * 30e3; }
    // name things for a nearby Kith now and then
    if (ctx.live && T > r.nextName) {
      const k = ks.find(k => Math.abs(k.x - r.x) < 160 && !k.asleep);
      if (k) {
        r.nextName = T + 45e3 + Math.random() * 45e3;
        const f = focusFor(w, k);
        if (f && ROBOT_WORD[f] ) { robotSay(w, ROBOT_WORD[f] + '.'); robotTeach(w, k, f, ROBOT_WORD[f], 0.25); events.push('robot-named'); }
        else if (ctx.present && Math.random() < 0.5) { robotSay(w, w.playerName + '!'); robotTeach(w, k, 'you', w.playerName.toLowerCase(), 0.2); events.push('robot-named'); }
        else { robotSay(w, k.name + '.'); robotTeach(w, k, 'self', k.name.toLowerCase(), 0.2); }
      }
    }
  }
  // river warnings (on duty)
  if (T > r.nextWarn) for (const k of ks) {
    if (w.bridge || fearsRiver(k) || !k.act || !k.moving || Math.abs(r.x - k.x) > 600) continue;
    const bank = Math.min(Math.abs(k.x - RIVER.x1), Math.abs(k.x - RIVER.x2));
    if (bank < 80 && sideOf(k.act.tx) !== sideOf(k.x)) {
      r.nextWarn = T + 60e3; robotSay(w, 'water, no!'); k.riverFear = clamp(k.riverFear + 0.12); robotTeach(w, k, 'water', 'water', 0.3);
      const prev = w.creature; w.creature = k; log(w, 'robot-warn', `${r.name} warned ${k.name} away from the river`); w.creature = prev; events.push('robot-warn');
    }
  }
  if (T > (r.nextHaz || 0)) for (const k of ks) {
    if (!k.act || Math.abs(r.x - k.x) > 450) continue;
    const tgt = k.act.target || '', o = tgt.startsWith('obj:') ? tgt.slice(4) : tgt.startsWith('item:') ? itemObj(w, tgt) : null;
    if (!['hive', 'cactus', 'red'].includes(o) || (k.objVal[o] || 0) < -0.4) continue;
    r.nextHaz = T + 90e3; const word = o === 'hive' ? 'bees' : o === 'red' ? 'mushroom' : 'cactus';
    robotSay(w, word + ', no!'); robotTeach(w, k, word, word, 0.3); robotTeach(w, k, 'no', 'no', 0.3);
    k.objVal[o] = clamp((k.objVal[o] || 0) - 0.12, -1, 1);
    const prev = w.creature; w.creature = k; log(w, 'robot-warn', `${r.name} warned ${k.name} about the ${word}`); w.creature = prev; events.push('robot-warn'); break;
  }
  const mv = speed * dt / 1000, dx = r.tx - r.x;
  if (Math.abs(dx) > 3) { const nx = r.x + Math.sign(dx) * Math.min(Math.abs(dx), mv); if (w.bridge || sideOf(nx) === sideOf(r.x) || sideOf(r.x) === 0) r.x = nx; else r.tx = r.x; }
  r.moving = Math.abs(dx) > 3;
  for (const k of ks) {
    if (Math.abs(k.x - r.x) < 140 && !k.asleep) {
      k.robotRel.familiarity = clamp(k.robotRel.familiarity + 0.03 * gh);
      k.d.lonely = clamp(k.d.lonely - 0.08 * gh * (0.3 + k.robotRel.affection));
      k.robotRel.affection = clamp(k.robotRel.affection + 0.006 * gh);
    }
  }
}
function robotCare(w, c, wx, events) { /* babysitting now handled by the robot itself in robotStep */ }
function focusFor(w, k) {
  const a = k.act;
  if (a && a.target) { if (a.target === 'bush' || a.target.startsWith('patch:')) return 'food'; const it = w.items.find(i => 'item:' + i.id === a.target); if (it) return it.type === 'ball' ? 'ball' : it.type === 'doll' ? 'doll' : it.type === 'top' ? 'toy' : 'food'; }
  if (a && a.target && a.target.startsWith('obj:')) { const o = a.target.slice(4); return o === 'hive' ? 'bees' : o; }
  if (Math.abs(k.x - HIVE_X) < 80) return 'bees';
  if (Math.abs(k.x - CACTUS_X) < 60) return 'cactus';
  if (Math.abs(k.x - w.pos.music) < 70) return 'music';
  if (Math.abs(k.x - w.pos.vendor) < 70) return 'machine';
  if (w.shelters.some(s => Math.abs(k.x - s.x) < 70)) return 'shelter';
  if (Math.min(Math.abs(k.x - RIVER.x1), Math.abs(k.x - RIVER.x2)) < 90) return 'water';
  if (k.x > 2050) return 'flower';
  return null;
}

// ---------- social life ----------
function kinRel(a, b) { return a.kin[b.id] || (a.kin[b.id] = { familiarity: 0, affection: 0.1, trust: 0.2 }); }
function socialStep(w, dt, gh, ctx, events) {
  const ks = living(w).filter(k => !k.inWater), T = w.simTime;
  for (const a of ks) for (const b of ks) {
    if (a === b) continue;
    const r = kinRel(a, b), d = Math.abs(a.x - b.x);
    if (d < 140 && !a.asleep) {
      r.familiarity = clamp(r.familiarity + 0.05 * gh);
      a.d.lonely = clamp(a.d.lonely - 0.25 * gh * (0.4 + r.affection));
      if (!b.asleep) r.affection = clamp(r.affection + 0.015 * gh * (0.4 + b.genome.sociability) * (b.d.fear < 0.5 ? 1 : 0.3));
      if (!ctx.live && !b.asleep) for (const [wd, e] of Object.entries(b.lex)) if (e.s >= 0.5 && !wd.startsWith('kin:') && e.m !== 'self') { const le = a.lex[wd]; if (!le || le.m === e.m) { const prev = w.creature; w.creature = a; teach(w, wd, e.m, 0.04 * gh * (b.parents && a.parents.includes(b.id) ? 1.5 : 1)); w.creature = prev; } }
    }
  }
  // bonding and eggs
  if (ks.length < 6) for (const a of ks) for (const b of ks) {
    if (a.id >= b.id || a.stage !== 'adult' || b.stage !== 'adult' || a.asleep || b.asleep) continue;
    if (Math.abs(a.x - b.x) > 70 || !content(a) || !content(b)) continue;
    if (a.parents.includes(b.id) || b.parents.includes(a.id) || (a.parents.length && a.parents.some(p => b.parents.includes(p)))) continue;
    const ra = kinRel(a, b), rb = kinRel(b, a);
    if (ra.affection < 0.55 || rb.affection < 0.55) continue;
    if ((a.lastEgg && T - a.lastEgg < 1.5 * DAY) || (b.lastEgg && T - b.lastEgg < 1.5 * DAY)) continue;
    if (Math.random() > dt / (3 * HOUR / (w.scale || 1))) continue;
    layEgg(w, a, b, events);
  }
}
const EGG_NAMES = ['Pip', 'Moss', 'Tansy', 'Bram', 'Wren', 'Nib', 'Olly', 'Fen', 'Juniper', 'Quill', 'Sorrel', 'Bean', 'Kip', 'Lark', 'Pom', 'Tuft', 'Ember', 'Clove'];
function freshName(w) { const used = new Set(w.kith.map(k => k.name)); const free = EGG_NAMES.filter(n => !used.has(n)); return free.length ? free[Math.floor(Math.random() * free.length)] : 'Kit' + (w.kith.length + 1); }
function crossGenome(a, b) {
  const g = {}, pick = k => (Math.random() < 0.5 ? a : b)[k], mut = (v, lo, hi, amt) => Math.random() < 0.15 ? clamp(v + (Math.random() - 0.5) * amt, lo, hi) : v;
  g.hue = Math.round(((a.hue + b.hue) / 2 + (Math.abs(a.hue - b.hue) > 180 ? 180 : 0) + (Math.random() - 0.5) * 40 + 360) % 360);
  g.size = mut(pick('size'), 0.8, 1.2, 0.2);
  for (const k of ['curiosity', 'agreeable', 'sociability', 'hardiness']) g[k] = mut(pick(k), 0, 1, 0.4);
  g.learnRate = mut(pick('learnRate'), 0.6, 1.5, 0.4);
  g.lifespan = mut(pick('lifespan'), 12.5, 15, 1);
  g.syll = [a.syll[0], b.syll[1], (Math.random() < 0.5 ? a : b).syll[2]];
  return g;
}
function layEgg(w, a, b, events) {
  const T = w.simTime, sh = nearestShelterTo(w, (a.x + b.x) / 2);
  const egg = newCreature(freshName(w), T, crossGenome(a.genome, b.genome), clamp(sh.x + 40, 40, W - 40));
  egg.hatchAt = T + DAY / (w.scale || 1); egg.parents = [a.id, b.id]; egg.gen = Math.max(a.gen || 1, b.gen || 1) + 1;
  w.kith.push(egg); a.lastEgg = b.lastEgg = T;
  kinRel(a, egg).affection = 0.6; kinRel(b, egg).affection = 0.6;
  const prev = w.creature; w.creature = a;
  log(w, 'egg', `${a.name} and ${b.name} made an egg`); moment(w, `${a.name} and ${b.name} made an egg together. It will be called ${egg.name}.`, 30);
  w.creature = prev; events.push('egg:' + egg.id);
}
function nearestShelterTo(w, x) { return w.shelters.slice().sort((p, q) => Math.abs(p.x - x) - Math.abs(q.x - x))[0] || { x: SHELTER_X }; }
function hatchInherit(w, c) {
  const ps = c.parents.map(id => kithById(w, id)).filter(Boolean);
  if (!ps.length) return;
  const avg = f => ps.reduce((s, p) => s + f(p), 0) / ps.length;
  c.rel.trust = clamp(0.1 + 0.6 * avg(p => p.rel.trust)); c.rel.affection = clamp(0.05 + 0.4 * avg(p => p.rel.affection));
  c.robotRel.trust = clamp(0.1 + 0.5 * avg(p => p.robotRel.trust));
  c.riverFear = clamp(0.3 * Math.max(...ps.map(p => p.riverFear)));
  for (const p of ps) {
    kinRel(c, p).affection = 0.6; kinRel(c, p).trust = 0.6;
    for (const b of p.beliefs || []) if (['you', 'river', 'robot'].includes(b.about) && b.s > 0.3) addBelief(c, b.about, b.feel * 0.7, b.text);
  }
  if (c.beliefs) for (const b of c.beliefs) b.s = Math.min(b.s, 0.35);
}

// ---------- critters, hazards and curiosity ----------
function hurt(w, c, amount, fear, text, type, events) {
  c.health = clamp(c.health - amount); c.d.fear = clamp(c.d.fear + fear);
  c.say = '!!'; c.sayUntil = w.simTime + 1500; c.think = ['scared']; c.thinkUntil = w.simTime + 2500;
  log(w, type, text); events.push(type);
}
function faunaStep(w, dt, gh, wx, ctx, events) {
  const f = w.fauna || (w.fauna = newFauna()), T = w.simTime, s = dt / 1000;
  const h = f.hive; h.anger = clamp(h.anger - 0.3 * gh); if (wx.temp > 6) { h.g += gh / 6; while (h.g >= 1) { h.g -= 1; if (h.honey < 2) h.honey++; } }
  if (f.swarm && T > f.swarm.until) f.swarm = null;
  // squirrel: potters near its tree, bolts up it when chased
  const q = f.squirrel, ks = living(w).filter(k => !k.asleep && !k.inWater);
  const chaser = ks.find(k => Math.abs(k.x - q.x) < 90 && k.act && k.act.target === 'obj:squirrel');
  if (q.up) { if (T > q.upUntil && !ks.some(k => Math.abs(k.x - TREE_X) < 60)) { q.up = false; q.x = TREE_X; } }
  else if (chaser) { q.tx = TREE_X; q.x += Math.sign(q.tx - q.x) * Math.min(Math.abs(q.tx - q.x), 150 * s); if (Math.abs(q.x - TREE_X) < 6) { q.up = true; q.upUntil = T + 25e3; events.push('squirrel-up'); } }
  else { if (Math.abs(q.tx - q.x) < 4 || Math.random() < s / 8) q.tx = clamp(TREE_X + (Math.random() - 0.5) * 420, 150, 1100); q.x += Math.sign(q.tx - q.x) * Math.min(Math.abs(q.tx - q.x), 45 * s); }
  if (wx.night && !q.up) { q.up = true; q.x = TREE_X; q.upUntil = T + 3 * HOUR; }
  // butterflies: daytime only, flutter about and dart away from chasers
  for (const b of f.butterflies) {
    b.ph += s * 3; b.x = clamp(b.x + Math.sin(b.ph * 0.7) * 25 * s + (b.drift || 0) * s, 40, W - 40); b.drift = (b.drift || 0) * Math.pow(0.4, s);
    if (sideOf(b.x) === 0) b.drift = (b.drift || 0) + (b.x < (RIVER.x1 + RIVER.x2) / 2 ? -30 : 30) * s;
    const k = ks.find(k => Math.abs(k.x - b.x) < 35); if (k) b.drift = (b.x > k.x ? 1 : -1) * 90;
  }
  // mushrooms pop up in the shade, one of each kind a garden day at most
  if (T > (f.shroomT || 0)) {
    f.shroomT = T + DAY / (w.scale || 1) / 2;
    if (w.items.filter(i => i.type === 'shroomB' || i.type === 'shroomR').length < 4) {
      const kind = Math.random() < 0.5 ? 'shroomB' : 'shroomR', spots = [TREE_X - 60, TREE_X + 70, 1950, 2160, 1420];
      w.items.push({ id: nid(), type: kind, x: spots[Math.floor(Math.random() * spots.length)] + (Math.random() - 0.5) * 50, born: T });
    }
  }
}
function itemObj(w, ref) { const it = w.items.find(i => 'item:' + i.id === ref); return it ? (it.type === 'shroomR' ? 'red' : it.type === 'shroomB' ? 'brown' : null) : null; }
function pokeTarget(w, c, only) {
  const f = w.fauna; if (!f) return null;
  const opts = [];
  if (f.hive.honey > 0 || c.objVal.hive > 0) opts.push({ obj: 'hive', x: HIVE_X - 18 });
  opts.push({ obj: 'cactus', x: CACTUS_X - 16 });
  if (!f.squirrel.up) opts.push({ obj: 'squirrel', x: f.squirrel.x });
  const wx = weatherAt(w.seed, w.simTime, w.scale || 1);
  if (!wx.night && !wx.rain) for (const b of f.butterflies) opts.push({ obj: 'butterfly', x: b.x });
  let best = null, bs = -1e9;
  for (const o of opts) {
    if (only && !only.includes(o.obj)) continue;
    if (!naiveOk(w, o.x)) continue;
    const v = c.objVal[o.obj] || 0;
    if (v < -0.35 && !(o.obj === 'hive' && c.d.hunger > 0.75 && c.genome.curiosity > 0.5)) continue;
    const sc = v + 0.3 * c.genome.curiosity + Math.random() * 0.5 - Math.abs(o.x - c.x) / 2500;
    if (sc > bs) { bs = sc; best = o; }
  }
  return best;
}
function pokeTrack(w, c, a) {
  const f = w.fauna, o = a.target.slice(4);
  if (o === 'squirrel') { a.tx = f.squirrel.up ? TREE_X + 20 : f.squirrel.x; }
  if (o === 'butterfly') { const b = f.butterflies.slice().sort((p, q) => Math.abs(p.x - c.x) - Math.abs(q.x - c.x))[0]; if (b) a.tx = b.x; }
}
function pokeAt(w, c, a, dt, gh, events) {
  const o = a.target.slice(4), f = w.fauna, T = w.simTime, lr = c.genome.learnRate, D = c.d;
  const ov = d => { c.objVal[o] = clamp((c.objVal[o] || 0) + d, -1, 1); };
  if (!a.started) { a.started = true; events.push('poke:' + o); }
  if (o === 'hive') {
    if (a.done) return;
    a.done = true;
    const h = f.hive, stingP = (h.honey > 0 ? 0.3 : 0.55) + 0.5 * h.anger;
    if (h.honey > 0) { h.honey--; D.hunger = clamp(D.hunger - FOOD.honey); D.bored = clamp(D.bored - 0.4); ov(0.3 * lr); log(w, 'honey', `${c.name} got some honey`); events.push('honey'); if (!c.flags.honey) { c.flags.honey = true; moment(w, `${c.name} got honey from the beehive for the first time.`); } }
    h.anger = clamp(h.anger + 0.45);
    if (Math.random() < stingP) {
      hurt(w, c, 0.05, 0.5, `${c.name} was stung by the bees`, 'stung', events); ov(-0.7 * lr);
      f.swarm = { id: c.id, until: T + 6000 };
      c.bias = { kind: 'wander', until: T + 8000, s: 1.5 }; a.until = T;
      if (!c.flags.stung) { c.flags.stung = true; moment(w, `${c.name} was stung by bees for the first time.`, 0); }
    }
  } else if (o === 'cactus') {
    if (a.done) return; a.done = true;
    if (Math.random() < 0.85) { hurt(w, c, 0.02, 0.3, `${c.name} was pricked by the cactus`, 'pricked', events); ov(-0.55 * lr); if (!c.flags.pricked) { c.flags.pricked = true; moment(w, `${c.name} touched the cactus. Ouch.`, 0); } }
    else { D.bored = clamp(D.bored - 0.3); ov(0.05); }
  } else if (o === 'squirrel' || o === 'butterfly') {
    D.bored = clamp(D.bored - 1.1 * gh); ov(0.02 * gh);
    if (!a.logged && (!c.chaseLog || T - c.chaseLog > 20 * 60e3)) { a.logged = true; c.chaseLog = T; log(w, 'chased', `${c.name} chased the ${o}`); if (!c.flags['chased_' + o]) { c.flags['chased_' + o] = true; moment(w, `${c.name} chased the ${o} for the first time.`); } }
    if (o === 'squirrel' && f.squirrel.up && Math.random() < dt / 4000) { c.say = gateSpeech(c, (wordFor(c, 'squirrel') || '') + '!'); c.sayUntil = T + 2000; }
  }
}
function ateThing(w, c, type, events) {
  if (type === 'shroomR') {
    c.sickUntil = w.simTime + 2 * HOUR / (w.scale || 1);
    hurt(w, c, 0.08, 0.3, `${c.name} ate a red mushroom and felt sick`, 'sick', events);
    c.d.hunger = clamp(c.d.hunger + 0.2); c.objVal.red = clamp((c.objVal.red || 0) - 0.6 * c.genome.learnRate, -1, 1);
    if (!c.flags.sick) { c.flags.sick = true; moment(w, `${c.name} ate a red mushroom and was sick.`, 0); }
  } else if (type === 'shroomB') { c.objVal.brown = clamp((c.objVal.brown || 0) + 0.15, -1, 1); }
}
function warnStep(w, events) {
  const ks = living(w).filter(k => !k.asleep && !k.inWater), T = w.simTime;
  for (const a of ks) {
    if (a.warnAt && T - a.warnAt < 60e3) continue;
    for (const b of ks) {
      if (a === b || Math.abs(a.x - b.x) > 260 || !b.act || b.act.done) continue;
      const tgt = b.act.target || '', o = tgt.startsWith('obj:') ? tgt.slice(4) : tgt.startsWith('item:') ? itemObj(w, tgt) : null;
      if (!o || !['hive', 'cactus', 'red'].includes(o)) continue;
      if ((a.objVal[o] || 0) > -0.4 || (b.objVal[o] || 0) < -0.4) continue;
      a.warnAt = T;
      const words = [wordFor(a, OBJ_WORD[o] === 'bees' ? 'bees' : OBJ_WORD[o]), wordFor(a, 'no') || wordFor(a, 'bad')].filter(Boolean);
      a.say = words.length ? gateSpeech(a, words.join(' ') + '!') : '!!'; a.sayUntil = T + 3000; a.think = [o === 'hive' ? 'scared' : 'scared']; a.thinkUntil = T + 2500;
      const trust = kinRel(b, a).trust, heed = 0.15 * (0.6 + trust) * (words.length ? 1.4 : 1);
      b.objVal[o] = clamp((b.objVal[o] || 0) - heed, -1, 1);
      for (const wd of words) { const e = a.lex[wd]; if (e) { const prev = w.creature; w.creature = b; teach(w, wd, e.m, 0.4); w.creature = prev; } }
      const heeded = b.objVal[o] < -0.3 || Math.random() < trust * 0.6;
      if (heeded) { b.act.done = true; b.act.until = T; }
      const prev = w.creature; w.creature = a;
      log(w, 'warned', `${a.name} warned ${b.name} about the ${o === 'red' ? 'red mushroom' : o === 'hive' ? 'bees' : o}`);
      if (!a.flags.warnedOnce) { a.flags.warnedOnce = true; moment(w, `${a.name} warned ${b.name} about the ${o === 'red' ? 'red mushrooms' : o === 'hive' ? 'bees' : o}${heeded ? ', and ' + b.name + ' listened' : ''}.`); }
      w.creature = prev; events.push('warned:' + a.id + ':' + b.id + ':' + (heeded ? 1 : 0));
      break;
    }
  }
}
function plantBush(w, x) { if (sideOf(x) === 0) x = x < 1240 ? RIVER.x1 - 60 : RIVER.x2 + 60; w.bushes.push({ x: clamp(x, 60, W - 60), n: 0, g: 0.5 }); }
function plantCarrots(w, x) { if (sideOf(x) === 0 || sideOf(x + 100) === 0) x = x < 1240 ? RIVER.x1 - 160 : RIVER.x2 + 40; x = clamp(x, 40, W - 140); for (let i = 0; i < 3; i++) { w.patchX.push(x + i * 45); w.patch.push(0.2); } }

const SUBJECT_ACTION = { you: 'approach', shelter: 'rest', ball: 'play', food: 'eat', robot: null, storm: null, cold: 'rest', night: 'rest', river: null, music: 'music', machine: 'vend', doll: 'hug', bees: null, cactus: null, squirrel: null, mushroom: null };
const SUBJECT_OBJ = { bees: 'hive', cactus: 'cactus', squirrel: 'squirrel', mushroom: 'red' };
const SUBJECTS = Object.keys(SUBJECT_ACTION);
function beliefPull(c, a) {
  let s = 0;
  for (const b of c.beliefs || []) if (SUBJECT_ACTION[b.about] === a) s += 0.25 * b.feel * b.s;
  return s;
}
function dayDigest(w, since, until) {
  const me = w.creature.id, ev = w.log.filter(e => e.t > since && e.t <= until && (!e.who || e.who === me)), n = t => ev.filter(e => e.type === t).length;
  const d = { stung: n('stung'), pricked: n('pricked'), sick: n('sick'), honey: n('honey'), chased: n('chased'), warnedOthers: n('warned'), robotwarn: n('robot-warn'), tickle: n('tickle'), comfort: n('comfort'), scold: n('scold'), handfed: n('handfed'), ate: n('ate'), played: n('played'),
    storm: n('storm'), frost: n('frost'), starving: n('starving'), freezing: n('freezing'), sitter: n('sitter-fed') + n('sitter-guided') + n('tock-led'),
    slept_out: n('slept-out'), words: ev.filter(e => e.type === 'word').map(e => (e.text.match(/"(.+)"/) || [])[1]).filter(Boolean),
    talked: ev.filter(e => e.type === 'talk').length, fell: n('fell-in'), avoided: n('avoided'), vended: n('vended'), music: n('music'), board: n('board') };
  const lines = [];
  if (d.tickle) lines.push(`was tickled ${d.tickle} times`); if (d.comfort) lines.push(`was comforted when frightened or cold ${d.comfort} times`);
  if (d.scold) lines.push(`was scolded ${d.scold} times`); if (d.handfed) lines.push(`ate food the player brought ${d.handfed} times`);
  if (d.ate) lines.push(`ate ${d.ate} times in all`); if (d.played) lines.push(`played with the ball`);
  if (d.talked) lines.push(`was talked to ${d.talked} times`); if (d.words.length) lines.push(`heard new words: ${d.words.join(', ')}`);
  if (d.storm) lines.push('lived through a storm'); if (d.frost) lines.push('felt frost'); if (d.freezing) lines.push('got dangerously cold');
  if (d.fell) lines.push(`fell into the river ${d.fell} time${d.fell > 1 ? 's' : ''} and got soaked and scared`); if (d.avoided) lines.push('stopped itself at the river edge');
  if (d.vended) lines.push('used the food machine by itself'); if (d.music) lines.push('played the music box and danced'); if (d.board) lines.push('watched the word board');
  if (d.starving) lines.push('went very hungry'); if (d.sitter) lines.push(`was looked after by ${w.robot ? w.robot.name : 'the babysitter robot'}, the robot`); if (d.slept_out) lines.push('fell asleep outside in the cold');
  if (d.honey) lines.push('got honey from the beehive'); if (d.stung) lines.push(`was stung by bees${d.stung > 1 ? ' ' + d.stung + ' times' : ''}`); if (d.pricked) lines.push('was pricked by the cactus');
  if (d.sick) lines.push('ate a red mushroom and was sick'); if (d.chased) lines.push('chased the squirrel or butterflies'); if (d.warnedOthers) lines.push('warned a friend about something dangerous');
  if (d.robotwarn) lines.push(`was warned away from the river by ${w.robot ? w.robot.name : 'the robot'}`);
  const friends = living(w).filter(k => k !== w.creature).map(k => k.name); if (friends.length) lines.push(`shared the garden with ${friends.join(', ')}`);
  if (!d.tickle && !d.comfort && !d.talked && !d.handfed) lines.push('did not see the player at all');
  return { d, text: lines.join('; ') };
}
function addBelief(c, about, feel, text) {
  if (!SUBJECTS.includes(about)) return;
  feel = clamp(+feel || 0, -1, 1); text = String(text || '').slice(0, 60);
  const old = c.beliefs.find(b => b.about === about);
  if (old) { old.feel = clamp(old.feel * 0.5 + feel * 0.6, -1, 1); old.s = clamp(old.s + 0.25); old.text = text || old.text; }
  else c.beliefs.push({ about, feel, text, s: 0.5 });
  c.beliefs.sort((a, b) => b.s - a.s); c.beliefs = c.beliefs.slice(0, 8);
}
function decayBeliefs(c) { for (const b of c.beliefs) b.s = clamp(b.s - 0.08); c.beliefs = c.beliefs.filter(b => b.s > 0.05); }
function applyNight(w, night, res) {
  const c = w.creature; if (night.id ? c.id !== night.id : c.name !== night.name) return;
  decayBeliefs(c);
  for (const b of (res.beliefs || []).slice(0, 3)) addBelief(c, String(b.about || ''), b.feel, b.text);
  for (const b of c.beliefs) if (SUBJECT_OBJ[b.about] && c.objVal) c.objVal[SUBJECT_OBJ[b.about]] = clamp((c.objVal[SUBJECT_OBJ[b.about]] || 0) + 0.08 * b.feel * b.s, -1, 1);
  const rv = c.beliefs.find(b => b.about === 'river' && b.feel < 0); if (rv) c.riverFear = clamp(c.riverFear + 0.1 * -rv.feel * rv.s);
  const you = c.beliefs.find(b => b.about === 'you');
  if (you) c.rel.trust = clamp(c.rel.trust + 0.03 * you.feel * you.s);
  if (res.wants) setWants(w, res.wants);
  if (res.dream) { w.dreams.push({ t: night.until, who: c.name, text: String(res.dream).slice(0, 280) }); if (w.dreams.length > 40) w.dreams.shift(); }
}
function ruleNight(w, night) {
  const c = w.creature, { d } = dayDigest(w, night.since, night.until), bs = [];
  const warmth = d.tickle + 2 * d.comfort + d.handfed - 2 * d.scold;
  if (warmth > 0) bs.push({ about: 'you', feel: Math.min(1, warmth / 5), text: `${w.playerName} = good` });
  else if (d.scold > 0) bs.push({ about: 'you', feel: -Math.min(1, d.scold / 4), text: 'hand hurts' });
  else if (!d.tickle && !d.talked) bs.push({ about: 'you', feel: -0.2, text: `${w.playerName} gone` });
  if (d.storm || d.frost) bs.push({ about: 'shelter', feel: d.slept_out || d.freezing ? 0.8 : 0.4, text: 'cold outside, shelter warm' });
  if (d.played) bs.push({ about: 'ball', feel: 0.5, text: 'ball = fun' });
  if (d.starving) bs.push({ about: 'food', feel: 0.7, text: 'belly empty = bad' });
  if (d.fell) bs.push({ about: 'river', feel: -0.8, text: 'water bites' });
  if (d.stung) bs.push({ about: 'bees', feel: -0.7, text: 'bees hurt' }); else if (d.honey) bs.push({ about: 'bees', feel: 0.4, text: 'honey sweet' });
  if (d.pricked) bs.push({ about: 'cactus', feel: -0.7, text: 'spiky = ouch' }); if (d.sick) bs.push({ about: 'mushroom', feel: -0.8, text: 'red food = sick' }); if (d.chased) bs.push({ about: 'squirrel', feel: 0.5, text: 'squirrel fun' });
  if (d.sitter || d.robotwarn) bs.push({ about: 'robot', feel: 0.5, text: `${w.robot ? w.robot.name : 'robot'} helps` });
  if (d.vended) bs.push({ about: 'machine', feel: 0.6, text: 'button = food' });
  if (d.music) bs.push({ about: 'music', feel: 0.5, text: 'music = dance' });
  const pics = ['a red ball that rolls forever', 'a carrot as tall as a tree', 'warm hands in the rain', 'thunder that turns into purring', 'a shelter full of stars'];
  ruleWants(w);
  applyNight(w, night, { beliefs: bs, dream: `${c.name} dreamed of ${pics[Math.floor(Math.random() * pics.length)]}.` });
}

function catchUp(w, now, maxSteps = 30000) {
  const target = now + w.offset;
  let n = 0;
  while (w.simTime < target - 1000 && n < maxSteps) { step(w, Math.min(60e3, target - w.simTime), { present: false, hand: null, live: false }); n++; }
  if (w.simTime < target - 1000) w.simTime = target;
  return n;
}

function awaySummary(w, since) {
  const all = w.log.filter(e => e.t > since), hours = (w.simTime - since) / HOUR, out = [];
  const g = t => all.filter(e => e.type === t).length;
  if (g('storm')) out.push(g('storm') > 1 ? `${g('storm')} storms passed through.` : 'A storm passed through.');
  if (g('frost')) out.push('It got below freezing.');
  if (g('shelter')) out.push('A storm damaged a shelter.');
  if (g('bridge-up')) out.push('A storm raised the bridge.');
  if (g('tock-bought')) out.push(`${w.robot.name} bought ${g('tock-bought')} seed cake${g('tock-bought') > 1 ? 's' : ''} (${g('tock-bought') * TOCK_CAKE} coins).`);
  if (g('tock-broke')) out.push(`${w.robot.name} ran out of coins to buy food.`);
  for (const e of all.filter(e => e.type === 'egg')) out.push(e.text + '!');
  for (const k of w.kith) {
    const ev = all.filter(e => e.who === k.id), n = t => ev.filter(e => e.type === t).length, bits = [];
    if (n('hatch')) bits.push('hatched');
    if (n('ate') + n('vended')) bits.push(`ate ${n('ate') + n('vended')} time${n('ate') + n('vended') > 1 ? 's' : ''}`);
    if (n('sitter-fed')) bits.push(`was fed by ${w.robot.name} ${n('sitter-fed')} time${n('sitter-fed') > 1 ? 's' : ''}`);
    if (n('sitter-guided')) bits.push(`was led home by ${w.robot.name}`);
    if (n('tock-led')) bits.push(`was shown the food by ${w.robot.name}`);
    if (n('honey')) bits.push('got honey'); if (n('stung')) bits.push(`was stung by bees${n('stung') > 1 ? ' ' + n('stung') + ' times' : ''}`); if (n('pricked')) bits.push('was pricked by the cactus'); if (n('sick')) bits.push('ate a red mushroom and was sick'); if (n('chased')) bits.push('chased the squirrel'); if (n('warned')) bits.push('warned a friend away from danger');
    if (n('robot-warn')) bits.push(`was warned off the river by ${w.robot.name}`);
    if (n('fell-in')) bits.push(`fell into the river${n('fell-in') > 1 ? ' ' + n('fell-in') + ' times' : ''}`);
    if (n('avoided')) bits.push("stopped itself at the river's edge");
    if (n('slept-out')) bits.push('fell asleep outside in the cold');
    if (n('starving')) bits.push('went hungry for a long time');
    if (n('freezing')) bits.push('got dangerously cold');
    if (n('weak')) bits.push('grew weak');
    const forgot = ev.filter(e => e.type === 'forgot').map(e => (e.text.match(/"(.+)"/) || [])[1]).filter(Boolean);
    if (forgot.length) bits.push(`forgot ${forgot.map(x => `"${x}"`).join(', ')}`);
    const death = ev.find(e => e.type === 'death');
    if (bits.length) out.push(`${k.name} ${bits.length > 1 ? bits.slice(0, -1).join(', ') + ' and ' + bits[bits.length - 1] : bits[0]}.`);
    if (death) out.push(death.text + '.');
  }
  if (!out.length) out.push('A quiet stretch. Nothing much happened.');
  return { hours, lines: out };
}

if (typeof module !== 'undefined') module.exports = { HIVE_X, CACTUS_X, TREE_X, OBJ_WORD, newFauna, plantBush, plantCarrots, pokeTarget, TOCK_CAKE, newRobot, kithById, living, kinRel, layEgg, crossGenome, focusFor, freshName, callOver, buyShelter, shelterAt, nearestShelter, VIEW, RIVER, LEVER_X, BOARD_X, MUSIC_X, BUSH_X, VENDOR_X, HILL_X, BOARD, newGadgets, sideOf, pressMusic, pressBoard, pressVendor, toggleLever, kickBall, notice, attending, ballPhysics, WANTS, SPOTS, content, setWants, ruleWants, SCALE, gameParts, SUBJECTS, dayDigest, addBelief, applyNight, ruleNight, beliefPull, HOUR, DAY, W, GROUND, SHELTER_X, DOCK_X, PATCH_X, DRIVES, MEANINGS, FEEL_WORD, SHOP, FOOD, clamp, weatherAt, forecast, localParts, newWorld, newCreature, newGenome, step, catchUp, teach, tickle, scold, obey, gateSpeech, babble, speak, awaySummary, stageOf, inShelter, sitterOn, edible, wordFor, knows, log, moment, nid };
