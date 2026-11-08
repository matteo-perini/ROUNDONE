<script setup lang="ts">
import {uiText,interfaceLanguage} from '../features/i18n/interfaceLanguage'
/** PATCH 4 — Cestino LIVE conservativo: panoramica senza filtri, con lettura su richiesta.
 * Legge modelli Coach + schede personali + settimane di tutti gli Atleti della palestra.
 * Ripristino senza delete fisico e con mantenimento degli ID originali. */
import {ref,shallowRef,onMounted} from 'vue'
import {RouterLink} from 'vue-router'
import {collection,doc,getDocFromServer,getDocs,query,where,type QueryDocumentSnapshot,type DocumentData} from 'firebase/firestore'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {readStagingSession,type StagingSession} from '../integrations/firebase/stagingSession'
import {mayWriteLive} from '../integrations/firebase/stagingConfig'
import {restoreFromTrash} from '../integrations/firestore/sheets'
import LionIcon from '../components/LionIcon.vue'

type Kind='shared'|'personal'|'week'
type Deleted={kind:Kind;id:string;title:string;athleteId:string;athleteName:string;deletedAt:unknown}
type Athlete={id:string;name:string}
const session=shallowRef<StagingSession|null>(null)
const athletes=ref<Athlete[]>([])
const deleted=ref<Deleted[]>([]),loading=ref(true),busy=ref(false),error=ref(''),notice=ref('')
const asTime=(v:unknown):number=>{
 if(v&&typeof v==='object'&&'toMillis' in v&&typeof v.toMillis==='function')return v.toMillis() as number
 if(v&&typeof v==='object'&&'seconds' in v&&typeof v.seconds==='number')return v.seconds*1000
 if(typeof v==='string')return Date.parse(v)||0
 if(typeof v==='number')return v
 return 0
}
const fmtDate=(v:unknown)=>{
 const t=asTime(v)
 if(!t||!Number.isFinite(t))return 'Data non disponibile'
 return new Intl.DateTimeFormat(interfaceLanguage.value==='en'?'en-GB':'it-IT',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(t))
}
const sortDeleted=(items:Deleted[])=>items.sort((a,b)=>asTime(b.deletedAt)-asTime(a.deletedAt)||a.id.localeCompare(b.id))
const mk=(kind:Kind,rows:QueryDocumentSnapshot<DocumentData>[],athlete?:Athlete):Deleted[]=>rows.filter(x=>!!x.data().deletedAt).map(x=>({kind,id:x.id,athleteId:athlete?.id||'',athleteName:athlete?.name||'',title:String(x.data().title||x.data().programTitle||x.data().name||x.id),deletedAt:x.data().deletedAt}))
const kindLabel=(kind:Kind)=>kind==='shared'?'Modello Coach':kind==='personal'?'Scheda personale':'Settimana'

