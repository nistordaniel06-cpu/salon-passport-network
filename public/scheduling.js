export function defaultHours(){return Array.from({length:7},(_,day)=>({day,start:540,end:1080,closed:day===0,breakStart:780,breakEnd:810}));}
export function localDate(value){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
export function availableSlots({date,duration=60,hours=defaultHours(),visits=[],blocks=[],now=Date.now()}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)!==date)return [];
 const day=new Date(`${date}T12:00:00Z`).getUTCDay(),rule=hours.find(h=>h.day===day);if(!rule||rule.closed)return [];
 const noon=new Date(`${date}T12:00:00Z`),hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Bucharest',hour:'2-digit',hourCycle:'h23'}).format(noon)),offset=hour-12;
 const stamp=minutes=>Date.parse(`${date}T00:00:00Z`)+(minutes-offset*60)*60000;
 const occupied=[...visits.filter(v=>v.status!=='cancelled').map(v=>[Date.parse(v.slot),Date.parse(v.slot)+(v.duration||60)*60000]),...blocks.map(b=>[Date.parse(b.start),Date.parse(b.end)])];
 if(rule.breakEnd>rule.breakStart)occupied.push([stamp(rule.breakStart),stamp(rule.breakEnd)]);
 const result=[];for(let m=rule.start;m+duration<=rule.end;m+=15){const start=stamp(m),end=start+duration*60000;if(start>now&&start<now+60*86400000&&!occupied.some(([a,b])=>start<b&&end>a))result.push(new Date(start).toISOString());}return result;
}
