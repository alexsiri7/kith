const S=require('../sim.js');
function run(label, n, days, coins){
  let deaths=0,total=0,spent=0; const cnt={};
  for(let k=0;k<20;k++){const now=Date.now();const w=S.newWorld(600+k,now,'A','Pip',n>1?'Moss':null);
    while(w.kith.length<n) w.kith.push(S.newCreature('K'+w.kith.length,now,S.newGenome(),300+w.kith.length*40));
    for(const c of w.kith)c.hatchAt=now; w.coins=coins;
    w.offset=days*S.DAY;S.catchUp(w,now);
    deaths+=w.kith.filter(c=>!c.alive&&c.gen===1).length; total+=n; spent+=w.tockSpent||0;
    for(const e of w.log) if(['stung','pricked','sick','honey','chased','warned','fell-in','tock-bought','tock-led','egg'].includes(e.type)) cnt[e.type]=(cnt[e.type]||0)+1;
    if(k===0&&n>1) console.log('  objVal', w.kith.map(c=>c.name+':'+JSON.stringify(Object.fromEntries(Object.entries(c.objVal).map(([a,b])=>[a,+b.toFixed(2)])))).join(' '));
  }
  console.log(label.padEnd(26),'deaths',deaths+'/'+total,'spent/world',(spent/20).toFixed(0), JSON.stringify(Object.fromEntries(Object.entries(cnt).map(([a,b])=>[a,+(b/20).toFixed(1)]))));
}
run('1 kith 24h, 0 coins',1,1,0); run('1 kith 3d, 0 coins',1,3,0); run('2 kith 3d, 100 coins',2,3,100); run('4 kith 3d, 100 coins',4,3,100);
