<script setup lang="ts">
/** PATCH-3 Live Cestino: tre categorie REALI, una sola lettura su richiesta.
 * Nessun deleteDoc, purge o spostamento di ID. Tutte le scritture richiedono
 * sessione Auth, autorizzazione LIVE, conferma umana e Rules lato server. */
import {ref,shallowRef,onMounted} from 'vue'
import {RouterLink} from 'vue-router'
import {collection,doc,getDocFromServer,getDocs,query,where,type QueryDocumentSnapshot,type DocumentData} from 'firebase/firestore'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {readStagingSession,type StagingSession} from '../integrations/firebase/stagingSession'
import {mayWriteLive} from '../integrations/firebase/stagingConfig'
import {coachAclEnforced} from '../features/athletes/coachAclV2'
import {restoreFromTrash} from '../integrations/firestore/sheets'
type Kind='shared'|'personal'|'week'
type Deleted={kind:Kind;id:string;title:string;athleteId:string;deletedAt:unknown}
const session=shallowRef<StagingSession|null>(null)
const athletes=ref<{id:string;name:string}[]>([]),selected=ref('')
const deleted=ref<Deleted[]>([]),loading=ref(true),busy=ref(false),error=ref(''),notice=ref('')
const asTime=(v:unknown):number=>{
 if(v&&typeof v==='object'&&'toMillis' in v&&typeof v.toMillis==='function')return v.toMillis() as number
 if(typeof v==='string')return Date.parse(v)||0
 if(typeof v==='number')return v
 return 0
}
const sortDeleted=(items:Deleted[])=>items.sort((a,b)=>asTime(b.deletedAt)-asTime(a.deletedAt)||a.id.localeCompare(b.id))
const mk=(kind:Kind,rows:QueryDocumentSnapshot<DocumentData>[],athleteId=''):Deleted[]=>rows.filter(x=>!!x.data().deletedAt).map(x=>({kind,id:x.id,athleteId,title:String(x.data().title||x.data().programTitle||x.data().name||x.id),deletedAt:x.data().deletedAt}))
async function refresh(){
 const s=session.value;if(!s)return
 loading.value=true;error.value=''
 try{
  const{db}=getStagingClients()
  // Legge solo i documenti che hanno deletedAt: evita di rileggere tutti i modelli attivi.
  const templates=await getDocs(query(collection(db,'gyms',s.gymId,'templates'),where('deletedAt','!=',null)))
  const items=mk('shared',templates.docs)
  if(selected.value){
   if(!athletes.value.some(x=>x.id===selected.value))throw new Error('Atleta non autorizzato.')
   const base=doc(db,'gyms',s.gymId,'athlete_programs',selected.value)
   const [personals,weeks]=await Promise.all([
    getDocs(query(collection(base,'personal_templates'),where('deletedAt','!=',null))),
    getDocs(query(collection(base,'weeks'),where('deletedAt','!=',null)))
   ])
   items.push(...mk('personal',personals.docs,selected.value),...mk('week',weeks.docs,selected.value))
  }
  deleted.value=sortDeleted(items)
 }catch(e){error.value='Errore di caricamento: '+(e instanceof Error?e.message:String(e));deleted.value=[]}
 finally{loading.value=false}
}
async function restore(item:Deleted){
 const s=session.value;if(!s||busy.value)return
 if(!mayWriteLive()){notice.value='Ripristino bloccato finché le Rules e la build Live non sono autorizzate.';return}
 if(item.kind!=='shared'&&!athletes.value.some(x=>x.id===item.athleteId)){notice.value='Atleta non autorizzato.';return}
 if(!window.confirm(`Ripristinare ${item.title} nel documento originale ${item.id}? Nessun ID sarà modificato.`))return
 busy.value=true;notice.value='';error.value=''
 try{
  const{db}=getStagingClients()
  await restoreFromTrash(db,s.gymId,item.kind,item.id,s.uid,item.kind==='shared'?undefined:item.athleteId)
  notice.value=`Ripristino completato con ID originale: ${item.id}`
  await refresh()
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
  const users=collection(db,'users')
  const athletesQuery=s.role==='titolare' || !coachAclEnforced()
   ?query(users,where('gymId','==',s.gymId),where('role','==','athlete'))
   :query(users,where('gymId','==',s.gymId),where('role','==','athlete'),where('coachUids','array-contains',s.uid))
  const roster=await getDocs(athletesQuery)
  athletes.value=roster.docs.map(x=>({id:x.id,name:String(x.data().name||x.id)})).sort((a,b)=>a.name.localeCompare(b.name,'it'))
  session.value=s
  await refresh()
 }catch(e){error.value='Cestino non leggibile: '+(e instanceof Error?e.message:String(e));loading.value=false}
})
</script>
<template><div class="stack">
 <section class="green-hero"><span class="eyebrow">FIREBASE · RIPRISTINO CONSERVATIVO</span><h1>Cestino</h1><p>Modelli Coach, schede personali e settimane. Nessuna eliminazione definitiva; gli ID originali restano invariati.</p></section>
 <section class="panel"><div class="row between"><h2>Elementi nel Cestino</h2><button class="secondary" :disabled="loading||busy" @click="refresh">↻ Aggiorna</button></div>
  <label>Atleta (per vedere schede personali e settimane)
   <select v-model="selected" :disabled="busy||loading" @change="refresh"><option value="">Solo modelli Coach</option><option v-for="a in athletes" :key="a.id" :value="a.id">{{a.name}}</option></select>
  </label>
  
  <p v-if="!mayWriteLive()" class="muted small">Operazioni di scrittura disabilitate in questa build. Per testarle utilizza soltanto Firebase Emulator.</p>
  <p v-if="error" role="alert" class="notice">{{error}}</p>
  <p v-if="notice" role="status" class="notice">{{notice}}</p>
  <p v-if="loading" role="status">Lettura degli elementi nel Cestino…</p>
  <p v-else-if="!error&&!deleted.length" class="muted">Nessun elemento cestinato per il filtro selezionato.</p>
  <article v-for="x in deleted" :key="x.kind+'-'+x.athleteId+'-'+x.id" class="line-card row between" style="gap:12px">
   <span><b>{{x.title}}</b><br/><small class="muted">{{x.kind==='shared'?'Modello Coach':x.kind==='personal'?'Scheda personale':'Settimana'}} · ID {{x.id}}</small></span>
   <button class="secondary" :disabled="busy||!mayWriteLive()" @click="restore(x)">↩ Ripristina</button>
  </article>
  <p class="muted small">Il ripristino delle settimane controlla tutti i collegamenti alle schede attive. Non sono previsti pulsanti di eliminazione fisica.</p>
  <RouterLink to="/coach/atleti" class="ghost">Torna alla gestione atleti</RouterLink>
 </section>
 </div></template>
