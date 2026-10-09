const S=require('../sim.js');
for (const coins of [0, 60, 300]) {
  let deaths=0, spent=0, broke=0;
  for(let k=0;k<30;k++){ const now=Date.now(); const w=S.newWorld(200+k,now,'A','Pip'); w.creature.hatchAt=now; w.coins=coins;
    w.offset=3*S.DAY; S.catchUp(w,now); if(!w.creature.alive) deaths++; spent+=w.tockSpent||0; broke+=w.log.filter(e=>e.type==='tock-broke').length?1:0; }
  console.log(`3 days away, ${coins} coins: deaths ${deaths}/30, avg spent ${(spent/30).toFixed(0)}, ran out ${broke}/30`);
}
