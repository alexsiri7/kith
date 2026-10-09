const S=require('../sim.js');
let fell=0, avoided=0, vend=0, music=0, falls=[], learnedRiver=0;
for(let k=0;k<30;k++){
  const now=Date.now(); const w=S.newWorld(700+k,now,'Alex','Pip'); w.creature.hatchAt=now;
  w.offset=2*S.DAY; S.catchUp(w,now);
  const ev=w.log; const f=ev.filter(e=>e.type==='fell-in').length; fell+=f; avoided+=ev.filter(e=>e.type==='avoided').length; vend+=ev.filter(e=>e.type==='vended').length; music+=ev.filter(e=>e.type==='music').length;
  falls.push(f+'/'+ev.filter(e=>e.type==='avoided').length+(w.creature.alive?'':'†')); if(w.creature.riverFear>0.5) learnedRiver++;
}
console.log('2 days alone: falls/avoids per creature', falls.join(' '));
console.log('total vend',vend,'music',music,'riverFear>0.5:',learnedRiver+'/30');
