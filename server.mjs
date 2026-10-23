import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { openStore, Fault, DEMO_PASSWORD } from './lib/store.mjs';

const root=dirname(fileURLToPath(import.meta.url));
export function createApp({database=':memory:',demo=false,origin='',adminEmail='',adminPassword=''}={}) {
 const store=openStore(database); if(demo)store.seedDemo();else if(adminEmail&&adminPassword)store.bootstrapAdmin(adminEmail,adminPassword);
 const rate=new Map();
 const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  res.setHeader('Permissions-Policy','camera=(self), microphone=(), geolocation=()');
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  try {
   const url=new URL(req.url,'http://localhost');const path=url.pathname;
   const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(c=>c.trim().split('=')));
   const user=store.getSession(cookies.sp_session);
   if(req.method==='GET' && !path.startsWith('/api/')) {
     const file={'/':'index.html','/client':'index.html','/pro':'index.html','/admin':'index.html','/join':'index.html','/scheduling.js':'scheduling.js','/app.js':'app.js','/style.css':'style.css','/icon.svg':'icon.svg','/manifest.webmanifest':'manifest.webmanifest'}[path];
     if(!file)throw new Fault('Pagina nu există.',404);
     const type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.webmanifest')?'application/manifest+json':'text/html';
     res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(readFileSync(join(root,'public',file)));return;
   }
   if(!['GET','POST'].includes(req.method))throw new Fault('Metodă nepermisă.',405);
   let b={};
   if(req.method==='POST') {
    const expected=origin||`http://${req.headers.host}`;
    if(req.headers.origin!==expected)throw new Fault('Origine neautorizată.',403);
    if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new Fault('Este necesar JSON.',415);
    let data='';for await(const chunk of req) {data+=chunk; if(Buffer.byteLength(data)>800000)throw new Fault('Cerere prea mare.',413);}
    try{b=JSON.parse(data||'{}');}catch{throw new Fault('JSON invalid.');}
    if(!b||Array.isArray(b)||typeof b!=='object')throw new Fault('Cerere invalidă.');
   }
   if(path==='/api/config'&&req.method==='GET')return send(200,{demo,timezone:'Europe/Bucharest',demoPassword:demo?DEMO_PASSWORD:undefined});
   if(path==='/api/salons'&&req.method==='GET')return send(200,store.catalogue());
   if(path==='/api/auth/login'||path==='/api/auth/register') {
    if(req.method!=='POST')throw new Fault('Metodă nepermisă.',405);
    // Bound the map; proxy headers are intentionally not trusted.
    if(rate.size>5000)rate.clear();const key=req.socket.remoteAddress;const now=Date.now();let r=rate.get(key);if(!r||r.until<now)r={count:0,until:now+15*60000};r.count++;rate.set(key,r);if(r.count>30)throw new Fault('Prea multe încercări. Revino în 15 minute.',429);
    const u=path.endsWith('register')?store.createUser(b.name,b.email,b.password):store.login(b.email,b.password);
    const keyToken=store.session(u);res.setHeader('Set-Cookie',`sp_session=${keyToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${origin.startsWith('https:')?'; Secure':''}`);return send(200,{user:u});
   }
   if(path==='/api/auth/logout'&&req.method==='POST'){store.logout(cookies.sp_session);res.setHeader('Set-Cookie','sp_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return send(200,{ok:true});}
   if(!user)throw new Fault('Autentifică-te pentru a continua.',401);
   if(path==='/api/state'&&req.method==='GET')return send(200,store.state(user));
   if(path==='/api/pro/slots'&&req.method==='GET')return send(200,store.proSlots(user,{visitId:Number(url.searchParams.get('visit')),serviceId:Number(url.searchParams.get('service')),date:url.searchParams.get('date')}));
   if(path==='/api/slots'&&req.method==='GET')return send(200,store.slots(Number(url.searchParams.get('staff')),url.searchParams.get('date'),Number(url.searchParams.get('service'))||undefined));
   if(req.method!=='POST')throw new Fault('Ruta nu există.',404);
   let result;
   switch(path) {
    case '/api/pro/visits/edit':result=store.editVisit(user,b);break;
    case '/api/pro/visits/cancel':result=store.proCancel(user,b);break;
    case '/api/schedule':result=store.setHours(user,b);break;
    case '/api/timeoff':result=store.addTimeOff(user,b);break;
    case '/api/timeoff/remove':result=store.removeTimeOff(user,Number(b.id));break;
    case '/api/book': result=store.book(user,b); break;
    case '/api/cancel': result=store.cancel(user,Number(b.visitId)); break;
    case '/api/checkin/token': result=store.checkinToken(user,Number(b.visitId));break;
    case '/api/checkin/scan':result=store.checkin(user,b.token);break;
    case '/api/complete':result=store.complete(user,Number(b.visitId),b.note);break;
    case '/api/looks':result=store.saveLook(user,b);break;
    case '/api/reviews':result=store.review(user,b);break;
    case '/api/rewards/claim':result=store.claim(user,Number(b.rewardId));break;
    case '/api/rewards/redeem':result=store.redeem(user,b.token);break;
    case '/api/admin/salons':result=store.addSalon(user,b);break;
    case '/api/admin/staff':result=store.addStaff(user,b);break;
    case '/api/admin/services':result=store.addService(user,b);break;
    case '/api/admin/rewards':result=store.addReward(user,b);break;
    default:throw new Fault('Ruta nu există.',404);
   }
   if(result.token) { const kind=path.includes('rewards')?'reward':'visit';result.payload=`SP1:${kind}:${result.token}`;result.qr=await QRCode.toDataURL(result.payload,{errorCorrectionLevel:'M',margin:4,width:256});}
   send(200,result);
  }catch(e){if(!(e instanceof Fault))console.error(e.message);send(e.status||500,{error:e.status?e.message:'Operațiunea nu a reușit. Încearcă din nou.'});}
 });
 return {server,store};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const demo=process.env.DEMO_MODE==='1';const database=process.env.DATABASE_PATH||join(root,'data',demo?'demo.sqlite':'passport.sqlite');mkdirSync(dirname(database),{recursive:true});
 const origin=process.env.APP_ORIGIN||'';
 if(process.env.NODE_ENV==='production'&&!origin.startsWith('https://'))throw new Error('APP_ORIGIN HTTPS este obligatoriu în producție.');
 if(process.env.NODE_ENV==='production'&&demo)throw new Error('DEMO_MODE nu poate fi activ în producție.');
 const {server,store}=createApp({database,demo,origin,adminEmail:process.env.ADMIN_EMAIL,adminPassword:process.env.ADMIN_PASSWORD});
 server.listen(Number(process.env.PORT||4173),process.env.HOST||'127.0.0.1',()=>console.log(`Salon Passport listening on ${process.env.PORT||4173}; demo=${demo}`));
 process.on('SIGTERM',()=>server.close(()=>{store.close();process.exit(0);}));
}
