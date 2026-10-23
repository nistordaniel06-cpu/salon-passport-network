import {availableSlots,defaultHours} from '../public/scheduling.js';
const key='salon-passport-preview-v1';
const initial=await (await fetch('./seed.json')).json();
const codes=await (await fetch('./codes.json')).json();
let db;try{db=JSON.parse(localStorage.getItem(key));}catch{}if(!db){db=initial;db.visits.find(v=>v.status==='booked').slot=new Date().toISOString();}
const role=['client','pro','admin'].includes(new URLSearchParams(location.search).get('role'))?new URLSearchParams(location.search).get('role'):'client';
saveInitial();
function saveInitial(){localStorage.setItem(key,JSON.stringify(db));}
db.hours ||= {};db.blocks ||= [];
const user=()=>db.users.find(u=>u.role===role);
const save=()=>localStorage.setItem(key,JSON.stringify(db));
const fail=m=>{throw Error(m);};
const balance=id=>db.ledger.filter(l=>l.salon_id===id).reduce((n,l)=>n+l.points,0);
const metrics=visits=>({completed:visits.filter(v=>v.status==='completed').length,returned:visits.filter(v=>v.status==='completed').length>1?1:0,rebooked:visits.some(v=>v.status==='booked')?1:0,revenue:visits.filter(v=>v.status==='completed').reduce((n,v)=>n+v.price,0)});
function snapshot(){const visits=role==='pro'?db.visits.filter(v=>v.staff_id===user().id):db.visits;return {...db,schedule:db.hours[user().id]||defaultHours(),blocks:db.blocks.filter(b=>b.staff_id===user().id),user:user(),visits,salons:role==='pro'?db.salons.filter(s=>s.staff.some(u=>u.id===user().id)):db.salons,balances:db.salons.map(s=>({salon_id:s.id,points:balance(s.id)})),metrics:metrics(visits)};}
document.querySelector('#reset-demo').onclick=()=>{localStorage.removeItem(key);location.reload();};
export async function previewApi(path,b){
 if(path==='/config')return {demo:true,demoPassword:'Passport-Demo-2026!'};
 if(path==='/state')return structuredClone(snapshot());
 if(path==='/auth/logout')return {ok:true};
 if(path.startsWith('/auth/')){if(path==='/auth/register')fail('Demo fără conturi reale. Folosește butonul contului demo.');if(b.email!==user().email||b.password!=='Passport-Demo-2026!')fail('Folosește contul demo al acestui spațiu.');return {ok:true};}
 if(path.startsWith('/slots')){const q=new URLSearchParams(path.split('?')[1]),staff=Number(q.get('staff')),service=db.salons.flatMap(s=>s.services).find(s=>s.id===Number(q.get('service')));return availableSlots({date:q.get('date'),duration:service?.duration||60,hours:db.hours[staff]||defaultHours(),visits:db.visits.filter(v=>v.staff_id===staff),blocks:db.blocks.filter(b=>b.staff_id===staff)});}
 if(path==='/schedule'){if(role!=='pro'||b.staffId!==user().id)fail('Acces nepermis.');if(!b.rules.every(h=>h.start<h.end&&h.breakStart<=h.breakEnd&&(h.breakStart===h.breakEnd||(h.breakStart>=h.start&&h.breakEnd<=h.end))))fail('Verifică orele și pauzele.');db.hours[b.staffId]=b.rules;save();return {ok:true};}
 if(path==='/timeoff'){if(role!=='pro'||b.staffId!==user().id)fail('Acces nepermis.');const start=Date.parse(b.start),end=Date.parse(b.end);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end<Date.now())fail('Interval invalid.');if(db.visits.some(v=>v.staff_id===b.staffId&&['booked','checked_in'].includes(v.status)&&start<Date.parse(v.slot)+(v.duration||60)*60000&&end>Date.parse(v.slot)))fail('Există programări în acest interval.');db.blocks.push({...b,staff_id:b.staffId,id:Date.now()});save();return {ok:true};}
 if(path==='/timeoff/remove'){const row=db.blocks.find(x=>x.id===b.id);if(role!=='pro'||row?.staff_id!==user().id)fail('Acces nepermis.');db.blocks=db.blocks.filter(x=>x.id!==b.id);save();return {ok:true};}

 const visit=()=>db.visits.find(v=>v.id===b.visitId)||fail('Vizită inexistentă.');
 if(path==='/book'){const salon=db.salons.find(s=>s.services.some(v=>v.id===b.serviceId));const service=salon?.services.find(s=>s.id===b.serviceId),staff=salon?.staff.find(s=>s.id===b.staffId);if(!service||!staff)fail('Alege serviciul și specialistul.');if(db.visits.some(v=>v.staff_id===b.staffId&&v.status!=='cancelled'&&Date.parse(b.slot)<Date.parse(v.slot)+(v.duration||60)*60000&&Date.parse(b.slot)+(service.duration||60)*60000>Date.parse(v.slot)))fail('Interval ocupat.');db.visits.unshift({id:Date.now(),client_id:1,client_name:db.users[0].name,salon_id:salon.id,salon_name:salon.name,staff_id:staff.id,staff_name:staff.name,service_id:service.id,service_name:service.name,price:service.price,duration:service.duration||60,slot:b.slot,status:'booked'});}
 else if(path==='/cancel'){if(visit().status!=='booked')fail('Vizita nu poate fi anulată.');visit().status='cancelled';}
 else if(path==='/checkin/token'||path==='/rewards/claim'){const kind=path.includes('checkin')?'visit':'reward';if(kind==='visit'&&visit().status!=='booked')fail('Vizita nu mai așteaptă check-in.');if(kind==='reward'){const reward=db.salons.flatMap(s=>s.rewards).find(r=>r.id===b.rewardId);if(!reward||balance(reward.salon_id)<reward.cost)fail('Puncte insuficiente.');}const expires=Date.now()+300000;db.tokens[kind]={...b,expires};save();return {...codes[kind],expires};}
 else if(path==='/checkin/scan'||path==='/rewards/redeem'){const kind=path.includes('checkin')?'visit':'reward',t=db.tokens[kind];if(role!=='pro'||!t||t.expires<Date.now()||b.token!==codes[kind].payload.split(':')[2])fail('Cod expirat sau deja utilizat. Generează-l în Client.');if(kind==='visit'){const v=db.visits.find(v=>v.id===t.visitId);if(v.staff_id!==user().id||v.status!=='booked')fail('Vizită indisponibilă.');v.status='checked_in';}else{const reward=db.salons.flatMap(s=>s.rewards).find(r=>r.id===t.rewardId);if(balance(reward.salon_id)<reward.cost)fail('Puncte insuficiente.');db.ledger.unshift({salon_id:reward.salon_id,points:-reward.cost,reason:reward.name});}delete db.tokens[kind];}
 else if(path==='/complete'){const v=visit();if(role!=='pro'||v.staff_id!==user().id||v.status!=='checked_in')fail('Confirmă întâi sosirea prin QR.');v.status='completed';v.completed_at=new Date().toISOString();db.ledger.unshift({salon_id:v.salon_id,points:100,reason:'Vizită demo finalizată'});}
 else if(path==='/looks'||path==='/reviews'){const v=visit();if(v.status!=='completed')fail('Este necesară o vizită finalizată.');if(path==='/looks'&&b.image&&!b.consent)fail('Confirmă acordul pentru fotografie.');const list=path==='/looks'?db.looks:db.reviews;const old=list.findIndex(x=>x.visit_id===b.visitId);if(old>=0)list.splice(old,1);list.unshift({...b,visit_id:b.visitId});}
 else if(path.startsWith('/admin/')){if(role!=='admin')fail('Acces admin necesar.');const kind=path.split('/').pop(),id=Date.now();if(kind==='salons')db.salons.push({...b,id,services:[],staff:[],rewards:[]});else{const s=db.salons.find(s=>s.id===b.salonId);if(!s)fail('Alege un salon.');if(kind==='staff'){s.staff.push({id,name:b.name});db.users.push({id,name:b.name,email:b.email,role:'pro'});}else s[kind].push({...b,id,salon_id:s.id});}}
 else fail('Acțiune indisponibilă în demo.');
 db.audit.unshift({action:path,actor_name:user().name,entity:b.visitId||'demo',created_at:new Date().toLocaleString('ro-RO')});save();return {ok:true};
}
