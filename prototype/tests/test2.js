const S=require('../sim.js');
function away(label, hours, sitter){
  let deaths=0,causes={};
  for(let k=0;k<30;k++){ const now=Date.now(); const w=S.newWorld(500+k,now,'Alex','Pip'); w.creature.hatchAt=now;
    if(sitter) w.sitterUntil=now+hours*S.HOUR; w.offset=hours*S.HOUR; S.catchUp(w,now);
    if(!w.creature.alive){deaths++;causes[w.creature.cause]=(causes[w.creature.cause]||0)+1;} }
  console.log(label.padEnd(22),'deaths',deaths+'/30',JSON.stringify(causes));
}
away('8h alone (baby)',8); away('24h alone',24); away('3 days alone',72); away('3 days sitter',72,true); away('15 days sitter',360,true);
// live session: 40 real minutes present, tickle when approaching
const tally={}; let meals=0;
for(let k=0;k<10;k++){
  const now=Date.now(); const w=S.newWorld(900+k,now,'Alex','Pip'); w.creature.hatchAt=now; S.step(w,1000);
  w.creature.d.hunger=0.2;
  for(let t=0;t<40*60*5;t++){ // 200ms steps
    const ev=S.step(w,200,{present:true,hand:{x:400,y:300},live:true});
    if(ev.includes('ate')) meals++;
    const a=w.creature.asleep?'sleep':(w.creature.act?w.creature.act.kind:'none'); tally[a]=(tally[a]||0)+1;
    if(t%100==0 && w.creature.act && w.creature.act.kind==='approach') S.tickle(w);
  }
  if(k==0) console.log('aff hunger',JSON.stringify(w.creature.aff.hunger), '\naff lonely', JSON.stringify(w.creature.aff.lonely));
}
const tot=Object.values(tally).reduce((a,b)=>a+b);
console.log('live 40min x10: time share', Object.fromEntries(Object.entries(tally).map(([k,v])=>[k,(v/tot*100).toFixed(0)+'%'])), 'meals/session', (meals/10).toFixed(1));
