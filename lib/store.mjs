import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export class Fault extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export const token = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('hex');
export const passwordHash = password => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; };
export function passwordOK(password, stored) { const [salt, hash] = stored.split(':'); return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex')); }
const assert = (ok, message, status) => { if (!ok) throw new Fault(message, status); };
const text = (value, min = 1, max = 200) => { assert(typeof value === 'string' && value.trim().length >= min && value.trim().length <= max, 'Verifică lungimea câmpurilor.'); return value.trim(); };
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });
export const DEMO_PASSWORD = 'Passport-Demo-2026!';

export function openStore(filename = ':memory:') {
 const db = new DatabaseSync(filename);
 db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('client','pro','admin')));
 CREATE TABLE IF NOT EXISTS salons(id INTEGER PRIMARY KEY,name TEXT NOT NULL,city TEXT NOT NULL,address TEXT NOT NULL,description TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS staff(user_id INTEGER NOT NULL REFERENCES users(id),salon_id INTEGER NOT NULL REFERENCES salons(id),PRIMARY KEY(user_id,salon_id));
 CREATE TABLE IF NOT EXISTS services(id INTEGER PRIMARY KEY,salon_id INTEGER NOT NULL REFERENCES salons(id),name TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>0),duration INTEGER NOT NULL DEFAULT 60);
 CREATE TABLE IF NOT EXISTS visits(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES users(id),salon_id INTEGER NOT NULL REFERENCES salons(id),service_id INTEGER NOT NULL REFERENCES services(id),staff_id INTEGER NOT NULL REFERENCES users(id),slot TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('booked','checked_in','completed','cancelled')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT,private_note TEXT NOT NULL DEFAULT '');
 CREATE UNIQUE INDEX IF NOT EXISTS occupied_slot ON visits(staff_id,slot) WHERE status!='cancelled';
 CREATE TABLE IF NOT EXISTS checkins(hash TEXT PRIMARY KEY,visit_id INTEGER NOT NULL REFERENCES visits(id),expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS ledger(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES users(id),salon_id INTEGER NOT NULL REFERENCES salons(id),visit_id INTEGER UNIQUE REFERENCES visits(id),points INTEGER NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS rewards(id INTEGER PRIMARY KEY,salon_id INTEGER NOT NULL REFERENCES salons(id),name TEXT NOT NULL,cost INTEGER NOT NULL CHECK(cost>0),description TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS claims(id INTEGER PRIMARY KEY,client_id INTEGER NOT NULL REFERENCES users(id),reward_id INTEGER NOT NULL REFERENCES rewards(id),hash TEXT UNIQUE NOT NULL,expires INTEGER NOT NULL,redeemed INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS looks(id INTEGER PRIMARY KEY,visit_id INTEGER UNIQUE NOT NULL REFERENCES visits(id),client_id INTEGER NOT NULL REFERENCES users(id),title TEXT NOT NULL,preferences TEXT NOT NULL,image TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS reviews(visit_id INTEGER PRIMARY KEY REFERENCES visits(id),client_id INTEGER NOT NULL REFERENCES users(id),rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),comment TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor INTEGER REFERENCES users(id),action TEXT NOT NULL,entity TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 `);
 const one = (sql, ...args) => db.prepare(sql).get(...args);
 const all = (sql, ...args) => db.prepare(sql).all(...args);
 const run = (sql, ...args) => db.prepare(sql).run(...args);
 const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch(e) { db.exec('ROLLBACK'); throw e; } };
 const audit = (u, action, id) => run('INSERT INTO audit(actor,action,entity) VALUES(?,?,?)',u.id,action,String(id));
 const role = (u, expected) => assert(u && u.role === expected, 'Nu ai acces la această acțiune.', 403);
 const member = (u, salon) => { role(u,'pro'); assert(one('SELECT 1 FROM staff WHERE user_id=? AND salon_id=?',u.id,salon), 'Salon neautorizat.',403); };
 const ownVisit = (u, id) => { role(u,'client'); const v = one('SELECT * FROM visits WHERE id=? AND client_id=?',id,u.id); assert(v,'Vizita nu a fost găsită.',404); return v; };
 const balance = (client,salon) => one('SELECT COALESCE(SUM(points),0) AS total FROM ledger WHERE client_id=? AND salon_id=?',client,salon).total;
 function createUser(name,email,password,kind='client') {
   name=text(name,2,80); email=text(email,5,150).toLowerCase(); assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Introdu o adresă de email validă.');
   assert(typeof password==='string' && password.length>=12 && password.length<=128,'Parola trebuie să aibă între 12 și 128 de caractere.');
   assert(!one('SELECT id FROM users WHERE email=?',email),'Contul nu poate fi creat cu această adresă.',409);
   const id=Number(run('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)',name,email,passwordHash(password),kind).lastInsertRowid);
   return publicUser(one('SELECT * FROM users WHERE id=?',id));
 }
 function bootstrapAdmin(email,password) { if(!one("SELECT 1 FROM users WHERE role='admin'")) return createUser('Administrator',email,password,'admin'); }
 function session(u) { const key=token(); run('INSERT INTO sessions VALUES(?,?,?)',digest(key),u.id,Date.now()+7*86400000); return key; }
 const getSession = key => key ? one('SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?',digest(key),Date.now()) : null;
 function login(email,password) {
   assert(typeof email==='string' && typeof password==='string' && password.length<=128,'Date de autentificare invalide.',401);
   const u=one('SELECT * FROM users WHERE email=?',email.trim().toLowerCase());
   const fallback='00000000000000000000000000000000:'+ '00'.repeat(64);
   assert(passwordOK(password,u?.password||fallback) && u,'Email sau parolă incorectă.',401); return publicUser(u);
 }
 function catalogue() { return all('SELECT * FROM salons').map(s=>({...s,services:all('SELECT * FROM services WHERE salon_id=?',s.id),staff:all('SELECT u.id,u.name FROM staff st JOIN users u ON u.id=st.user_id WHERE st.salon_id=?',s.id),rewards:all('SELECT * FROM rewards WHERE salon_id=?',s.id)})); }
 function validateDate(date) { assert(typeof date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date)), 'Dată invalidă.'); }
 function slots(staffId,date) {
   validateDate(date); assert(one('SELECT 1 FROM staff WHERE user_id=?',staffId),'Specialist inexistent.',404);
   // All pilot slots use Europe/Bucharest local time, converted with Intl for DST.
   const result=[];
   for(let hour=9;hour<18;hour++) {
     let utc=new Date(`${date}T${String(hour).padStart(2,'0')}:00:00Z`);
     const localHour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Bucharest',hour:'2-digit',hourCycle:'h23'}).format(utc));
     utc=new Date(utc.getTime()-(localHour-hour)*3600000);
     const slot=utc.toISOString();
     if(utc.getTime()>Date.now() && utc.getTime()<Date.now()+60*86400000 && !one("SELECT 1 FROM visits WHERE staff_id=? AND slot=? AND status!='cancelled'",staffId,slot)) result.push(slot);
   }
   return result;
 }
 function book(u,b) { role(u,'client'); return tx(()=>{
   const service=one('SELECT * FROM services WHERE id=?',Number(b.serviceId)); assert(service,'Serviciu invalid.');
   assert(one('SELECT 1 FROM staff WHERE user_id=? AND salon_id=?',Number(b.staffId),service.salon_id),'Specialistul nu aparține salonului.');
   assert(typeof b.slot==='string' && !isNaN(Date.parse(b.slot)),'Interval invalid.');
   const slot=new Date(b.slot).toISOString();
   const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(slot));
   assert(slots(Number(b.staffId),date).includes(slot),'Intervalul nu mai este disponibil.',409);
   const id=Number(run("INSERT INTO visits(client_id,salon_id,service_id,staff_id,slot,status) VALUES(?,?,?,?,?,'booked')",u.id,service.salon_id,service.id,Number(b.staffId),slot).lastInsertRowid); audit(u,'booking.created',id); return {id};
 }); }
 function cancel(u,id) { return tx(()=>{const v=ownVisit(u,id); assert(v.status==='booked','Poți anula doar o programare neîncepută.'); run("UPDATE visits SET status='cancelled' WHERE id=?",id); run('DELETE FROM checkins WHERE visit_id=?',id); audit(u,'booking.cancelled',id); return {ok:true}; }); }
 function checkinToken(u,id) { return tx(()=>{const v=ownVisit(u,id); assert(v.status==='booked','QR-ul este disponibil înainte de check-in.'); run('DELETE FROM checkins WHERE visit_id=?',id); const key=token(); const expires=Date.now()+5*60000; run('INSERT INTO checkins(hash,visit_id,expires) VALUES(?,?,?)',digest(key),id,expires); return {token:key,expires};}); }
 function checkin(u,key) { role(u,'pro'); return tx(()=>{
   const c=one('SELECT * FROM checkins WHERE hash=?',digest(text(key,30,100))); assert(c && !c.used && c.expires>Date.now(),'Cod expirat sau deja folosit.',409);
   const v=one('SELECT * FROM visits WHERE id=?',c.visit_id); member(u,v.salon_id); assert(v.staff_id===u.id,'Doar specialistul rezervat poate confirma sosirea.',403); assert(v.status==='booked','Vizita nu mai poate fi începută.',409);
   assert(Math.abs(Date.parse(v.slot)-Date.now())<=2*3600000,'Check-in disponibil cu cel mult 2 ore înainte sau după programare.');
   run('UPDATE checkins SET used=1 WHERE hash=?',c.hash);run("UPDATE visits SET status='checked_in' WHERE id=?",v.id);audit(u,'visit.checked_in',v.id); return {ok:true,visitId:v.id};
 }); }
 function complete(u,id,note='') { return tx(()=>{
   const v=one('SELECT * FROM visits WHERE id=?',id); assert(v,'Vizită inexistentă.',404); member(u,v.salon_id); assert(v.staff_id===u.id,'Doar specialistul rezervat poate finaliza.',403);
   if(v.status==='completed') return {ok:true,alreadyCompleted:true};
   assert(v.status==='checked_in','Confirmă sosirea prin QR înainte de finalizare.');
   note=typeof note==='string'?note.trim():'';assert(note.length<=1000,'Nota este prea lungă.');
   run("UPDATE visits SET status='completed',completed_at=?,private_note=? WHERE id=?",new Date().toISOString(),note,id);
   run("INSERT INTO ledger(client_id,salon_id,visit_id,points,reason) VALUES(?,?,?,100,'Vizită finalizată')",v.client_id,v.salon_id,id); audit(u,'visit.completed',id);return {ok:true};
 }); }
 function saveLook(u,b) {
   const v=ownVisit(u,Number(b.visitId));assert(v.status==='completed','Salvează un look după finalizarea vizitei.');
   const title=text(b.title,2,80),preferences=text(b.preferences,0,600); let image=b.image||'';
   assert(typeof image==='string' && image.length<700000,'Fotografia trebuie să fie mai mică de 500 KB.');
   if(image) {assert(b.consent===true,'Confirmă acordul pentru salvarea fotografiei.');assert(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image),'Folosește o fotografie JPEG, PNG sau WebP.'); const bytes=Buffer.from(image.split(',')[1],'base64'); const valid=bytes.subarray(0,3).equals(Buffer.from([255,216,255])) || bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || (bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP'); assert(valid,'Fotografie invalidă.');}
   run('INSERT INTO looks(visit_id,client_id,title,preferences,image) VALUES(?,?,?,?,?) ON CONFLICT(visit_id) DO UPDATE SET title=excluded.title,preferences=excluded.preferences,image=excluded.image',v.id,u.id,title,preferences,image);audit(u,'look.saved',v.id);return {ok:true};
 }
 function review(u,b) { const v=ownVisit(u,Number(b.visitId)); assert(v.status==='completed','Recenzia necesită o vizită finalizată.');assert(Number.isInteger(b.rating)&&b.rating>=1&&b.rating<=5,'Alege între 1 și 5 stele.');run('INSERT INTO reviews VALUES(?,?,?,?) ON CONFLICT(visit_id) DO UPDATE SET rating=excluded.rating,comment=excluded.comment',v.id,u.id,b.rating,text(b.comment,0,600));return {ok:true}; }
 function claim(u,id) { role(u,'client');return tx(()=>{const r=one('SELECT * FROM rewards WHERE id=?',id); assert(r,'Recompensă inexistentă.',404);assert(balance(u.id,r.salon_id)>=r.cost,'Nu ai suficiente puncte în acest salon.'); run('DELETE FROM claims WHERE client_id=? AND reward_id=? AND redeemed=0',u.id,id); const key=token(),expires=Date.now()+10*60000;run('INSERT INTO claims(client_id,reward_id,hash,expires) VALUES(?,?,?,?)',u.id,id,digest(key),expires);return {token:key,expires};}); }
 function redeem(u,key) {role(u,'pro');return tx(()=>{const c=one('SELECT c.*,r.salon_id,r.cost,r.name FROM claims c JOIN rewards r ON r.id=c.reward_id WHERE c.hash=?',digest(text(key,30,100)));assert(c&&!c.redeemed&&c.expires>Date.now(),'Beneficiu expirat sau deja utilizat.',409);member(u,c.salon_id);assert(balance(c.client_id,c.salon_id)>=c.cost,'Sold insuficient.');run('UPDATE claims SET redeemed=1 WHERE id=?',c.id);run('INSERT INTO ledger(client_id,salon_id,points,reason) VALUES(?,?,?,?)',c.client_id,c.salon_id,-c.cost,c.name);audit(u,'reward.redeemed',c.id);return {ok:true};});}
 const visitSelect=`SELECT v.id,v.client_id,v.salon_id,v.service_id,v.staff_id,v.slot,v.status,v.completed_at,s.name salon_name,sv.name service_name,sv.price,u.name staff_name,c.name client_name FROM visits v JOIN salons s ON s.id=v.salon_id JOIN services sv ON sv.id=v.service_id JOIN users u ON u.id=v.staff_id JOIN users c ON c.id=v.client_id`;
 function state(u) {
   if(u.role==='client') return {user:u,salons:catalogue(),visits:all(visitSelect+' WHERE v.client_id=? ORDER BY v.slot DESC',u.id),looks:all('SELECT * FROM looks WHERE client_id=? ORDER BY id DESC',u.id),balances:all('SELECT salon_id,SUM(points) points FROM ledger WHERE client_id=? GROUP BY salon_id',u.id),ledger:all('SELECT salon_id,points,reason,created_at FROM ledger WHERE client_id=? ORDER BY id DESC LIMIT 50',u.id),reviews:all('SELECT * FROM reviews WHERE client_id=?',u.id)};
   if(u.role==='pro') {const visits=all(visitSelect+' WHERE v.staff_id=? ORDER BY v.slot DESC',u.id);const salonIds=all('SELECT salon_id FROM staff WHERE user_id=?',u.id).map(s=>s.salon_id);return {user:u,salons:catalogue().filter(s=>salonIds.includes(s.id)),visits,metrics:metrics(visits),notes:all('SELECT id,private_note FROM visits WHERE staff_id=?',u.id)};}
   return {user:u,salons:catalogue(),users:all('SELECT id,name,email,role FROM users ORDER BY id DESC'),audit:all('SELECT a.*,u.name actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor ORDER BY a.id DESC LIMIT 50'),metrics:metrics(all(visitSelect))};
 }
 function metrics(visits) {const completed=visits.filter(v=>v.status==='completed');const clients=new Set(completed.map(v=>v.client_id));const returned=[...clients].filter(id=>completed.filter(v=>v.client_id===id).length>1).length;const rebooked=completed.filter(v=>visits.some(next=>next.client_id===v.client_id&&next.salon_id===v.salon_id&&next.slot>v.slot&&['booked','checked_in'].includes(next.status))).length;return {completed:completed.length,clients:clients.size,returned,rebooked,revenue:completed.reduce((s,v)=>s+v.price,0)};}
 function addSalon(u,b) {role(u,'admin');const id=Number(run('INSERT INTO salons(name,city,address,description) VALUES(?,?,?,?)',text(b.name,2,100),text(b.city,2,100),text(b.address,2,200),text(b.description,0,400)).lastInsertRowid);audit(u,'salon.created',id);return {id};}
 function addStaff(u,b) {role(u,'admin');assert(one('SELECT 1 FROM salons WHERE id=?',Number(b.salonId)),'Salon invalid.');return tx(()=>{const pro=createUser(b.name,b.email,b.password,'pro');run('INSERT INTO staff VALUES(?,?)',pro.id,Number(b.salonId));audit(u,'staff.created',pro.id);return {id:pro.id};});}
 function addService(u,b) {role(u,'admin');assert(one('SELECT 1 FROM salons WHERE id=?',Number(b.salonId)),'Salon invalid.');assert(Number.isInteger(b.price)&&b.price>0&&b.price<=100000,'Preț invalid.');const id=Number(run('INSERT INTO services(salon_id,name,price) VALUES(?,?,?)',Number(b.salonId),text(b.name,2,100),b.price).lastInsertRowid);audit(u,'service.created',id);return {id};}
 function addReward(u,b) {role(u,'admin');assert(one('SELECT 1 FROM salons WHERE id=?',Number(b.salonId)),'Salon invalid.');assert(Number.isInteger(b.cost)&&b.cost>=100&&b.cost<=100000,'Cost invalid.');const id=Number(run('INSERT INTO rewards(salon_id,name,cost,description) VALUES(?,?,?,?)',Number(b.salonId),text(b.name,2,100),b.cost,text(b.description,2,300)).lastInsertRowid);audit(u,'reward.created',id);return {id};}
 function seedDemo() {if(one('SELECT 1 FROM users LIMIT 1'))return;tx(()=>{
   const client=createUser('Alex Dumitru','client@demo.local',DEMO_PASSWORD);const pro=createUser('Andrei Pop','pro@demo.local',DEMO_PASSWORD,'pro');const pro2=createUser('Maria Stan','pro2@demo.local',DEMO_PASSWORD,'pro');createUser('Administrator demo','admin@demo.local',DEMO_PASSWORD,'admin');
   run("INSERT INTO salons VALUES(1,'4MEN • Salon pilot','București','Locație demonstrativă · Lujerului','Look-ul tău. Specialistul tău. Un ritual care merită repetat.')");run("INSERT INTO salons VALUES(2,'Studio Nord • Demo','București','Locație demonstrativă · Nord','Un al doilea salon pentru testarea separării datelor.')");
   run('INSERT INTO staff VALUES(?,1)',pro.id);run('INSERT INTO staff VALUES(?,2)',pro2.id);
   run("INSERT INTO services VALUES(1,1,'Tuns & styling',9000,60),(2,1,'Tuns & barbă',13000,60),(3,2,'Tuns & styling',10000,60)");run("INSERT INTO rewards VALUES(1,1,'Ritual de îngrijire',300,'Un serviciu suplimentar la o vizită plătită. Valabil doar în salonul emitent.'),(2,2,'Styling premium',300,'Un styling suplimentar la o vizită plătită.')");
   for(let i=0;i<2;i++) {const date=new Date(Date.now()-(42-i*21)*86400000).toISOString();const id=Number(run("INSERT INTO visits(client_id,salon_id,service_id,staff_id,slot,status,completed_at) VALUES(?,1,1,?,?,'completed',?)",client.id,pro.id,date,date).lastInsertRowid);run("INSERT INTO ledger(client_id,salon_id,visit_id,points,reason) VALUES(?,1,?,100,'Vizită demonstrativă finalizată')",client.id,id);}
   run("INSERT INTO looks(visit_id,client_id,title,preferences) VALUES(2,?,'Low fade & textură','Low fade, 4 cm sus, contur natural. Finisaj mat, fără produs lucios.')",client.id);
   // An actual current-time appointment permits QR checks immediately in demo mode.
   run("INSERT INTO visits(client_id,salon_id,service_id,staff_id,slot,status) VALUES(?,1,1,?,?,'booked')",client.id,pro.id,new Date().toISOString());
 });}
 return {db,close:()=>db.close(),createUser,bootstrapAdmin,session,getSession,login,logout:key=>run('DELETE FROM sessions WHERE hash=?',digest(key||'')),catalogue,slots,book,cancel,checkinToken,checkin,complete,saveLook,review,claim,redeem,state,addSalon,addStaff,addService,addReward,seedDemo};
}