let generation=0
async function refresh(){
 const s=session.value;if(!s||busy.value)return
 const request=++generation
 const gymId=s.gymId
 loading.value=true;error.value='';notice.value=''
 try{
  const {db}=getStagingClients()
  const templates=await getDocs(query(collection(db,'gyms',gymId,'templates'),where('deletedAt','!=',null)))
  const items=mk('shared',templates.docs)
  // Nessun filtro Atleta: carica anche le sottocollezioni personali e le settimane.
  // Concorrenza contenuta per non saturare Firebase sui roster più numerosi.
  const failures:string[]=[]
  let offset=0
  async function worker(){
   while(offset<athletes.value.length){
    const athlete=athletes.value[offset++]
    const base=doc(db,'gyms',gymId,'athlete_programs',athlete.id)
    try{
     const [personals,weeks]=await Promise.all([
      getDocs(query(collection(base,'personal_templates'),where('deletedAt','!=',null))),
      getDocs(query(collection(base,'weeks'),where('deletedAt','!=',null)))
     ])
     items.push(...mk('personal',personals.docs,athlete),...mk('week',weeks.docs,athlete))
    }catch{failures.push(athlete.name)}
   }
  }
  await Promise.all(Array.from({length:Math.min(4,athletes.value.length)},()=>worker()))
  if(request!==generation)return
  deleted.value=sortDeleted(items)
  if(failures.length)error.value=`Elenco parziale: impossibile leggere il Cestino di ${failures.length} atleti. Controlla le autorizzazioni e premi Aggiorna.`
 }catch(e){if(request===generation){error.value='Errore di caricamento: '+(e instanceof Error?e.message:String(e));deleted.value=[]}}
 finally{if(request===generation)loading.value=false}
}
async function restore(item:Deleted){
 const s=session.value;if(!s||busy.value)return
 if(!mayWriteLive()){notice.value='Ripristino disabilitato in questa build.';return}
 if(item.kind!=='shared'&&!athletes.value.some(x=>x.id===item.athleteId)){notice.value='Atleta non autorizzato.';return}
 if(!window.confirm(`Ripristinare «${item.title}» nel documento originale? L'ID ${item.id} non verrà modificato.`))return
 busy.value=true;notice.value='';error.value=''
 try{
  const{db}=getStagingClients()
  await restoreFromTrash(db,s.gymId,item.kind,item.id,s.uid,item.kind==='shared'?undefined:item.athleteId)
  notice.value=`«${item.title}» ripristinato con il suo ID originale.`
  // I dati rimangono in memoria finché il refresh, senza inventare uno stato di ripristino.
  deleted.value=deleted.value.filter(x=>!(x.kind===item.kind&&x.athleteId===item.athleteId&&x.id===item.id))
 }catch(e){error.value='Ripristino NON completato: '+(e instanceof Error?e.message:String(e))}
 finally{busy.value=false}
}
onMounted(async()=>{
 try{
  const s=await readStagingSession()
  if(s.role==='atleta')throw new Error('Accesso al Cestino consentito soltanto ai Coach.')
  const {db}=getStagingClients()
  const u=await getDocFromServer(doc(db,'users',s.uid))
  if(!u.exists()||u.data().role!=='admin'||u.data().gymId!==s.gymId)throw new Error('Identità e palestra non verificate.')
  const roster=await getDocs(query(collection(db,'users'),where('gymId','==',s.gymId),where('role','==','athlete')))
  athletes.value=roster.docs.map(x=>({id:x.id,name:String(x.data().name||x.id)})).sort((a,b)=>a.name.localeCompare(b.name,'it'))
  session.value=s
  await refresh()
 }catch(e){error.value='Cestino non leggibile: '+(e instanceof Error?e.message:String(e));loading.value=false}
})
</script>
<template>
 <div class="stack lf-trash" aria-label="Cestino Coach">
  <section class="lf-trash-hero">
   <div class="lf-trash-hero-icon"><LionIcon name="bin" :size="36"/></div>
   <div><span class="lf-trash-eyebrow">{{uiText("FIREBASE · RIPRISTINO CONSERVATIVO")}}</span><h1>{{uiText("Cestino")}}</h1><p>{{uiText("Elementi rimossi in modo conservativo. Puoi ripristinarli nella loro posizione originale, senza perdere ID e collegamenti.")}}</p></div>
  </section>
  <section class="lf-trash-panel">
   <header class="lf-trash-panel-head">
    <div class="lf-trash-panel-title"><LionIcon name="archive" :size="22"/><h2>{{uiText("Elementi nel Cestino")}}</h2><span v-if="!loading" class="lf-trash-count">{{deleted.length}} {{uiText("elementi")}}</span></div>
    <button type="button" class="secondary" :disabled="loading||busy||!session" @click="refresh"><LionIcon name="repeat" :size="16"/> {{uiText("Aggiorna")}}</button>
   </header>
   <p v-if="!mayWriteLive()" class="muted small">{{uiText("Ripristino non disponibile in questa build. Gli elementi restano consultabili.")}}</p>
   <p v-if="error" class="notice" role="alert">{{error}}</p>
   <p v-if="notice" class="notice" role="status">{{notice}}</p>
   <p v-if="loading" role="status" class="lf-trash-empty">{{uiText("Caricamento di modelli, schede personali e settimane della palestra…")}}</p>
   <p v-else-if="!error&&!deleted.length" class="lf-trash-empty">{{uiText("Il Cestino è vuoto. Nessun elemento da ripristinare.")}}</p>
   <div v-if="!loading && deleted.length" class="lf-trash-items">
    <article v-for="item in deleted" :key="item.kind+'-'+item.athleteId+'-'+item.id" class="lf-trash-item">
     <div class="lf-trash-type-icon"><LionIcon :name="item.kind==='week'?'calendar':item.kind==='personal'?'book':'archive'" :size="22"/></div>
     <div class="lf-trash-main"><h3>{{item.title}}</h3><div class="lf-trash-tags"><span>{{kindLabel(item.kind)}}</span><span v-if="item.athleteName">{{uiText("Atleta:")}} {{item.athleteName}}</span></div></div>
     <div class="lf-trash-meta"><span>{{uiText("Spostato nel Cestino")}}</span><strong>{{fmtDate(item.deletedAt)}}</strong></div>
     <div class="lf-trash-id"><span>{{uiText("ID originale")}}</span><small :title="item.id">{{item.id}}</small></div>
     <button type="button" class="primary lf-trash-restore" :disabled="busy||!mayWriteLive()" @click="restore(item)"><LionIcon name="repeat" :size="16"/> {{uiText("Ripristina")}}</button>
    </article>
   </div>
  </section>
  <section class="lf-trash-footer"><LionIcon name="info" :size="22"/><p><strong>{{uiText("Gli ID originali restano invariati.")}}</strong> {{uiText("Nessuna eliminazione definitiva: i collegamenti delle settimane vengono verificati prima del ripristino.")}}</p></section>
  <RouterLink class="lf-trash-back" to="/coach/atleti">{{uiText("← Torna alla gestione atleti")}}</RouterLink>
 </div>
