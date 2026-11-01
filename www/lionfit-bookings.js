// Lion Fit Beta 0.29.2 — prenotazioni Spark / account Firebase reali.
// Applica PRIMA le regole Firestore 0.29 collaudate in emulatore.
// Esegui un test online controllato prima di distribuire agli utenti.
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import {
  getFirestore,doc,getDoc,collection,query,where,documentId,onSnapshot,getDocs,
  writeBatch,runTransaction,serverTimestamp,Timestamp,setDoc
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const firebaseConfig={apiKey:'AIzaSyD5xFMM-kKy2-pYzcTk3MiFmXCTCe4EXEA',authDomain:'app-palestra-b0b9d.firebaseapp.com',projectId:'app-palestra-b0b9d',storageBucket:'app-palestra-b0b9d.firebasestorage.app',messagingSenderId:'412455135240',appId:'1:412455135240:web:d53bd1a83a400d5e6809bd'};
const app=getApps().length?getApp():initializeApp(firebaseConfig), auth=getAuth(app), db=getFirestore(app);
const K=['lun','mar','mer','gio','ven','sab','dom'];
const N=['Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato','Domenica'];
const DISC={fighter:['MMA','Boxe','K1','Karate tradizionale','Karate agonistico','BJJ','Grappling'],pesi:['Pesistica','Nuova scheda','Aggiornamento scheda','Valutazione']};
const COLORS=['#53c987','#6fb7ee','#eab36e','#cba1fb','#ff93ae','#77d7d2','#b4d875'];
// Questa build esegue scritture REALI quando e' collegata al progetto Firebase.
// Se vuoi predisporre solo l'interfaccia senza consentire scritture, rimetti false.
// Non distribuirla prima delle regole 0.29 e dei test reali degli accessi.
const SPARK_WRITES_ENABLED=true;
const SLOT_MS=1800000, DAY_MS=86400000;
const $=id=>document.getElementById(id),qsa=(s,r=document)=>[...r.querySelectorAll(s)];
const pad=n=>String(n).padStart(2,'0');
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mm=s=>Number(String(s).slice(0,2))*60+Number(String(s).slice(3,5));
const hh=n=>pad(Math.floor(n/60))+':'+pad(n%60);
const plusDays=(date,n)=>new Date(new Date(date+'T12:00:00Z').getTime()+n*DAY_MS).toISOString().slice(0,10);
const mondayIndex=date=>(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
const monthStart=m=>m+'-01';
function addMonth(m,n){const d=new Date(m+'-15T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,7)}
const monthEnd=m=>plusDays(monthStart(addMonth(m,1)),-1);
const fmtDate=d=>new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
const romeFmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function romeParts(ms){const p=Object.fromEntries(romeFmt.formatToParts(new Date(ms)).filter(v=>v.type!=='literal').map(v=>[v.type,v.value]));return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`,minute:Number(p.hour)*60+Number(p.minute)}}
const dateIT=()=>romeParts(Date.now()).date;
const stampMs=v=>v?.toMillis?.()??(v?.seconds?Number(v.seconds)*1000:0);
const slotId=(coachId,ms)=>`${coachId}_${ms}`;
const coachName=c=>c?.displayName||'Coach';
// Un coach mantiene sempre il suo colore anche quando arriva un nuovo collega.
function coachColor(id){
 const c=S.coaches.find(x=>x.id===id);
 const name=String(c?.displayName||'').toLocaleLowerCase('it');
 if(/\briccardo\b/u.test(name))return '#6fb7ee';
 if(/\bmarco\b/u.test(name))return '#53c987';
 let h=2166136261;for(const x of String(id||'')){h^=x.charCodeAt(0);h=Math.imul(h,16777619)}
 return COLORS[Math.abs(h>>>0)%COLORS.length];
}
const athleteNames=new Map();
async function loadAthleteNames(rows){
 if(S.role!=='admin'||!S.gym)return;
 const ids=[...new Set(rows.map(b=>b.athleteId).filter(Boolean))].filter(id=>!athleteNames.has(id));
 await Promise.all(ids.map(async id=>{
  athleteNames.set(id,'Atleta');
  try{
   const snap=await getDoc(doc(db,'users',id));
   if(snap.exists()){
    const p=snap.data();
    // I coach possono consultare solamente i profili della propria palestra.
    if(p.gymId===S.gym){
     const n=[p.name,p.surname].filter(v=>typeof v==='string'&&v.trim()).join(' ').trim();
     if(n)athleteNames.set(id,n.slice(0,130));
    }
   }
  }catch(e){/* Il calendario resta fruibile anche se un profilo e' non leggibile. */}
 }));
 renderStaff();
}
const staffAthleteName=id=>athleteNames.get(id)||'Atleta';
const initialConfig=()=>({active:false,services:{fighter:true,pesi:true},durations:{fighter:60,pesi:60},noticeHours:12,cancelHours:12,maxDays:30,mode:'always',from:'',to:'',weekly:Object.fromEntries(K.map(k=>[k,{enabled:false,ranges:[['09:00','13:00']]}])),exceptions:{},holidays:[],lastPreparedDate:''});
function fromSaved(c){const d=initialConfig();if(!c)return d;
 const ranged=(r)=>Array.isArray(r)?r.map(v=>Array.isArray(v)?v:[v.from,v.to]).filter(v=>v.length===2):[];
 const out={...d,...c,services:{...d.services,...c.services},durations:{...d.durations,...c.durations},weekly:{},exceptions:{},holidays:Array.isArray(c.holidays)?c.holidays:[]};
 for(const k of K){const v=c.weekly?.[k]||d.weekly[k];out.weekly[k]={enabled:!!v.enabled,ranges:ranged(v.ranges)}}
 for(const [date,v] of Object.entries(c.exceptions||{}))out.exceptions[date]={enabled:!!v.enabled,ranges:ranged(v.ranges)};
 return out;
}
function forSaved(c,uid,name,activeOverride){return {coachId:uid,displayName:name,active:activeOverride??c.active,services:{...c.services},durations:{...c.durations},noticeHours:c.noticeHours,cancelHours:c.cancelHours,maxDays:c.maxDays,mode:c.mode,from:c.from,to:c.to,weekly:Object.fromEntries(K.map(k=>[k,{enabled:c.weekly[k].enabled,ranges:c.weekly[k].ranges.map(([from,to])=>({from,to}))}])),exceptions:Object.fromEntries(Object.entries(c.exceptions).map(([day,v])=>[day,{enabled:v.enabled,ranges:v.ranges.map(([from,to])=>({from,to}))}])),holidays:c.holidays.map(x=>({from:x.from,to:x.to})),lastPreparedDate:c.lastPreparedDate||'',updatedAt:serverTimestamp()}}
function dayRanges(c,date){if(!c?.active||c.mode==='period'&&(date<c.from||date>c.to)||c.holidays?.some(h=>h.from<=date&&date<=h.to))return [];
 const v=c.exceptions?.[date]||c.weekly?.[K[mondayIndex(date)]];return v?.enabled?v.ranges||[]:[]}
function localSlotAllowed(c,ms){const p=romeParts(ms);return dayRanges(c,p.date).some(([a,b])=>mm(a)<=p.minute&&p.minute<mm(b))}
function slotsWanted(c,fromMs,toMs){const wanted=new Map();if(!c.active)return wanted;
 for(let ms=Math.ceil(fromMs/SLOT_MS)*SLOT_MS;ms<toMs;ms+=SLOT_MS){if(localSlotAllowed(c,ms))wanted.set(ms,true)}return wanted}
function futureBounds(maxDays){const now=Date.now();return {from:Math.floor(now/SLOT_MS)*SLOT_MS,until:now+Math.min(30,maxDays)*DAY_MS}}
function tokenError(e){const code=String(e?.code||'');if(code.includes('permission-denied'))return 'Permesso negato: prima occorre verificare e attivare le regole Spark. Nessun dato è stato modificato.';if(code.includes('failed-precondition'))return 'Operazione non disponibile: riprova online o verifica gli indici Firestore.';if(code.includes('aborted'))return 'La disponibilità è cambiata durante la prenotazione. Scegli un altro orario.';return String(e?.message||'Operazione non riuscita.').slice(0,220)}
function toast(message,bad=false){const el=$('toast');el.textContent=message;el.classList.toggle('bad',bad);el.classList.remove('hide');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.add('hide'),5200)}
function status(msg,bad=false){const el=$('global-status');el.textContent=msg;el.classList.toggle('error',bad);el.classList.remove('hide')}
function ask(title,msg){return new Promise(resolve=>{const el=$('modal'),yes=$('modal-yes'),no=$('modal-no');$('modal-title').textContent=title;$('modal-msg').textContent=msg;el.classList.remove('hide');const finish=v=>{el.classList.add('hide');yes.onclick=null;no.onclick=null;resolve(v)};yes.onclick=()=>finish(true);no.onclick=()=>finish(false)})}
function validTime(v){return /^([01]\d|2[0-3]):(00|30)$/.test(v)}
function validateConfig(c){if(![60,120].includes(c.durations.fighter)||![60,120].includes(c.durations.pesi))return 'Durate supportate: 60 o 120 minuti.';
 if(!Number.isInteger(c.noticeHours)||c.noticeHours<0||c.noticeHours>168)return 'Preavviso: da 0 a 168 ore.';
 if(!Number.isInteger(c.cancelHours)||c.cancelHours<0||c.cancelHours>168)return 'Disdetta: da 0 a 168 ore.';
 if(!Number.isInteger(c.maxDays)||c.maxDays<1||c.maxDays>30)return 'Prenotazioni consentite entro 1–30 giorni.';
 if(c.mode==='period'&&(!c.from||!c.to||c.from>c.to))return 'Periodo non valido.';
 for(const k of K){const r=c.weekly[k].ranges;if(r.length>4)return `${k}: massimo quattro fasce`;
  for(let i=0;i<r.length;i++){const [a,b]=r[i];if(!validTime(a)||!validTime(b)||mm(a)>=mm(b))return `${k}: fascia non valida`;if(i&&mm(r[i-1][1])>mm(a))return `${k}: fasce sovrapposte`}}
 for(const [d,v] of Object.entries(c.exceptions)){if(!/^\d{4}-\d\d-\d\d$/.test(d))return 'Data eccezione non valida';for(const [a,b]of v.ranges){if(!validTime(a)||!validTime(b)||mm(a)>=mm(b))return 'Orario eccezione non valido'}}
 for(const h of c.holidays){if(!/^\d{4}-\d\d-\d\d$/.test(h.from)||!/^\d{4}-\d\d-\d\d$/.test(h.to)||h.from>h.to)return 'Periodo ferie non valido'}return null}
const S={uid:null,gym:null,role:null,name:'',coaches:[],bookings:[],category:null,coach:null,discipline:null,date:null,slot:null,month:null,monthDays:{},occupiedReady:false,history:'next',view:'day',staffDate:null,staffCoach:'all',staffCategory:'all',config:null,dirtySettings:false,pending:false,unsubs:[],unsubDays:null,unsubBookings:null,staffKey:null,autoPrepared:null};
const getCoach=()=>S.coaches.find(c=>c.id===S.coach);
const shade=id=>id==='all'?'#b4c8c1':coachColor(id);
const configsRef=()=>collection(db,'gyms',S.gym,'spark_booking_coaches');
const slotsRef=()=>collection(db,'gyms',S.gym,'spark_booking_slots');
const bookingsRef=()=>collection(db,'gyms',S.gym,'spark_booking_reservations');
const configRef=id=>doc(db,'gyms',S.gym,'spark_booking_coaches',id);
const slotRef=(id,ms)=>doc(db,'gyms',S.gym,'spark_booking_slots',slotId(id,ms));
function indexRange(coachId,from,to){return query(slotsRef(),where(documentId(),'>=',slotId(coachId,from)),where(documentId(),'<=',slotId(coachId,to)))}
function activateView(id){qsa('#app > section').forEach(el=>el.classList.toggle('hide',el.id!=='view-'+id));qsa('#main-tabs button').forEach(el=>el.classList.toggle('active',el.dataset.view===id));if(id==='staff'){staffListen();renderStaff()}else if(id==='settings')renderSettings();else if(id==='book')renderBook();else renderMine()}
function nav(){const views=S.role==='admin'?[['staff','Calendario coach'],['settings','Disponibilità']]:[['book','Prenota'],['mine','Le mie prenotazioni']];$('main-tabs').innerHTML=views.map(([id,name])=>`<button type="button" class="chip" data-view="${id}">${name}</button>`).join('');qsa('#main-tabs button').forEach(b=>b.onclick=()=>activateView(b.dataset.view));activateView(S.role==='admin'?'staff':'book')}
function beginListeners(){S.unsubs.push(onSnapshot(configsRef(),snap=>{S.coaches=snap.docs.map(d=>({id:d.id,...fromSaved(d.data())})).sort((a,b)=>coachName(a).localeCompare(coachName(b),'it'));
 if(S.role==='admin'){const me=S.coaches.find(c=>c.id===S.uid);if(!S.dirtySettings)S.config=fromSaved(me);if(me?.active&&me.lastPreparedDate!==dateIT()&&S.autoPrepared!==dateIT()&&!S.pending){S.autoPrepared=dateIT();setTimeout(()=>syncAvailability(S.config,true).catch(e=>toast('Aggiornamento disponibilità: '+tokenError(e),true)),200)}if(!$('view-settings').classList.contains('hide')&&!S.dirtySettings)renderSettings();renderStaff()}
 else {if(S.coach&&!S.coaches.some(c=>c.id===S.coach)){S.coach=null;clearDayListener()}renderBook()}
 },e=>status('Coach non disponibili: '+tokenError(e),true)));
 if(S.role==='athlete'){S.unsubs.push(onSnapshot(query(bookingsRef(),where('athleteId','==',S.uid)),snap=>{S.bookings=snap.docs.map(d=>({id:d.id,...d.data()}));renderMine()},e=>status('Le tue prenotazioni: '+tokenError(e),true)))}
}
function clearDayListener(){S.unsubDays?.();S.unsubDays=null;S.monthDays={};S.occupiedReady=false}
function listenMonth(){clearDayListener();if(!S.coach)return;const coach=S.coach,m=S.month;
 const from=new Date(monthStart(m)+'T00:00:00Z').getTime()-DAY_MS;
 const to=new Date(monthStart(addMonth(m,1))+'T00:00:00Z').getTime()+DAY_MS;
 S.unsubDays=onSnapshot(indexRange(coach,from,to),snap=>{if(S.coach!==coach||S.month!==m)return;const days={};for(const d of snap.docs){const row=d.data(),ms=stampMs(row.startAt),p=romeParts(ms);(days[p.date]??=[]).push({id:d.id,ms,status:row.status,bookingId:row.bookingId})}S.monthDays=days;S.occupiedReady=true;renderCalendar();renderSlots()},e=>{S.occupiedReady=false;status('Disponibilità non leggibili: '+tokenError(e),true);renderCalendar();renderSlots()})}
function candidateSlots(c,date,service){if(!c?.active||!c.services?.[service]||!S.occupiedReady)return [];
 const duration=Number(c.durations[service]),arr=S.monthDays[date]||[],byMs=new Map(arr.map(x=>[x.ms,x])),minMs=Date.now()+Number(c.noticeHours||0)*3600000;
 if(![60,120].includes(duration)||date<dateIT()||date>plusDays(dateIT(),Math.min(c.maxDays,30)))return [];
 const result=[];for(const row of arr){const end=row.ms+duration*60000;if(romeParts(end-1).date!==date)continue;
 const segments=Array.from({length:duration/30},(_,i)=>byMs.get(row.ms+i*SLOT_MS));
 const allowed=segments.every((s,i)=>s&&localSlotAllowed(c,row.ms+i*SLOT_MS));if(!allowed)continue;
 const busy=segments.some(s=>s.status!=='open'||s.bookingId);const late=row.ms<=minMs;
 const p=romeParts(row.ms);result.push({id:new Date(row.ms).toISOString(),ms:row.ms,start:p.time,end:romeParts(end).time,free:!busy&&!late,busy,late});}
 return result.sort((a,b)=>a.ms-b.ms)}
function chooseCategory(cat){S.category=cat;S.coach=null;S.slot=null;S.discipline=DISC[cat][0];clearDayListener();qsa('.service').forEach(b=>b.classList.toggle('active',b.dataset.category===cat));$('book-steps').classList.remove('hide');$('book-details').classList.add('hide');renderCoaches()}
function renderCoaches(){if(!S.category)return;const list=S.coaches.filter(c=>c.active&&c.services[S.category]);$('coach-list').innerHTML=list.length?list.map(c=>`<button type="button" class="coachcard ${S.coach===c.id?'active':''}" data-id="${html(c.id)}"><span class="avatar">${html(coachName(c).slice(0,1).toUpperCase())}</span><span class="grow"><strong>${html(coachName(c))}</strong><span class="muted small" style="display:block">${S.category==='fighter'?'Lezione privata Fighter':'Scheda e consulenza Pesi'} · ${c.durations[S.category]} min</span></span><span>›</span></button>`).join(''):'<div class="empty">Nessun coach ha ancora preparato gli orari per questo servizio.</div>';
 qsa('#coach-list button').forEach(b=>b.onclick=()=>{S.coach=b.dataset.id;S.date=dateIT();S.month=S.date.slice(0,7);S.slot=null;$('book-details').classList.remove('hide');$('discipline').innerHTML=DISC[S.category].map(x=>`<option value="${html(x)}">${html(x==='K1'?'K-1':x)}</option>`).join('');S.discipline=DISC[S.category][0];renderCoaches();listenMonth();renderBook()})}
function renderBook(){if(S.role!=='athlete'||$('view-book').classList.contains('hide'))return;if(S.category)renderCoaches();if(S.coach){$('book-details').classList.remove('hide');renderCalendar();renderSlots()}}
function renderCalendar(){if(!S.coach)return;const first=mondayIndex(monthStart(S.month)),last=Number(monthEnd(S.month).slice(-2));$('cal-title').textContent=new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(monthStart(S.month)+'T12:00:00Z'));
 $('cal-prev').disabled=S.month<=dateIT().slice(0,7);$('cal-next').disabled=S.month>=plusDays(dateIT(),30).slice(0,7);
 let h=['L','M','M','G','V','S','D'].map(x=>`<span class="weekday">${x}</span>`).join('');for(let i=0;i<first;i++)h+='<span></span>';
 for(let n=1;n<=last;n++){const date=S.month+'-'+pad(n),available=S.occupiedReady&&candidateSlots(getCoach(),date,S.category).some(x=>x.free);h+=`<button type="button" class="day ${available?'':'off'} ${S.date===date?'selected':''}" data-day="${date}" ${available?'':'disabled'}><span>${n}</span>${available?'<small>Libero</small>':''}</button>`}
 $('cal-days').innerHTML=h;qsa('#cal-days button[data-day]').forEach(b=>b.onclick=()=>{S.date=b.dataset.day;S.slot=null;renderCalendar();renderSlots()})}
function renderSlots(){if(!S.coach)return;const c=getCoach();$('slots-date').textContent=fmtDate(S.date);const arr=S.occupiedReady?candidateSlots(c,S.date,S.category):[];
 $('slots-list').innerHTML=!S.occupiedReady?'<div class="empty">Caricamento disponibilità…</div>':!arr.length?'<div class="empty">Nessun orario disponibile per questa data.</div>':arr.map(x=>`<button type="button" class="slot ${x.free?'':'booked'} ${S.slot===x.id?'selected':''}" data-slot="${html(x.id)}" ${x.free?'':'disabled'}><strong>${x.start}–${x.end}</strong><small>${x.busy?'Occupato':x.late?'Preavviso minimo':'Libero'}</small></button>`).join('');
 qsa('#slots-list button[data-slot]').forEach(b=>b.onclick=()=>{S.slot=b.dataset.slot;renderSlots()});const chosen=arr.find(x=>x.id===S.slot&&x.free);if(!chosen)S.slot=null;
 $('book-summary').textContent=chosen?`${S.discipline} · ${fmtDate(S.date)} ${chosen.start}–${chosen.end}`:'Seleziona un orario libero';
 $('book-sub').textContent=`Coach ${coachName(c)} · ${c?.durations[S.category]||60} minuti · ${S.category==='fighter'?'Fighter':'Pesi'}`;$('book-submit').disabled=!S.slot||S.pending||!navigator.onLine}
function calendarChange(offset){const m=addMonth(S.month,offset);if(m<dateIT().slice(0,7)||m>plusDays(dateIT(),30).slice(0,7))return;S.month=m;S.date=monthStart(m);S.slot=null;listenMonth();renderCalendar()}
async function submitBooking(){if(!SPARK_WRITES_ENABLED){toast('Prenotazioni non ancora abilitate in questa versione.',true);return}if(S.pending||!S.coach||!S.slot||!navigator.onLine)return;const c=getCoach(),startMs=new Date(S.slot).getTime();if(!candidateSlots(c,S.date,S.category).some(x=>x.id===S.slot&&x.free)){toast('Orario non più disponibile.',true);return}
 if(!await ask('Conferma appuntamento',`${S.discipline} con ${coachName(c)} · ${fmtDate(S.date)}, ${romeParts(startMs).time}.`))return;
 S.pending=true;renderSlots();try{const bRef=doc(bookingsRef()),duration=c.durations[S.category],refs=Array.from({length:duration/30},(_,i)=>slotRef(S.coach,startMs+i*SLOT_MS));
  await runTransaction(db,async tx=>{const snaps=[];for(const ref of refs)snaps.push(await tx.get(ref));if(snaps.some(s=>!s.exists()||s.data().status!=='open'||s.data().bookingId!==''))throw Error('FASCIA_OCCUPATA');
   refs.forEach(ref=>tx.update(ref,{status:'booked',bookingId:bRef.id}));tx.set(bRef,{athleteId:S.uid,coachId:S.coach,service:S.category,discipline:S.discipline,startAt:Timestamp.fromMillis(startMs),durationMinutes:duration,status:'confirmed',createdAt:serverTimestamp()});},{maxAttempts:5});
  toast('Prenotazione confermata!');S.slot=null;activateView('mine');}
 catch(e){toast(String(e.message).includes('FASCIA_OCCUPATA')?'Qualcuno ha appena prenotato questo orario. Scegline un altro.':tokenError(e),true)}finally{S.pending=false;renderSlots()}}
const historic=b=>b.status==='cancelled'||stampMs(b.startAt)+b.durationMinutes*60000<=Date.now();
function cardBooking(b,staff=false){
 const start=stampMs(b.startAt),p=romeParts(start),end=romeParts(start+b.durationMinutes*60000),past=historic(b);
 const c=S.coaches.find(x=>x.id===b.coachId),service=b['service']==='fighter'?'FIGHTER':'PESI';
 const coach=coachName(c),athlete=staff?staffAthleteName(b.athleteId):'';
 const typeClass=b['service']==='fighter'?'lf-type-fighter':'lf-type-pesi';
 const accent=staff?shade(b.coachId):'#43cc89';
 const meta=staff?`<div class="lf29-athlete-name">Atleta: <strong>${html(athlete)}</strong></div>`:'';
 return `<article class="booking ${past?'mutedbook':''}" style="border-left-color:${accent}">
  <div class="flex between"><div class="lf29-booking-main">
    <div class="time">${html(p.date)} · ${p.time}–${end.time}</div>
    <h3>${html(b.discipline)}</h3>
    <div class="lf29-booking-identifiers"><span class="lf29-coach-name" style="--lf-coach-accent:${accent}">Coach ${html(coach)}</span><span class="lf29-service-tag ${typeClass}">${service}</span></div>
    ${meta}
  </div><span class="count">${b.status==='cancelled'?'Disdetto':past?'Concluso':'Confermato'}</span></div>
  ${b.status==='confirmed'&&!past?`<div class="actions"><button type="button" class="button danger sm" data-cancel="${html(b.id)}">Cancella appuntamento</button></div>`:''}
 </article>`;
}
function wireCancel(root){qsa('[data-cancel]',root).forEach(el=>el.onclick=()=>cancelOne(el.dataset.cancel))}
function renderMine(){if(S.role!=='athlete'||$('view-mine').classList.contains('hide'))return;const arr=S.bookings.filter(b=>S.history==='next'?!historic(b):historic(b)).sort((a,b)=>S.history==='next'?stampMs(a.startAt)-stampMs(b.startAt):stampMs(b.startAt)-stampMs(a.startAt));$('mine-list').innerHTML=arr.length?arr.map(b=>cardBooking(b)).join(''):'<div class="empty">Nessuna prenotazione da mostrare.</div>';qsa('#view-mine [data-history]').forEach(b=>b.classList.toggle('active',b.dataset.history===S.history));wireCancel($('mine-list'))}
async function cancelOne(id){if(!SPARK_WRITES_ENABLED){toast('Cancellazione non ancora abilitata.',true);return}const b=S.bookings.find(x=>x.id===id);if(!b||b.status!=='confirmed')return;const c=S.coaches.find(x=>x.id===b.coachId),cancelHours=c?.cancelHours??12;if(S.role==='athlete'&&stampMs(b.startAt)-Date.now()<=cancelHours*3600000){toast(`La disdetta richiede ${cancelHours} ore di preavviso. Contatta il coach.`,true);return}
 if(!await ask('Annullare appuntamento?',`${b.discipline} · ${romeParts(stampMs(b.startAt)).date} alle ${romeParts(stampMs(b.startAt)).time}.`))return;
 try{const ref=doc(bookingsRef(),id),startMs=stampMs(b.startAt),slotRefs=Array.from({length:b.durationMinutes/30},(_,i)=>slotRef(b.coachId,startMs+i*SLOT_MS));await runTransaction(db,async tx=>{
   const booking=await tx.get(ref),slots=[];for(const r of slotRefs)slots.push(await tx.get(r));if(!booking.exists()||booking.data().status!=='confirmed'||slots.some(s=>!s.exists()||s.data().status!=='booked'||s.data().bookingId!==id))throw Error('Prenotazione già modificata');
   tx.update(ref,{status:'cancelled',cancelledAt:serverTimestamp()});slotRefs.forEach(r=>tx.update(r,{status:'open',bookingId:''}));});toast('Appuntamento annullato.')}
 catch(e){toast(tokenError(e),true)}}
function staffListen(){if(S.role!=='admin'||!S.gym)return;const m=S.staffDate.slice(0,7),key=m;if(S.staffKey===key)return;S.staffKey=key;S.unsubBookings?.();
 const from=new Date(monthStart(m)+'T00:00:00Z').getTime()-7*DAY_MS,to=new Date(monthStart(addMonth(m,1))+'T00:00:00Z').getTime()+7*DAY_MS;
 S.unsubBookings=onSnapshot(query(bookingsRef(),where('startAt','>=',Timestamp.fromMillis(from)),where('startAt','<',Timestamp.fromMillis(to))),snap=>{S.bookings=snap.docs.map(d=>({id:d.id,...d.data()}));renderStaff();loadAthleteNames(S.bookings).catch(()=>{})},e=>status('Calendario: '+tokenError(e),true))}
function shownStaff(){return S.bookings.filter(b=>{const date=romeParts(stampMs(b.startAt)).date;if(S.staffCoach!=='all'&&b.coachId!==S.staffCoach)return false;if(S.staffCategory!=='all'&&b.service!==S.staffCategory)return false;if(S.history==='next'&&historic(b)||S.history==='history'&&!historic(b))return false;return S.view==='day'?date===S.staffDate:S.view==='week'?(date>=plusDays(S.staffDate,-mondayIndex(S.staffDate))&&date<=plusDays(S.staffDate,6-mondayIndex(S.staffDate))):date.slice(0,7)===S.staffDate.slice(0,7)}).sort((a,b)=>stampMs(a.startAt)-stampMs(b.startAt))}
function renderStaff(){
 if(S.role!=='admin'||$('view-staff').classList.contains('hide'))return;
 $('staff-coaches').innerHTML=[{id:'all',displayName:'Tutti'},...S.coaches].map(c=>`<button type="button" class="chip ${S.staffCoach===c.id?'active':''}" data-coach="${html(c.id)}"><span class="dot" style="background:${shade(c.id)}"></span>${html(coachName(c))}</button>`).join('');
 qsa('#staff-coaches button').forEach(b=>b.onclick=()=>{S.staffCoach=b.dataset.coach;renderStaff()});
 qsa('#view-staff [data-calendar]').forEach(b=>b.classList.toggle('active',b.dataset.calendar===S.view));
 qsa('#view-staff [data-history]').forEach(b=>b.classList.toggle('active',b.dataset.history===S.history));
 $('staff-date').value=S.staffDate;$('staff-category').value=S.staffCategory;
 $('staff-today').style.display=S.staffDate===dateIT()?'none':'';
 const events=shownStaff();$('staff-count').textContent=events.length+' appuntamenti';
 const heading=S.view==='day'?fmtDate(S.staffDate):S.view==='week'?`Settimana del ${fmtDate(plusDays(S.staffDate,-mondayIndex(S.staffDate)))}`:S.staffDate.slice(0,7);
 let content=`<h2>${html(heading)}</h2>`;
 if(S.view==='day')content+=events.length?'<div class="stack">'+events.map(b=>cardBooking(b,true)).join('')+'</div>':'<div class="empty">Nessun appuntamento.</div>';
 else if(S.view==='week'){
  const mon=plusDays(S.staffDate,-mondayIndex(S.staffDate));
  for(let i=0;i<7;i++){
   const d=plusDays(mon,i),rows=events.filter(b=>romeParts(stampMs(b.startAt)).date===d);
   content+=`<div class="week-box"><h3>${N[i]} · ${fmtDate(d)} <span class="count">${rows.length}</span></h3>${rows.map(b=>cardBooking(b,true)).join('')||'<span class="muted small">Nessuno</span>'}</div>`;
  }
 }else{
  const m=S.staffDate.slice(0,7);
  content+='<div class="month-grid">'+['L','M','M','G','V','S','D'].map(x=>`<div class="weekday">${x}</div>`).join('');
  for(let i=0;i<mondayIndex(monthStart(m));i++)content+='<span></span>';
  for(let n=1;n<=Number(monthEnd(m).slice(-2));n++){
   const d=m+'-'+pad(n),rows=events.filter(b=>romeParts(stampMs(b.startAt)).date===d);
   const count=rows.length,byCoach=new Map();
   rows.forEach(b=>byCoach.set(b.coachId,(byCoach.get(b.coachId)||0)+1));
   const names=[...byCoach].map(([id,num])=>{
    const c=S.coaches.find(x=>x.id===id);
    const name=coachName(c);
    return `<span class="lf29-month-coach" style="--lf-coach-accent:${shade(id)}" title="Coach ${html(name)}: ${num} appuntamenti"><span class="dot"></span>${num}</span>`;
   }).join('');
   content+=`<button type="button" class="month-cell ${S.staffDate===d?'current':''}" data-open-day="${d}" aria-label="${html(fmtDate(d))}: ${count} appuntamenti"><div class="n">${n}</div><div class="stat">${count?count+' appunt.':'—'}</div>${count?`<div class="lf29-month-coaches">${names}</div>`:''}</button>`;
  }
  content+='</div>';
 }
 $('staff-calendar').innerHTML=content;
 wireCancel($('staff-calendar'));
 qsa('[data-open-day]').forEach(b=>b.onclick=()=>{S.staffDate=b.dataset.openDay;S.view='day';renderStaff()});
}
function timeOptions(){let out='';for(let i=6*60;i<=22*60;i+=30)out+=`<option value="${hh(i)}">${hh(i)}</option>`;return out}
function readDayEditors(){const updated={};qsa('#weekly-editor .dayedit').forEach(box=>{const ranges=qsa('.range-row',box).map(r=>[r.querySelector('.range-start').value,r.querySelector('.range-end').value]).sort((a,b)=>a[0].localeCompare(b[0]));updated[box.dataset.key]={enabled:box.querySelector('.day-toggle').checked,ranges}});S.config.weekly=updated}
function renderWeekly(){const host=$('weekly-editor');host.innerHTML=K.map((key,i)=>{const c=S.config.weekly[key];return `<div class="dayedit" data-key="${key}"><div class="settingsrow"><b>${N[i]}</b><input type="checkbox" class="switch day-toggle" aria-label="Attiva ${N[i]}" ${c.enabled?'checked':''}></div><div class="range-container">${c.ranges.map((r,j)=>`<div class="range-row" data-index="${j}"><select class="field range-start">${timeOptions()}</select><select class="field range-end">${timeOptions()}</select><button type="button" class="button sm danger" data-rm="${key}-${j}">×</button></div>`).join('')}</div><button class="button sm ghost" type="button" data-add="${key}">+ Aggiungi fascia</button></div>`}).join('');
 qsa('#weekly-editor .dayedit').forEach(box=>{const key=box.dataset.key;qsa('.range-row',box).forEach((r,i)=>{r.querySelector('.range-start').value=S.config.weekly[key].ranges[i][0];r.querySelector('.range-end').value=S.config.weekly[key].ranges[i][1]});box.querySelector('.day-toggle').onchange=()=>{readDayEditors();S.dirtySettings=true;renderWeekly()}});
 qsa('[data-add]').forEach(b=>b.onclick=()=>{readDayEditors();if(S.config.weekly[b.dataset.add].ranges.length>=4){toast('Massimo quattro fasce.',true);return}S.config.weekly[b.dataset.add].ranges.push(['15:00','19:00']);S.dirtySettings=true;renderWeekly()});qsa('[data-rm]').forEach(b=>b.onclick=()=>{readDayEditors();const [k,n]=b.dataset.rm.split('-');S.config.weekly[k].ranges.splice(Number(n),1);S.dirtySettings=true;renderWeekly()});qsa('#weekly-editor select').forEach(el=>el.onchange=()=>{readDayEditors();S.dirtySettings=true})}
function renderExceptionList(){const items=Object.entries(S.config.exceptions||{}).sort(([a],[b])=>a.localeCompare(b));$('exception-list').innerHTML=items.map(([d,v])=>`<div class="dayedit flex between"><span>${fmtDate(d)} · ${v.enabled?v.ranges.map(x=>x.join('–')).join(', '):'Chiuso'}</span><button type="button" class="button sm danger" data-exdel="${d}">Rimuovi</button></div>`).join('')||'<p class="muted small">Nessuna eccezione</p>';qsa('[data-exdel]').forEach(b=>b.onclick=()=>{delete S.config.exceptions[b.dataset.exdel];S.dirtySettings=true;renderExceptionList()})}
function renderHolidays(){if(!$('holiday-list'))return;$('holiday-list').innerHTML=S.config.holidays.map((h,i)=>`<div class="dayedit flex between"><span>${fmtDate(h.from)} – ${fmtDate(h.to)}</span><button type="button" class="button sm danger" data-holiday="${i}">Rimuovi</button></div>`).join('')||'<p class="muted small">Nessuna chiusura per ferie.</p>';qsa('[data-holiday]').forEach(b=>b.onclick=()=>{S.config.holidays.splice(Number(b.dataset.holiday),1);S.dirtySettings=true;renderHolidays()})}
function renderSettings(){if(S.role!=='admin'||$('view-settings').classList.contains('hide'))return;const c=S.config||initialConfig();$('sett-active').checked=c.active;$('sett-fighter').checked=c.services.fighter;$('sett-pesi').checked=c.services.pesi;$('dur-fighter').value=String(c.durations.fighter);$('dur-pesi').value=String(c.durations.pesi);$('sett-notice').value=c.noticeHours;$('sett-cancel').value=c.cancelHours;$('sett-horizon').value=c.maxDays;qsa('input[name=sett-mode]').forEach(r=>r.checked=r.value===c.mode);$('sett-period').classList.toggle('hide',c.mode!=='period');$('sett-from').value=c.from;$('sett-to').value=c.to;renderWeekly();renderExceptionList();renderHolidays()}
function readSettings(){readDayEditors();const c=S.config;c.active=$('sett-active').checked;c.services.fighter=$('sett-fighter').checked;c.services.pesi=$('sett-pesi').checked;c.durations.fighter=Number($('dur-fighter').value);c.durations.pesi=Number($('dur-pesi').value);c.noticeHours=Number($('sett-notice').value);c.cancelHours=Number($('sett-cancel').value);c.maxDays=Number($('sett-horizon').value);c.mode=document.querySelector('input[name=sett-mode]:checked')?.value||'always';c.from=$('sett-from').value;c.to=$('sett-to').value;return c}
// Per mantenere il piano Spark, il calendario futuro viene materializzato SOLO
// quando un coach salva/apre la propria disponibilita'. Non esiste un cron server.
async function syncAvailability(c,automatic=false){if(!SPARK_WRITES_ENABLED){if(!automatic)toast('Disponibilità non ancora abilitata.',true);return}if(S.role!=='admin'||S.pending)return;const err=validateConfig(c);if(err)throw Error(err);if(!navigator.onLine)throw Error('Collegati a Internet prima di salvare la disponibilità.');S.pending=true;$('sett-save').disabled=true;
 const ref=configRef(S.uid),name=S.name.trim()||'Coach';let bookedDates=[];
 try{const {from,until}=futureBounds(c.maxDays),desired=slotsWanted(c,Date.now()+15*60000,until);const snap=await getDocs(indexRange(S.uid,from,until+DAY_MS));const existing=new Map(snap.docs.map(s=>[Number(s.id.slice(S.uid.length+1)),s]));
  // Prima disabilitiamo le prenotazioni. In caso di errore NON riattiviamo.
  await setDoc(ref,forSaved(c,S.uid,name,false));
  const del=[],add=[];for(const [ms,s]of existing){if(s.data().status==='booked'&&!desired.has(ms))bookedDates.push(romeParts(ms).date);if(s.data().status==='open'&&!desired.has(ms))del.push(s.ref)}
  for(const ms of desired.keys())if(!existing.has(ms))add.push(ms);
  // Documenti in blocchi piccoli; nessun overwrite degli slot gia' occupati.
  for(let i=0;i<del.length;i+=80){const b=writeBatch(db);del.slice(i,i+80).forEach(r=>b.delete(r));await b.commit()}
  for(let i=0;i<add.length;i+=80){const b=writeBatch(db);for(const ms of add.slice(i,i+80))b.set(slotRef(S.uid,ms),{coachId:S.uid,startAt:Timestamp.fromMillis(ms),endAt:Timestamp.fromMillis(ms+SLOT_MS),status:'open',bookingId:''});await b.commit()}
  c.lastPreparedDate=dateIT();await setDoc(ref,forSaved(c,S.uid,name,c.active));S.dirtySettings=false;
  if(!automatic)toast(`Disponibilità aggiornata. ${add.length} mezze ore aggiunte, ${del.length} ritirate.`);
  if(bookedDates.length)status(`Attenzione: ci sono appuntamenti confermati in ${new Set(bookedDates).size} giorni ora chiusi. Restano confermati: gestiscili dal Calendario coach.`,true);
 }catch(e){status('Salvataggio incompleto: prenotazioni disattivate per sicurezza. Controlla gli orari e riprova. '+tokenError(e),true);throw e}
 finally{S.pending=false;$('sett-save').disabled=false}}
function attachControls(){qsa('.service').forEach(b=>b.onclick=()=>chooseCategory(b.dataset.category));$('discipline').onchange=e=>{S.discipline=e.target.value;S.slot=null;renderSlots()};$('book-submit').onclick=submitBooking;$('cal-prev').onclick=()=>calendarChange(-1);$('cal-next').onclick=()=>calendarChange(1);
 qsa('[data-history]').forEach(b=>b.onclick=()=>{S.history=b.dataset.history;S.role==='admin'?renderStaff():renderMine()});qsa('[data-calendar]').forEach(b=>b.onclick=()=>{S.view=b.dataset.calendar;renderStaff()});$('staff-prev').onclick=()=>{S.staffDate=S.view==='month'?monthStart(addMonth(S.staffDate.slice(0,7),-1)):plusDays(S.staffDate,S.view==='week'?-7:-1);staffListen();renderStaff()};$('staff-next').onclick=()=>{S.staffDate=S.view==='month'?monthStart(addMonth(S.staffDate.slice(0,7),1)):plusDays(S.staffDate,S.view==='week'?7:1);staffListen();renderStaff()};$('staff-today').onclick=()=>{S.staffDate=dateIT();staffListen();renderStaff()};$('staff-date').onchange=e=>{S.staffDate=e.target.value;staffListen();renderStaff()};$('staff-category').onchange=e=>{S.staffCategory=e.target.value;renderStaff()};
 for(const v of ['fighter','pesi'])$('dur-'+v).innerHTML=[60,120].map(x=>`<option value="${x}">${x} minuti</option>`).join('');$('exception-from').innerHTML=timeOptions();$('exception-to').innerHTML=timeOptions();$('exception-from').value='15:00';$('exception-to').value='19:00';
 qsa('input[name=sett-mode]').forEach(b=>b.onchange=()=>{if(!b.checked)return;$('sett-period').classList.toggle('hide',b.value!=='period');S.dirtySettings=true});
 $('exception-add').onclick=()=>{readDayEditors();const date=$('exception-date').value,on=$('exception-type').value==='open',a=$('exception-from').value,b=$('exception-to').value;if(!/^\d{4}-\d\d-\d\d$/.test(date)||on&&(mm(a)>=mm(b)||!validTime(a)||!validTime(b))){toast('Eccezione non valida.',true);return}S.config.exceptions[date]={enabled:on,ranges:on?[[a,b]]:[]};S.dirtySettings=true;renderExceptionList()};
 $('exception-clear').onclick=()=>{const d=$('exception-date').value;if(d&&S.config.exceptions[d]){delete S.config.exceptions[d];S.dirtySettings=true;renderExceptionList()}};
 $('holiday-add').onclick=()=>{readDayEditors();const from=$('holiday-from').value,to=$('holiday-to').value;if(!/^\d{4}-\d\d-\d\d$/.test(from)||!/^\d{4}-\d\d-\d\d$/.test(to)||from>to){toast('Inserisci un periodo ferie valido.',true);return}S.config.holidays.push({from,to});S.dirtySettings=true;renderHolidays()};
 $('sett-save').onclick=()=>{const c=readSettings();syncAvailability(c).catch(e=>toast(tokenError(e),true))};
 qsa('#view-settings input:not(.day-toggle),#view-settings select').forEach(el=>el.addEventListener('change',()=>S.dirtySettings=true));window.addEventListener('online',()=>{$('online-pill').textContent='● Online'});window.addEventListener('offline',()=>{$('online-pill').textContent='● Offline';toast('Offline: non puoi confermare prenotazioni.',true)});
 setInterval(()=>S.role==='admin'?renderStaff():renderMine(),60000)}
function setupTheme(){const apply=v=>{document.documentElement.setAttribute('data-lion-theme',v);$('lf-theme-btn').textContent=v==='dark'?'☀ Tema chiaro':'☾ Tema scuro'};let saved='dark';try{saved=localStorage.getItem('lionfit_theme')||'dark'}catch(e){}apply(saved==='light'?'light':'dark');$('lf-theme-btn').onclick=()=>{const next=document.documentElement.getAttribute('data-lion-theme')==='dark'?'light':'dark';try{localStorage.setItem('lionfit_theme',next)}catch(e){}apply(next)}}
attachControls();setupTheme();
onAuthStateChanged(auth,async user=>{if(!user){location.replace('index.html');return}if(S.uid&&S.uid!==user.uid){location.reload();return}S.uid=user.uid;
 try{const profile=await getDoc(doc(db,'users',S.uid));if(!profile.exists())throw Error('Profilo mancante');const p=profile.data();if(!['admin','athlete'].includes(p.role)||!p.gymId)throw Error('Ruolo o palestra non validi');S.gym=p.gymId;S.role=p.role;S.name=[p.name,p.surname].filter(Boolean).join(' ');S.date=dateIT();S.month=S.date.slice(0,7);S.staffDate=S.date;S.config=initialConfig();
 $('user-caption').textContent=(S.role==='admin'?'Area Coach':'Area Atleta')+' · '+S.name;$('back-side').href=S.role==='admin'?'admin.html':'athlete.html';$('back-top').href=$('back-side').href;$('back-top').classList.remove('hide');$('loading').classList.add('hide');$('app').classList.remove('hide');$('online-pill').textContent=navigator.onLine?'● Online':'● Offline';nav();beginListeners()}
 catch(e){$('loading').textContent='Accesso non disponibile: '+tokenError(e)}});
