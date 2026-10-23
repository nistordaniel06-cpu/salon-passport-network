import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,DEMO_PASSWORD} from '../lib/store.mjs';
import {availableSlots,defaultHours} from '../public/scheduling.js';
const future=()=>{const d=new Date(Date.now()+86400000);while(d.getUTCDay()===0)d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
test('duration overlap, lunch, closure, blocking and cross-role schedule access',()=>{
 const s=openStore();try{s.seedDemo();const client=s.login('client@demo.local',DEMO_PASSWORD),pro=s.login('pro@demo.local',DEMO_PASSWORD),other=s.login('pro2@demo.local',DEMO_PASSWORD),admin=s.login('admin@demo.local',DEMO_PASSWORD);
 const service=s.addService(admin,{salonId:1,name:'Serviciu lung',price:10000,duration:90});const date=future(),slots=s.slots(pro.id,date,service.id);assert.ok(slots.length>0);const id=s.book(client,{serviceId:service.id,staffId:pro.id,slot:slots[0]}).id;
 assert.equal(s.db.prepare('SELECT duration FROM visits WHERE id=?').get(id).duration,90);assert.ok(!s.slots(pro.id,date,1).includes(new Date(Date.parse(slots[0])+30*60000).toISOString()));
 assert.throws(()=>s.addTimeOff(pro,{staffId:pro.id,start:slots[0],end:new Date(Date.parse(slots[0])+60000).toISOString()}));
 assert.throws(()=>s.setHours(other,{staffId:pro.id,rules:defaultHours()}));assert.throws(()=>s.setHours(client,{staffId:pro.id,rules:defaultHours()}));
 const rules=defaultHours();rules.forEach(r=>r.closed=true);s.setHours(pro,{staffId:pro.id,rules});assert.equal(s.slots(pro.id,date,1).length,0);assert.equal(s.state(pro).visits.find(v=>v.id===id).status,'booked');
 s.setHours(pro,{staffId:pro.id,rules:defaultHours()});const free=s.slots(pro.id,date,1).at(-1);s.addTimeOff(pro,{staffId:pro.id,start:free,end:new Date(Date.parse(free)+3600000).toISOString()});assert.ok(!s.slots(pro.id,date,1).includes(free));const block=s.state(pro).blocks[0];assert.throws(()=>s.removeTimeOff(other,block.id));s.removeTimeOff(pro,block.id);assert.ok(s.slots(pro.id,date,1).includes(free));
 }finally{s.close();}
});
test('Bucharest DST, lunch, end of day and exact boundaries',()=>{
 const hours=defaultHours();hours.forEach(h=>h.closed=false);
 const winter=availableSlots({date:'2026-11-02',hours,duration:90,now:Date.parse('2026-10-20')});assert.equal(new Date(winter[0]).getUTCHours(),7);assert.ok(!winter.includes('2026-11-02T10:00:00.000Z'));assert.equal(winter.at(-1),'2026-11-02T14:30:00.000Z');
 const summer=availableSlots({date:'2026-07-06',hours,now:Date.parse('2026-07-01')});assert.equal(new Date(summer[0]).getUTCHours(),6);
 assert.deepEqual(availableSlots({date:'2026-02-30',hours}),[]);
});