</template>
<style scoped>
.lf-trash{gap:16px}
.lf-trash-hero{display:flex;align-items:center;gap:24px;padding:23px 25px;border:1px solid rgba(31,211,123,.32);border-radius:16px;background:linear-gradient(118deg,var(--card),rgba(12,112,73,.23));min-height:136px}
.lf-trash-hero-icon{flex:0 0 72px;height:72px;display:grid;place-items:center;border:1px solid var(--mint);border-radius:14px;background:var(--green-bg);color:var(--mint);box-shadow:0 0 22px rgba(5,210,96,.12)}
.lf-trash-eyebrow{color:var(--mint);letter-spacing:.17em;font-size:10px;font-weight:900}
.lf-trash-hero h1{margin:7px 0;font-size:27px}.lf-trash-hero p{color:var(--muted);margin:0;line-height:1.5;font-size:12px}
.lf-trash-panel{border:1px solid var(--border);background:var(--card);border-radius:16px;padding:17px}
.lf-trash-panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:15px}
.lf-trash-panel-head button{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
.lf-trash-panel-title{display:flex;align-items:center;gap:10px;min-width:0}.lf-trash-panel-title>svg{color:var(--mint);flex-shrink:0}.lf-trash-panel-title h2{font-size:17px;margin:0}
.lf-trash-count{font-size:10px;color:var(--muted);border:1px solid var(--border);border-radius:20px;padding:4px 9px}
.lf-trash-items{display:grid;gap:9px}
.lf-trash-item{display:grid;grid-template-columns:50px minmax(145px,1.9fr) minmax(145px,.9fr) minmax(105px,.85fr) auto;gap:12px;align-items:center;padding:13px;border:1px solid var(--border);border-radius:12px;background:var(--card2);min-width:0;transition:border-color .15s ease,transform .15s ease}
.lf-trash-item:hover{border-color:var(--mint);transform:translateY(-1px)}
.lf-trash-type-icon{height:46px;width:46px;display:grid;place-items:center;border-radius:11px;background:var(--green-bg);color:var(--mint)}
.lf-trash-main{min-width:0}.lf-trash-main h3{font-size:13px;margin:0 0 6px;overflow-wrap:anywhere}.lf-trash-tags{display:flex;flex-wrap:wrap;gap:6px}.lf-trash-tags span{font-size:10px;color:var(--muted)}
.lf-trash-meta,.lf-trash-id{display:flex;flex-direction:column;gap:6px;min-width:0;border-left:1px solid var(--border);padding-left:10px}
.lf-trash-meta span,.lf-trash-id span{font-size:10px;color:var(--muted)}
.lf-trash-meta strong{font-size:11px;font-weight:750}.lf-trash-id small{white-space:nowrap;text-overflow:ellipsis;overflow:hidden;font-size:10px}
.lf-trash-restore{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:37px;padding:7px 12px;white-space:nowrap}
.lf-trash-empty{padding:25px 12px;text-align:center;color:var(--muted);font-size:12px}
.lf-trash-footer{display:flex;align-items:center;gap:16px;border:1px solid rgba(18,180,103,.4);background:var(--green-bg);color:var(--text);padding:14px;border-radius:12px}
.lf-trash-footer svg{color:var(--mint);flex:0 0 auto}.lf-trash-footer p{margin:0;font-size:11px;line-height:1.5}.lf-trash-back{font-size:11px;color:var(--mint);width:fit-content}
@media(max-width:1100px){.lf-trash-item{grid-template-columns:44px minmax(130px,1fr) minmax(120px,.85fr) auto}.lf-trash-id{display:none}}
@media(max-width:680px){.lf-trash-hero{gap:12px;padding:14px;min-height:0}.lf-trash-hero-icon{flex-basis:50px;height:50px}.lf-trash-hero h1{font-size:21px}.lf-trash-panel{padding:11px}.lf-trash-panel-head{flex-wrap:wrap}.lf-trash-item{grid-template-columns:40px minmax(0,1fr) auto;gap:8px;padding:10px}.lf-trash-type-icon{width:38px;height:38px}.lf-trash-meta{grid-column:2/4;border-left:0;padding-left:0}.lf-trash-restore{grid-column:2/4}.lf-trash-restore svg{display:block}}
@media(prefers-reduced-motion:reduce){.lf-trash-item{transition:none}.lf-trash-item:hover{transform:none}}
</style>
