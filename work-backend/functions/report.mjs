import {dayStart} from './model.mjs';
const zone='Europe/Rome';
const dateFmt=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
const dayKey=ms=>{const p=Object.fromEntries(dateFmt.formatToParts(ms).map(v=>[v.type,v.value]));return `${p.year}-${p.month}-${p.day}`};
export const currentMonth=now=>dayKey(now).slice(0,7);
export function monthBounds(month,now){
 if(typeof month!=='string'||!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)||month>currentMonth(now))return null;
 const [y,m]=month.split('-').map(Number),count=new Date(Date.UTC(y,m,0)).getUTCDate();
 const days=Array.from({length:count+1},(_,i)=>dayStart(Date.UTC(y,m-1,i+1,12)));
 return {start:days[0],end:days[count],days};
}
export function monthlyReport(month,now,sites,closed,open){
 const bounds=monthBounds(month,now);if(!bounds)throw new Error('Mese non valido');
 const ids=sites.map(s=>s.id),valid=(r,end)=>r&&ids.includes(r.siteId)&&Number.isSafeInteger(r.startMs)&&r.startMs>0&&Number.isSafeInteger(end)&&end>=r.startMs&&end<=now;
 const intervals=closed.map(r=>{if(!valid(r,r.endMs))throw new Error('Intervallo non valido');return {...r,ongoing:false}});
 if(open){if(!valid(open,now))throw new Error('Turno aperto non valido');intervals.push({siteId:open.siteId,startMs:open.startMs,endMs:now,ongoing:true})}
 intervals.sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs);
 for(let i=1;i<intervals.length;i++)if(intervals[i].startMs<intervals[i-1].endMs)throw new Error('Intervalli sovrapposti');
 const totals={site1:0,site2:0};let pendingMs=0,workedDays=0,flaggedDays=0;
 const days=bounds.days.slice(0,-1).map((start,i)=>{const end=bounds.days[i+1],parts=[],bySite={site1:0,site2:0};let pending=0;
  for(const r of intervals){const a=Math.max(start,r.startMs),b=Math.min(end,r.endMs);if(b<=a)continue;const duration=b-a;parts.push({siteId:r.siteId,startMs:a,endMs:b,carryIn:a>r.startMs,carryOut:b<r.endMs,ongoing:r.ongoing,long:r.endMs-r.startMs>16*3600000});if(r.ongoing)pending+=duration;else bySite[r.siteId]+=duration;}
  const total=bySite.site1+bySite.site2;totals.site1+=bySite.site1;totals.site2+=bySite.site2;pendingMs+=pending;if(total>0)workedDays++;if(parts.some(p=>p.ongoing||p.long))flaggedDays++;
  return {date:dayKey(start),startMs:start,endMs:end,bySite,totalMs:total,pendingMs:pending,parts,future:start>now};});
 return {month,now,sites:sites.map(({id,name})=>({id,name})),days,totals,totalMs:totals.site1+totals.site2,pendingMs,workedDays,flaggedDays};
}
