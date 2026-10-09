const S=require('../sim.js');
// two kith, 6 real days alone with sitter, check eggs, social, robot
let eggs=0, deaths=0, hatched=0, sharedWords=0;
for(let k=0;k<10;k++){
  const now=Date.now(); const w=S.newWorld(90+k,now,'Alex','Pip','Moss'); for(const c of w.kith) c.hatchAt=now;
  w.sitterUntil=now+14*S.DAY;
  w.offset=7*S.DAY; S.catchUp(w,now);
  eggs+=w.log.filter(e=>e.type==='egg').length; deaths+=w.kith.filter(c=>!c.alive).length; hatched+=w.kith.filter(c=>c.gen>1&&c.stage!=='egg').length;
  if(k===0){ console.log(w.kith.map(c=>`${c.name} ${c.stage} alive=${c.alive} lex=${Object.keys(c.lex).join('/')} kin=${JSON.stringify(Object.values(c.kin).map(r=>+r.affection.toFixed(2)))} robot=${c.robotRel.affection.toFixed(2)}`).join('\n'));
    console.log(S.awaySummary(w, now).lines.slice(0,8).join(' | ')); }
}
console.log('eggs',eggs,'hatched kids',hatched,'deaths',deaths);
