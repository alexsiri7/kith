const S=require('../sim.js');
const tally={}, wantsDone={}; let fetched=0;
for(let k=0;k<10;k++){
  const w=S.newWorld(300+k,Date.now(),'Alex','Pip'); const gp=S.gameParts(w.simTime,6); w.simTime += ((10-gp.hour+24)%24)*S.HOUR/6;
  w.creature.hatchAt=w.simTime; S.step(w,1000); S.teach(w,'alex','you');S.teach(w,'alex','you');
  w.creature.rel.affection=0.4;
  S.setWants(w,[{what:'fetch',why:'Alex likes ball'},{what:'explore',where:'hill',why:'what there?'},{what:'dance',why:'happy'}]);
  for(let t=0;t<30*60*5;t++){ const ev=S.step(w,200,{present:true,hand:{x:400,y:300},live:true});
    for(const e of ev){ if(e.startsWith('want:')) wantsDone[e]=(wantsDone[e]||0)+1; if(e==='fetched') fetched++; }
    const a=w.creature.asleep?'sleep':(w.creature.act?(w.creature.act.kind==='want'?'want:'+w.creature.act.what:w.creature.act.kind):'none'); tally[a]=(tally[a]||0)+1;
    if(!w.creature.wants.length && S.content(w.creature)) S.ruleWants(w);
  }
}
const tot=Object.values(tally).reduce((a,b)=>a+b);
console.log(Object.fromEntries(Object.entries(tally).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,(v/tot*100).toFixed(0)+'%'])));
console.log('wants started',wantsDone,'fetched',fetched);
